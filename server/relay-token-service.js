import crypto from "node:crypto";
import { RelayError } from "./errors.js";
import { randomId } from "./utils.js";

const REFRESH_LEAD_MS = 60_000;

export class RelayTokenService {
  #refreshing = null;

  constructor(configStore, logger, options = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.fetch = options.fetch || globalThis.fetch;
  }

  async usableToken({ force = false, credential: suppliedCredential = null } = {}) {
    const credential = suppliedCredential || await this.#credential();
    if (!credential?.connectToken) throw new RelayError("AUTH_FAILED", "尚未配置 Relay Connect Token");
    const expiring = Number.isSafeInteger(credential.expiresAt)
      && credential.expiresAt <= Date.now() + REFRESH_LEAD_MS;
    if (!force && !expiring) return credential.connectToken;
    if (!credential.endpointGrant) {
      if (!force && credential.expiresAt > Date.now()) return credential.connectToken;
      throw new RelayError("auth.grant_required", "Connect Token 已过期且未配置 Endpoint Grant");
    }
    if (Number.isSafeInteger(credential.grantExpiresAt) && credential.grantExpiresAt <= Date.now()) {
      throw new RelayError("auth.grant_expired", "Endpoint Grant 已过期，请重新签发凭证");
    }
    if (!this.#refreshing) {
      this.#refreshing = this.#refresh(credential).finally(() => {
        this.#refreshing = null;
      });
    }
    return (await this.#refreshing).connectToken;
  }

  async #refresh(credential) {
    const identity = await this.configStore.endpointIdentity();
    const tokenEndpoint = credential.tokenEndpoint || deriveTokenEndpoint(this.configStore.get().relay.url);
    if (!tokenEndpoint) throw new RelayError("auth.refresh_invalid", "未配置有效的 Token 刷新地址");
    const requestId = randomId("refresh");
    const issuedAt = Date.now();
    const nonce = crypto.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-token-v1",
      requestId,
      issuedAt,
      nonce,
      credential.endpointGrant,
    ].join("\n");
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8",
    });
    let response;
    try {
      response = await this.fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpointGrant: credential.endpointGrant,
          proof: {
            requestId,
            issuedAt,
            nonce,
            signature: crypto.sign(null, Buffer.from(canonical), privateKey).toString("base64url"),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new RelayError("RELAY_UNAVAILABLE", `Connect Token 刷新失败：${error.message}`);
    }
    const body = await response.json().catch(() => null);
    const errorCode = body?.data?.errorCode;
    if (!response.ok || (Number.isInteger(body?.code) && body.code !== 200)) {
      throw new RelayError(errorCode || "auth.refresh_rejected", body?.msg || `Connect Token 刷新被拒绝（HTTP ${response.status}）`);
    }
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    if (
      typeof data?.connectToken !== "string"
      || data.connectToken.length < 32
      || !/^[A-Za-z0-9_-]+$/.test(data.connectToken)
      || !Number.isSafeInteger(data.expiresAt)
      || data.expiresAt <= Date.now()
    ) {
      throw new RelayError("INVALID_MESSAGE", "Relay 返回了无效的刷新凭证");
    }
    if (typeof this.configStore.updateRelayCredential !== "function") {
      throw new RelayError("AUTH_FAILED", "当前凭证存储不支持自动续期");
    }
    const updated = await this.configStore.updateRelayCredential({
      connectToken: data.connectToken,
      expiresAt: data.expiresAt,
      ...(credential.tokenEndpoint ? {} : { tokenEndpoint }),
      ...(Number.isSafeInteger(data.grantExpiresAt) ? { grantExpiresAt: data.grantExpiresAt } : {}),
    });
    this.logger.info("relay", "Connect Token 已通过 Endpoint Grant 自动续期", {
      expiresAt: new Date(updated.expiresAt).toISOString(),
    });
    return updated;
  }

  async #credential() {
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential();
    }
    const token = typeof this.configStore.token === "function"
      ? await this.configStore.token()
      : typeof this.configStore.get === "function" ? await this.configStore.get() : null;
    if (typeof token === "string") return token ? { connectToken: token } : null;
    if (typeof token?.relay?.token === "string" && token.relay.token) {
      return { connectToken: token.relay.token };
    }
    return null;
  }
}

function deriveTokenEndpoint(relayUrl) {
  try {
    const url = new URL(relayUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/api/connect-tokens/refresh";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
