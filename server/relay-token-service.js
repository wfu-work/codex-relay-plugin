import crypto from "node:crypto";
import { RelayError } from "./errors.js";
import { isLoopbackHostname, randomId } from "./utils.js";

const REFRESH_LEAD_MS = 60_000;
const MAX_RETRY_AFTER_MS = 10 * 60_000;

export class RelayTokenService {
  #refreshing = null;
  #refreshingKey = null;

  constructor(configStore, logger, options = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.fetch = options.fetch || globalThis.fetch;
  }

  /**
   * Resolve a credential that is safe to use for the next handshake.  The
   * object-returning variant is useful to connection owners because a refresh
   * also changes expiry metadata; keeping that metadata alongside the token
   * prevents a runtime override or a restart from scheduling the next refresh
   * from stale information.
   */
  async usableCredential({
    force = false,
    credential: suppliedCredential = null,
    // Connection tests can validate credentials that are still in an editor
    // draft.  Such a refresh must remain ephemeral; normal connector startup
    // and scheduled rotation keep the default durable behavior.
    persist = true,
  } = {}) {
    const credential = await this.#resolveCredential(suppliedCredential);
    const connectToken = typeof credential?.connectToken === "string"
      ? credential.connectToken
      : "";
    const endpointGrant = typeof credential?.endpointGrant === "string"
      ? credential.endpointGrant
      : "";
    if (!connectToken && !endpointGrant) {
      throw new RelayError("AUTH_FAILED", "尚未配置 Relay Connect Token 或 Endpoint Grant");
    }
    const hasExpiry = Number.isSafeInteger(credential.expiresAt) && credential.expiresAt > 0;
    // Older/manual pairings often contain a token and grant but no expiry
    // metadata. Treat that as unknown rather than as infinitely valid: the
    // first connection can refresh once and persist authoritative metadata.
    const expiring = !connectToken || !hasExpiry || credential.expiresAt <= Date.now() + REFRESH_LEAD_MS;
    if (!force && !expiring) return { ...credential };
    if (!endpointGrant) {
      // Without a grant there is no safe way to mint a replacement. An
      // unknown expiry is still usable for legacy/manual configurations; the
      // Relay will provide the definitive auth error if it is stale.
      if (!force && connectToken && (!hasExpiry || credential.expiresAt > Date.now())) {
        return { ...credential };
      }
      throw new RelayError("auth.grant_required", "Connect Token 已过期且未配置 Endpoint Grant");
    }
    if (Number.isSafeInteger(credential.grantExpiresAt) && credential.grantExpiresAt <= Date.now()) {
      throw new RelayError("auth.grant_expired", "Endpoint Grant 已过期，请重新签发凭证");
    }
    const refreshKey = `${await this.#refreshContextKey(credential)}\u0000${persist ? "persist" : "ephemeral"}`;
    let refreshPromise = this.#refreshing;
    if (!refreshPromise || this.#refreshingKey !== refreshKey) {
      refreshPromise = this.#refresh(credential, { persist });
      this.#refreshing = refreshPromise;
      this.#refreshingKey = refreshKey;
      // Attach both handlers so replacing an in-flight refresh for a different
      // pairing never creates an unhandled rejection. Only the promise that is
      // still current may clear the in-flight refresh slot.
      refreshPromise.then(
        () => this.#clearRefresh(refreshPromise),
        () => this.#clearRefresh(refreshPromise),
      );
    }
    try {
      return { ...(await refreshPromise) };
    } catch (error) {
      // A short network outage should not tear down an otherwise healthy
      // connection whose current token is still valid. The caller will retry
      // the refresh at the next scheduled interval. Never fall back after a
      // forced refresh or once the server-declared expiry has passed.
      if (
        error?.code !== "AUTH_CONTEXT_CHANGED"
        && !force
        && connectToken
        && (!hasExpiry || credential.expiresAt > Date.now())
      ) {
        this.logger?.warn?.("relay", "Connect Token 刷新暂时失败，继续使用当前凭证", {
          code: error.code,
          message: error.message,
        });
        return { ...credential };
      }
      throw error;
    }
  }

  async usableToken(options = {}) {
    const credential = await this.usableCredential(options);
    return credential?.connectToken || null;
  }

