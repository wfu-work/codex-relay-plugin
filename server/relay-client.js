import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { RelayError } from "./errors.js";
import { nowIso, randomId } from "./utils.js";
import { PROTOCOL_VERSION, unwrapRelayFrame, validateRelayWelcome, wrapRelayFrame } from "./protocol.js";
import { relayEndpointId, relaySpaceId } from "./config-store.js";
import { RelayTokenService } from "./relay-token-service.js";

const TERMINAL_RELAY_AUTH_CODES = new Set([
  "auth.token_expired",
  "auth.token_revoked",
  "auth.invalid_token",
  "auth.proof_required",
  "auth.proof_mismatch",
  "auth.proof_invalid",
  "auth.proof_expired",
  "auth.grant_required",
  "auth.grant_expired",
  "auth.grant_revoked",
  "auth.invalid_grant",
  "auth.refresh_invalid",
  "auth.refresh_rejected",
  "auth.replay",
  "auth.account_unavailable",
  "auth.revoked",
]);

export class RelayClient extends EventEmitter {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #attempt = 0;
  #manualClose = false;
  #token = null;
  #credential = null;
  #tokenService;
  #maxFrameSize = 10 * 1024 * 1024;
  #forceTokenRefresh = false;

  constructor(configStore, logger, options = {}) {
    super();
    this.configStore = configStore;
    this.logger = logger;
    this.#tokenService = options.tokenService || new RelayTokenService(configStore, logger, options);
    this.state = "disconnected";
    this.lastError = null;
    this.lastHeartbeat = null;
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
  }

  status() {
    return {
      state: this.state,
      lastError: this.lastError,
      lastHeartbeat: this.lastHeartbeat,
      connectedAt: this.connectedAt,
      connectionId: this.connectionId,
      features: [...this.features],
      reconnectAttempt: this.#attempt,
    };
  }

  async connect(credential) {
    if (["connected", "authenticating", "connecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Relay 地址");
    if (!spaceId) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Space ID");
    if (!relayEndpointId(config.relay)) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Relay Endpoint ID");
    const token = typeof credential === "string" ? credential : credential?.connectToken;
    if (credential !== undefined && !token) throw new RelayError("AUTH_FAILED", "尚未配置 Relay Token");
    if (credential === undefined) this.#credential = null;
    else if (typeof credential === "string") this.#credential = { connectToken: credential };
    else if (credential?.connectToken) this.#credential = { ...credential };
    this.#manualClose = false;
    return this.#open();
  }

  async test(credential, timeoutMs = 8_000) {
    const config = this.configStore.get();
    const supplied = typeof credential === "string" ? { connectToken: credential } : credential;
    if (!config.relay.url || !relaySpaceId(config.relay) || !relayEndpointId(config.relay)) {
      throw new RelayError("CONFIG_INCOMPLETE", "请先填写 Relay 地址、Space ID 和 Relay Endpoint ID");
    }
    const token = await this.#tokenService.usableToken({ credential: supplied });
    if (!token) throw new RelayError("CONFIG_INCOMPLETE", "请先填写 Connect Token");
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(config.relay.url);
      let settled = false;
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = setTimeout(() => {
        socket.close();
        finishReject(new RelayError("RELAY_TIMEOUT", "Relay 在测试时间内没有确认认证"));
      }, timeoutMs);
      socket.addEventListener("open", async () => {
        try {
          socket.send(JSON.stringify(await this.#hello(config, token, true)));
        } catch (error) {
          socket.close();
          finishReject(error);
        }
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "connect.welcome") {
            validateRelayWelcome(message);
            validateWelcomeIdentity(message, config);
            socket.close(1000, "test complete");
            finishResolve({ ok: true, connectionId: message.connectionId, protocolVersion: message.version });
          } else if (message.type === "relay.error") {
            socket.close();
            finishReject(new RelayError(message.code || "AUTH_FAILED", message.message || "Relay 拒绝连接"));
          }
        } catch (error) {
          socket.close();
          finishReject(new RelayError("INVALID_MESSAGE", `Relay 返回了无效消息：${error.message}`));
        }
      });
      socket.addEventListener("error", () => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", "无法连接 Relay"));
      });
      socket.addEventListener("close", (event) => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", `Relay 在认证前断开：${event.code}`));
      });
    });
  }

  disconnect(reason = "manual disconnect") {
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    if (this.#socket) this.#socket.close(1000, reason);
    this.#socket = null;
    this.#credential = null;
    this.#token = null;
    this.#forceTokenRefresh = false;
    this.state = "disconnected";
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
    this.emit("status", this.status());
  }

  send(message) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") return false;
    const config = this.configStore.get();
    const frame = wrapRelayFrame(message, config);
    if (frame?.to && !this.features.includes("directed-routing")) {
      const error = new RelayError(
        "DIRECTED_ROUTING_UNAVAILABLE",
        "当前 Relay 套餐不支持定向转发，敏感命令未发送",
      );
      this.lastError = error.message;
      this.logger.warn("relay", "Relay 未提供定向转发能力，已阻止目标消息", {
        code: error.code,
        target: frame.to,
      });
      this.emit("status", this.status());
      return false;
    }
    this.#socket.send(JSON.stringify(frame));
    return true;
  }

  async #open() {
    try {
      this.#token = await this.#tokenService.usableToken({
        force: this.#forceTokenRefresh,
        credential: this.#credential,
      });
      this.#forceTokenRefresh = false;
      if (typeof this.configStore.relayCredential === "function") {
        this.#credential = await this.configStore.relayCredential();
      }
    } catch (error) {
      this.#handleFailure(error);
      if (!this.#manualClose && !isTerminalRelayAuthCode(error?.code, this.#credential)) {
        this.#scheduleReconnect();
      }
      throw error;
    }
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    this.state = "connecting";
    this.lastError = null;
    this.emit("status", this.status());
    this.logger.info("relay", "正在连接 Relay", { url: config.relay.url, spaceId });
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(config.relay.url);
      this.#socket = socket;
      const authenticationTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new RelayError("RELAY_TIMEOUT", "Relay 认证超时"));
        }
        socket.close();
      }, 10_000);
      socket.addEventListener("open", async () => {
        this.state = "authenticating";
        this.emit("status", this.status());
        try {
          socket.send(JSON.stringify(await this.#hello(config, this.#token, false)));
        } catch (error) {
          this.#handleFailure(error);
          if (!settled) {
            settled = true;
            clearTimeout(authenticationTimeout);
            reject(error);
          }
          socket.close();
        }
      });
      socket.addEventListener("message", (event) => this.#handleMessage(event, { resolve, reject, settle: () => { settled = true; }, authenticationTimeout }));
      socket.addEventListener("error", () => {
        const error = new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket 连接失败");
        this.#handleFailure(error);
        if (!settled) {
          settled = true;
          clearTimeout(authenticationTimeout);
          reject(error);
        }
      });
      socket.addEventListener("close", (event) => {
        clearTimeout(authenticationTimeout);
        clearInterval(this.#heartbeat);
        this.#heartbeat = null;
        this.#socket = null;
        if (!settled) {
          settled = true;
          reject(new RelayError("RELAY_UNAVAILABLE", `Relay 在认证前断开：${event.code}`));
        }
        if (!this.#manualClose) this.#scheduleReconnect();
      });
    });
  }

  #handleMessage(event, handshake) {
    let message;
    try {
      const raw = String(event.data);
      if (Buffer.byteLength(raw, "utf8") > this.#maxFrameSize) {
        this.#socket?.close(1009, "message too large");
        throw new RelayError("INVALID_MESSAGE", "Relay 消息超过 maxFrameSize 限制");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "忽略 Relay 的无效 JSON", { message: error.message });
      return;
    }
    if (message.type === "connect.welcome") {
      if (this.state !== "authenticating") return;
      try {
        validateRelayWelcome(message);
        validateWelcomeIdentity(message, this.configStore.get());
        if (!Number.isInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
          throw new RelayError("INVALID_MESSAGE", "Relay welcome 缺少有效 maxFrameSize");
        }
      } catch (error) {
        clearTimeout(handshake.authenticationTimeout);
        this.#handleFailure(error);
        handshake.settle();
        handshake.reject(error);
        this.#socket?.close(1002, "invalid welcome");
        return;
      }
      clearTimeout(handshake.authenticationTimeout);
      this.state = "connected";
      this.connectedAt = nowIso();
      this.connectionId = message.connectionId;
      this.features = Array.isArray(message.features) ? message.features.filter((item) => typeof item === "string") : [];
      if (Number.isInteger(message.maxFrameSize) && message.maxFrameSize > 0) this.#maxFrameSize = message.maxFrameSize;
      this.#attempt = 0;
      this.lastError = null;
      this.#startHeartbeat();
      this.logger.info("relay", "Relay 已连接并完成认证", { connectionId: this.connectionId });
      this.emit("status", this.status());
      this.emit("connected", message);
      handshake.settle();
      handshake.resolve(this.status());
      return;
    }
    if (message.type === "relay.error") {
      const authenticating = this.state === "authenticating";
      const error = new RelayError(message.code || "RELAY_ERROR", message.message || "Relay 返回错误");
      if (error.code === "auth.token_expired" && this.#credential?.endpointGrant) {
        // A manually entered token may not carry expiresAt metadata. Once the
        // relay proves that token is expired, force the next reconnect through
        // the proof-bound Endpoint Grant instead of retrying the same token.
        this.#forceTokenRefresh = true;
      }
      if (isTerminalRelayAuthCode(error.code, this.#credential)) this.#manualClose = true;
      this.#handleFailure(error);
      if (authenticating) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.settle();
        handshake.reject(error);
        this.#socket?.close();
      }
      return;
    }
    if (message.type === "pong") {
      this.lastHeartbeat = nowIso();
      this.emit("status", this.status());
      return;
    }
    if (message.type === "stream.message" && message.protocol !== "codex.v1") return;
    const productMessage = unwrapRelayFrame(message);
    if (productMessage?.type === "codex.command") this.emit("command", productMessage);
  }

  async #hello(config, token, test) {
    const identity = await this.configStore.endpointIdentity();
    const spaceId = relaySpaceId(config.relay);
    const endpointId = relayEndpointId(config.relay);
    const requestId = randomId("hello");
    const issuedAt = Date.now();
    const nonce = crypto.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-v1",
      PROTOCOL_VERSION,
      requestId,
      spaceId,
      endpointId,
      "bridge",
      token,
      issuedAt,
      nonce,
    ].join("\n");
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8",
    });
    return {
      version: PROTOCOL_VERSION,
      type: "connect.hello",
      requestId,
      spaceId,
      endpointId,
      endpointType: "bridge",
      endpointName: config.relay.deviceName,
      token,
      endpointProof: {
        algorithm: "Ed25519",
        publicKey: identity.publicKey,
        issuedAt,
        nonce,
        signature: crypto.sign(null, Buffer.from(canonical), privateKey).toString("base64url"),
      },
      capabilities: ["threads", "turns", "streaming", "steer", "interrupt", "approvals", "sync-v1"],
      ...(test ? { test: true } : {}),
    };
  }

  #startHeartbeat() {
    clearInterval(this.#heartbeat);
    const seconds = this.configStore.get().relay.heartbeatSeconds;
    this.#heartbeat = setInterval(() => {
      this.send({
        version: PROTOCOL_VERSION,
        type: "ping",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: nowIso(),
      });
    }, seconds * 1000);
  }

  #handleFailure(error) {
    if (isTerminalRelayAuthCode(error?.code, this.#credential)) this.#manualClose = true;
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay 连接异常", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }

  #scheduleReconnect() {
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1000 + Math.floor(Math.random() * 500);
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay 已断开，计划重连", { attempt: this.#attempt, delayMs: delay });
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      this.#open().catch((error) => this.#handleFailure(error));
    }, delay);
  }
}

// A revoked, expired, or proof-mismatched credential cannot recover by
// reconnecting with the same first-frame token. Stop the retry loop and wait
// for the user to rotate the credential in the local dashboard.
function isTerminalRelayAuthCode(code, credential) {
  // relay-go closes an established session when its short-lived token reaches
  // expiry. A proof-bound Endpoint Grant can mint the next token, so allow the
  // normal reconnect path to run in that one case.
  if (code === "auth.token_expired" && credential?.endpointGrant) return false;
  return TERMINAL_RELAY_AUTH_CODES.has(code);
}

function validateWelcomeIdentity(message, config) {
  const expectedSpaceId = relaySpaceId(config.relay);
  const expectedEndpointId = relayEndpointId(config.relay);
  if (message.spaceId !== expectedSpaceId || message.endpointId !== expectedEndpointId) {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome 的 Space 或 Endpoint 与本机配置不一致");
  }
}