  async #refresh(credential, { persist = true } = {}) {
    const initialConfig = this.configStore.get();
    const initialRelay = initialConfig.relay || {};
    const identity = await this.configStore.endpointIdentity();
    const tokenEndpoint = resolveTokenEndpoint(credential.tokenEndpoint, initialRelay.url);
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
        redirect: "error",
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
      throw new RelayError("RELAY_UNAVAILABLE", `Connect Token 刷新失败：${error.message}`, {
        retryable: true,
      });
    }
    const body = await response.json().catch(() => null);
    const errorCode = typeof body?.data?.errorCode === "string"
      ? body.data.errorCode
      : null;
    const envelopeCode = Number.isInteger(body?.code) ? body.code : null;
    if (!response.ok || (envelopeCode !== null && envelopeCode !== 200)) {
      const retryable = isRetryableHttpStatus(response.status)
        || envelopeCode !== null && isRetryableHttpStatus(envelopeCode);
      const retryAfterMs = retryAfterMilliseconds(response.headers?.get?.("retry-after"));
      throw new RelayError(
        retryable ? "RELAY_RETRYABLE" : errorCode || "auth.refresh_rejected",
        body?.msg || `Connect Token 刷新被拒绝（HTTP ${response.status}）`,
        {
          retryable,
          status: response.status,
          relayCode: errorCode || envelopeCode,
          ...(retryAfterMs == null ? {} : { retryAfterMs }),
        },
      );
    }
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const now = Date.now();
    if (
      typeof data?.connectToken !== "string"
      || data.connectToken.length < 32
      || !/^[A-Za-z0-9_-]+$/.test(data.connectToken)
      || !Number.isSafeInteger(data.expiresAt)
      || data.expiresAt <= now
    ) {
      throw new RelayError("INVALID_MESSAGE", "Relay 返回了无效的刷新凭证");
    }
    validateRefreshContext(data, initialRelay, now);
    const grantExpiresAt = data.grantExpiresAt;
    if (grantExpiresAt !== undefined && grantExpiresAt !== null
      && (!Number.isSafeInteger(grantExpiresAt) || grantExpiresAt <= now)) {
      throw new RelayError("INVALID_MESSAGE", "Relay 返回了无效的授权凭证有效期");
    }
    const patch = {
      connectToken: data.connectToken,
      expiresAt: data.expiresAt,
      ...(credential.tokenEndpoint ? {} : { tokenEndpoint }),
      ...(Number.isSafeInteger(grantExpiresAt) ? { grantExpiresAt } : {}),
    };
    // A refresh request can outlive a dashboard edit, Space switch, or key
    // rotation. Do not write a response obtained for the old pairing into the
    // newly selected Space. ConfigStore implements the optional expected
    // context check; lightweight test stores can simply ignore the second arg.
    const currentConfig = this.configStore.get();
    const currentIdentity = await this.configStore.endpointIdentity();
    const contextChanged = currentConfig.relay?.url !== initialRelay.url
      || currentConfig.relay?.spaceId !== initialRelay.spaceId
      || currentConfig.relay?.endpointId !== initialRelay.endpointId
      || currentConfig.relay?.endpointType !== initialRelay.endpointType
      || currentIdentity?.publicKey !== identity?.publicKey;
    if (contextChanged) {
      // The pairing changed while the HTTP request was in flight. Never hand
      // the caller a token minted for the old Endpoint/Space context; the
      // owning client will start a fresh connection attempt for the new one.
      throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay 连接凭证已更新，请重新连接");
    }
    let currentCredential = null;
    let persistenceAvailable = false;
    if (typeof this.configStore.relayCredential === "function"
      || typeof this.configStore.persistedRelayCredential === "function") {
      persistenceAvailable = true;
      currentCredential = await this.#persistedCredential();
      if (persist && currentCredential && currentCredential.endpointGrant !== credential.endpointGrant) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay 连接凭证已更新，请重新连接");
      }
      // A custom refresh endpoint is part of the pairing context too.  If a
      // dashboard edit changes it while the request is in flight, accepting
      // the old response would either overwrite that edit or persist a token
      // obtained from an endpoint the user no longer selected.
      if (persist && currentCredential
        && (currentCredential.tokenEndpoint || "") !== (credential.tokenEndpoint || "")) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay 连接凭证已更新，请重新连接");
      }
    }
    // Protect against a second connector (or a dashboard edit) rotating the
    // same Grant while this HTTP request was in flight.  The persisted token
    // is the right compare-and-swap value even when CODEX_RELAY_TOKEN is set,
    // because the environment value is only a runtime override.
    let updatedValue = null;
    if (persist && (currentCredential || !persistenceAvailable)) {
      if (typeof this.configStore.updateRelayCredential !== "function") {
        throw new RelayError("AUTH_FAILED", "当前凭证存储不支持自动续期");
      }
      const expectedCredential = { endpointGrant: credential.endpointGrant };
      if (currentCredential && Object.hasOwn(currentCredential, "connectToken")) {
        expectedCredential.connectToken = currentCredential.connectToken;
      } else if (currentCredential) {
        expectedCredential.connectToken = null;
      }
      if (currentCredential && Object.hasOwn(currentCredential, "tokenEndpoint")) {
        expectedCredential.tokenEndpoint = currentCredential.tokenEndpoint;
      } else if (currentCredential) {
        expectedCredential.tokenEndpoint = null;
      }
      updatedValue = await this.configStore.updateRelayCredential(
        patch,
        expectedCredential,
      );
      if (updatedValue === null) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay 连接凭证已更新，请重新连接");
      }
    } else {
      // A connection test may use a Grant copied into the editor before the
      // user saves the pairing. There is no persisted record to update, and
      // writing the response would otherwise create a token-only credential
      // in the currently selected Space. Return the rotated value only for
      // this operation; saving the pairing will persist it afterwards. The
      // same ephemeral path is used when the editor explicitly supplies a
      // replacement Grant that has not been saved yet.
      this.logger?.info?.("relay", "使用未保存的 Endpoint Grant 完成本次连接测试");
    }
    // Keep compatibility with lightweight ConfigStore implementations that
    // historically returned void after persisting a refresh.
    // Keep the original proof-bound Grant even when a lightweight credential
    // store returns void or only the rotated token.  Losing it here would make
    // the next reconnect unable to schedule another renewal.
    const updated = persist
      ? {
          ...credential,
          ...(currentCredential || {}),
          ...(updatedValue || {}),
          ...patch,
        }
      : {
          ...credential,
          ...patch,
        };
    this.logger.info("relay", "Connect Token 已通过 Endpoint Grant 自动续期", {
      expiresAt: new Date(updated.expiresAt).toISOString(),
    });
    return updated;
  }

  #clearRefresh(promise) {
    if (this.#refreshing === promise) {
      this.#refreshing = null;
      this.#refreshingKey = null;
    }
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

  async #persistedCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      // ConfigStore accepts this option; lightweight test stores may simply
      // ignore the argument and return their only credential value.
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return this.#credential();
  }

  async #refreshContextKey(credential) {
    let config;
    try {
      config = this.configStore.get();
    } catch {
      config = {};
    }
    let identity;
    try {
      identity = await this.configStore.endpointIdentity();
    } catch {
      identity = {};
    }
    return [
      credential.endpointGrant || "",
      credential.tokenEndpoint || "",
      config.relay?.url || "",
      config.relay?.spaceId || "",
      config.relay?.endpointId || "",
      identity?.publicKey || "",
    ].join("\u0000");
  }

  async #resolveCredential(suppliedCredential) {
    const stored = await this.#credential();
    if (suppliedCredential === null || suppliedCredential === undefined) return stored;
    const supplied = typeof suppliedCredential === "string"
      ? { connectToken: suppliedCredential }
      : suppliedCredential;
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) return stored;
    // A caller may pass only the token (for example the CLI connector). Merge
    // the persisted grant and expiry metadata for this Space so a short-lived
    // token can still be renewed. Explicit fields always win.
    const hasTokenField = Object.hasOwn(supplied, "connectToken");
    const hasGrantField = Object.hasOwn(supplied, "endpointGrant");
    const merged = { ...(stored || {}), ...supplied };
    // An object containing only a Grant is an explicit grant-only pairing;
    // don't accidentally reuse a stale token from the previous pairing.
    if (hasGrantField && !hasTokenField) {
      delete merged.connectToken;
      delete merged.expiresAt;
    }
    if (
      typeof supplied.connectToken === "string"
      && supplied.connectToken
      && stored?.connectToken
      && supplied.connectToken !== stored.connectToken
    ) {
      if (!Object.hasOwn(supplied, "expiresAt")) delete merged.expiresAt;
      // A token-only draft that differs from the persisted token belongs to a
      // potentially different pairing. Do not silently attach the old
      // proof-bound Grant and mint a token for that previous pairing. Callers
      // that intend to rotate a token with the existing Grant must supply the
      // Grant explicitly (or leave the persisted token unchanged).
      if (!hasGrantField) {
        delete merged.endpointGrant;
        delete merged.grantExpiresAt;
      }
    }
    if (
      typeof supplied.endpointGrant === "string"
      && supplied.endpointGrant
      && stored?.endpointGrant
      && supplied.endpointGrant !== stored.endpointGrant
      && !Object.hasOwn(supplied, "grantExpiresAt")
    ) {
      // A newly pasted Grant must not inherit the previous Grant's expiry.
      // Otherwise an already-expired old pairing can make a valid draft look
      // unusable before the Relay has a chance to verify it.
      delete merged.grantExpiresAt;
    }
    return Object.keys(merged).length ? merged : null;
  }
}

function deriveTokenEndpoint(relayUrl) {
  try {
    const url = new URL(relayUrl);
    if (!['ws:', 'wss:'].includes(url.protocol)) return null;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/api/connect-tokens/refresh";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve and validate the HTTP endpoint used for a Grant refresh.
 *
 * The value may come from a persisted pairing (and therefore cannot be
 * assumed to have passed the current validator) or may be derived from the
 * WebSocket Relay URL.  Keep the same trust boundary at runtime: HTTPS is
 * required for remote hosts, while plain HTTP is accepted only for the
 * explicitly supported loopback development targets.
 */
function resolveTokenEndpoint(configured, relayUrl) {
  const raw = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : deriveTokenEndpoint(relayUrl);
  if (!raw) return null;
  try {
    const endpoint = new URL(raw);
    const loopback = isLoopbackHostname(endpoint.hostname);
    if (
      !["http:", "https:"].includes(endpoint.protocol)
      || !endpoint.hostname
      || endpoint.username
      || endpoint.password
      || endpoint.search
      || endpoint.hash
      || (endpoint.protocol !== "https:" && !loopback)
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

function isRetryableHttpStatus(status) {
  return Number.isInteger(status)
    && (status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599));
}

/** Parse an RFC 9110 Retry-After value into a bounded delay. */
function retryAfterMilliseconds(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isSafeInteger(seconds)) return MAX_RETRY_AFTER_MS;
    return Math.min(MAX_RETRY_AFTER_MS, seconds * 1_000);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()));
}

/**
 * A refresh response is allowed to omit identity fields for backwards
 * compatibility, but any identity it does include must describe this exact
 * pairing.  Treat a mismatch as a context error rather than accepting a
 * token minted for another Space/Endpoint.
 */
function validateRefreshContext(data, relay, now = Date.now()) {
  const expected = {
    spaceId: typeof relay?.spaceId === "string" ? relay.spaceId : "",
    endpointId: typeof relay?.endpointId === "string" ? relay.endpointId : "",
    endpointType: typeof relay?.endpointType === "string" && relay.endpointType
      ? relay.endpointType
      : "bridge",
  };
  for (const field of ["spaceId", "endpointId", "endpointType"]) {
    if (data?.[field] === undefined || data?.[field] === null) continue;
    if (typeof data[field] !== "string" || !data[field] || data[field] !== expected[field]) {
      throw new RelayError("AUTH_CONTEXT_CHANGED", `Relay 刷新响应的 ${field} 与当前配置不一致`);
    }
  }
  if (data?.grantExpiresAt !== undefined && data?.grantExpiresAt !== null
      && (!Number.isSafeInteger(data.grantExpiresAt) || data.grantExpiresAt <= now)) {
    throw new RelayError("INVALID_MESSAGE", "Relay 返回了无效的授权凭证有效期");
  }
}
