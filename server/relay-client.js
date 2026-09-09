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
  "auth.space_unavailable",
  "auth.endpoint_type_mismatch",
  "auth.revoked",
  "AUTH_CONTEXT_CHANGED",
  "handshake.invalid",
  "connection.kicked",
]);

const TOKEN_REFRESH_LEAD_MS = 60_000;
const UNKNOWN_EXPIRY_REFRESH_MS = 5 * 60_000;
const TOKEN_REFRESH_RETRY_MS = 15_000;

export class RelayClient extends EventEmitter {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #tokenRefreshTimer = null;
  #tokenRefreshInFlight = null;
  #tokenRefreshContextKey = null;
  #connectPromise = null;
  #socketGeneration = 0;
  #attempt = 0;
  #manualClose = false;
  #token = null;
  #credential = null;
  #tokenService;
  #maxFrameSize = 10 * 1024 * 1024;
  #forceTokenRefresh = false;
  #credentialRefreshBlocked = false;
  #rotationInProgress = false;
  #resourceRequests = new Map();

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
    if (this.#connectPromise) return this.#connectPromise;
    if (["connected", "authenticating", "connecting", "disconnecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Relay 地址");
    if (!spaceId) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Space ID");
    if (!relayEndpointId(config.relay)) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Relay Endpoint ID");
    const token = typeof credential === "string"
      ? credential.trim()
      : credential?.connectToken?.trim?.() || "";
    const grant = credential && typeof credential === "object"
      ? credential.endpointGrant?.trim?.() || ""
      : "";
    if (credential !== undefined && credential !== null && !token && !grant) {
      throw new RelayError("AUTH_FAILED", "尚未配置 Relay Connect Token 或 Endpoint Grant");
    }
    if (credential === undefined || credential === null) this.#credential = null;
    else if (typeof credential === "string") this.#credential = { connectToken: token };
    else this.#credential = {
      ...credential,
      ...(token ? { connectToken: token } : {}),
      ...(grant ? { endpointGrant: grant } : {}),
    };
    this.#manualClose = false;
    this.#credentialRefreshBlocked = false;
    this.#forceTokenRefresh = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    return this.#beginOpen();
  }

  async test(credential, timeoutMs = 8_000) {
    if (this.state === "connected") {
      return {
        ok: true,
        connectionId: this.connectionId,
        protocolVersion: PROTOCOL_VERSION,
        reused: true,
      };
    }
    if (["connecting", "authenticating", "reconnecting", "disconnecting"].includes(this.state)) {
      throw new RelayError("RELAY_BUSY", "Relay 正在连接或断开，请等待当前操作完成");
    }
    const config = this.configStore.get();
    const supplied = typeof credential === "string" ? { connectToken: credential } : credential;
    if (!config.relay.url || !relaySpaceId(config.relay) || !relayEndpointId(config.relay)) {
      throw new RelayError("CONFIG_INCOMPLETE", "请先填写 Relay 地址、Space ID 和 Relay Endpoint ID");
    }
    let storedCredential = null;
    if (typeof this.configStore.relayCredential === "function") {
      try {
        storedCredential = await this.configStore.relayCredential();
      } catch {
        // The handshake itself remains useful even when a lightweight or
        // temporarily unavailable credential store cannot be read here.
      }
    }
    const endpointGrant = supplied && typeof supplied === "object"
      && Object.hasOwn(supplied, "endpointGrant")
      ? supplied.endpointGrant?.trim?.() || ""
      : storedCredential?.endpointGrant?.trim?.() || "";
    // An editor may test a replacement token/Grant before saving it. Tell the
    // token service to keep that refresh ephemeral so it cannot overwrite the
    // credential currently persisted for this Space. Matching saved values
    // retain the normal durable refresh behavior.
    const draftCredential = hasDifferentCredentialFields(supplied, storedCredential);
    const persistRefresh = !draftCredential;
    let token = await this.#tokenService.usableToken({
      credential: supplied,
      persist: persistRefresh,
    });
    if (!token) throw new RelayError("CONFIG_INCOMPLETE", "请先填写 Connect Token 或 Endpoint Grant");
    let refreshAttempted = false;
    while (true) {
      try {
        return await this.#testHandshake(config, token, timeoutMs);
      } catch (error) {
        // Expiry metadata can be missing or stale (for example after a
        // dashboard import). Let the Relay be authoritative and use the
        // proof-bound Grant once before surfacing the failure.
        if (!refreshAttempted && isRefreshableCredentialFailure(error) && endpointGrant) {
          token = await this.#tokenService.usableToken({
            force: true,
            credential: typeof supplied === "object" && supplied
              ? { ...supplied, connectToken: token }
              : { connectToken: token },
            persist: persistRefresh,
          });
          if (!token) throw new RelayError("CONFIG_INCOMPLETE", "刷新后仍未获得有效 Connect Token");
          refreshAttempted = true;
          continue;
        }
        throw error;
      }
    }
  }

  async #testHandshake(config, token, timeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(config.relay.url);
      let settled = false;
      let timeout;
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
      const closeAfter = () => {
        try {
          socket.close();
        } catch {
          // The result has already been settled; a platform-specific close
          // failure must not replace the authentication outcome.
        }
      };
      timeout = setTimeout(() => {
        finishReject(new RelayError("RELAY_TIMEOUT", "Relay 在测试时间内没有确认认证"));
        closeAfter();
      }, timeoutMs);
      socket.addEventListener("open", async () => {
        try {
          socket.send(JSON.stringify(await this.#hello(config, token, true)));
        } catch (error) {
          finishReject(error);
          closeAfter();
        }
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "connect.welcome") {
            validateRelayWelcome(message);
            validateWelcomeIdentity(message, config);
            finishResolve({ ok: true, connectionId: message.connectionId, protocolVersion: message.version });
            closeAfter();
          } else if (message.type === "relay.error") {
            finishReject(new RelayError(message.code || "AUTH_FAILED", message.message || "Relay 拒绝连接"));
            closeAfter();
          }
        } catch (error) {
          finishReject(new RelayError("INVALID_MESSAGE", `Relay 返回了无效消息：${error.message}`));
          closeAfter();
        }
      });
      socket.addEventListener("error", () => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", "无法连接 Relay"));
      });
      socket.addEventListener("close", (event) => {
        if (!settled) finishReject(new RelayError("RELAY_UNAVAILABLE", `Relay 在认证前断开：${event.code}`));
      });
    });
  }

  async disconnect(reason = "manual disconnect") {
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    clearTimeout(this.#tokenRefreshTimer);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    this.#tokenRefreshTimer = null;
    this.#rotationInProgress = false;
    const socket = this.#socket;
    const opening = this.#connectPromise;
    this.#credential = null;
    this.#token = null;
    this.#forceTokenRefresh = false;
    this.#credentialRefreshBlocked = false;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay 连接已断开"));
    }
    this.#resourceRequests.clear();
    const shouldWait = Boolean(opening) || Boolean(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING));
    this.state = shouldWait ? "disconnecting" : "disconnected";
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
    this.emit("status", this.status());
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      await closeSocket(socket, reason);
    }
    if (opening) await opening.catch(() => {});
    this.#socketGeneration += 1;
    this.#socket = null;
    this.state = "disconnected";
    this.emit("status", this.status());
    return this.status();
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
    const encoded = JSON.stringify(frame);
    if (Buffer.byteLength(encoded, "utf8") > this.#maxFrameSize) {
      this.lastError = "待发送消息超过 Relay maxFrameSize 限制";
      this.logger.warn("relay", "已阻止超过 maxFrameSize 的消息", {
        bytes: Buffer.byteLength(encoded, "utf8"),
        maxFrameSize: this.#maxFrameSize,
        type: message?.type,
      });
      this.emit("status", this.status());
      return false;
    }
    this.#socket.send(encoded);
    return true;
  }

  /** Upload an image over the authenticated data channel and receive a
   * short-lived capability URL from Relay. */
  uploadResource({ mime, data, ttlSeconds } = {}) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") {
      return Promise.reject(new RelayError("RELAY_UNAVAILABLE", "Relay 尚未连接，无法上传图片"));
    }
    if (!this.features.includes("resources-v1")) {
      return Promise.reject(new RelayError("RESOURCE_UNSUPPORTED", "当前 Relay 不支持受控图片资源"));
    }
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const frameBudget = Math.max(0, this.#maxFrameSize - 1024);
    const maxByFrame = Math.floor(frameBudget * 3 / 4);
    if (!bytes.length || bytes.length > Math.min(6 * 1024 * 1024, maxByFrame)) {
      return Promise.reject(new RelayError("RESOURCE_TOO_LARGE", "图片超过 6 MiB 限制"));
    }
    const requestId = randomId("resource");
    const frame = {
      version: PROTOCOL_VERSION,
      type: "stream.message",
      messageId: randomId("resource-msg"),
      streamId: "resources",
      from: relayEndpointId(this.configStore.get().relay),
      protocol: "codex.resource.v1",
      encrypted: false,
      payload: {
        type: "codex.resource.put",
        requestId,
        mime: typeof mime === "string" ? mime : "",
        data: bytes.toString("base64"),
        ...(Number.isInteger(ttlSeconds) ? { ttlSeconds } : {}),
      },
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#resourceRequests.delete(requestId);
        reject(new RelayError("RESOURCE_TIMEOUT", "Relay 图片资源上传超时"));
      }, 15_000);
      this.#resourceRequests.set(requestId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try {
        this.#socket.send(JSON.stringify(frame));
      } catch (error) {
        this.#resourceRequests.delete(requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  #beginOpen() {
    if (this.#connectPromise) return this.#connectPromise;
    const promise = this.#open();
    this.#connectPromise = promise;
    const clear = () => {
      if (this.#connectPromise === promise) this.#connectPromise = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  async #open() {
    try {
      const usableCredential = await this.#usableCredential({
        force: this.#forceTokenRefresh,
        credential: this.#credential,
      });
      this.#token = usableCredential?.connectToken || null;
      this.#credential = {
        ...(this.#credential || {}),
        ...(usableCredential || {}),
        ...(this.#token ? { connectToken: this.#token } : {}),
      };
      if (!this.#token) throw new RelayError("AUTH_FAILED", "尚未配置 Relay Connect Token");
      this.#forceTokenRefresh = false;
      const stored = await this.#authoritativeCredential();
      if (stored) {
        if (stored?.connectToken === this.#token) {
          this.#credential = stored;
        } else {
          const supplied = this.#credential || {};
          const tokenChanged = Boolean(
            supplied.connectToken && supplied.connectToken !== this.#token,
          );
          this.#credential = {
            ...(stored || {}),
            ...supplied,
            connectToken: this.#token,
          };
          if (tokenChanged) delete this.#credential.expiresAt;
        }
      }
    } catch (error) {
      if (this.#manualClose) throw error;
      this.#handleFailure(error);
      if (!this.#manualClose && !isTerminalRelayFailure(error, this.#credential)) {
        this.#scheduleReconnect();
      }
      throw error;
    }
    if (this.#manualClose) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    this.state = "connecting";
    this.lastError = null;
    this.emit("status", this.status());
    this.logger.info("relay", "正在连接 Relay", { url: config.relay.url, spaceId });
    const generation = ++this.#socketGeneration;
    return new Promise((resolve, reject) => {
      let settled = false;
      let established = false;
      let failureReported = false;
      let failureCode = null;
      const socket = new WebSocket(config.relay.url);
      this.#socket = socket;
      const isCurrent = () => this.#socket === socket && this.#socketGeneration === generation;
      const reportFailure = (error) => {
        if (failureReported || !isCurrent()) return;
        failureReported = true;
        failureCode = error?.code || "RELAY_UNAVAILABLE";
        if (this.#manualClose) return;
        this.#handleFailure(error);
      };
      const authenticationTimeout = setTimeout(() => {
        const error = new RelayError("RELAY_TIMEOUT", "Relay 认证超时");
        reportFailure(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
        socket.close();
      }, 10_000);
      socket.addEventListener("open", async () => {
        if (!isCurrent()) return;
        this.state = "authenticating";
        this.emit("status", this.status());
        try {
          socket.send(JSON.stringify(await this.#hello(config, this.#token, false)));
        } catch (error) {
          reportFailure(error);
          if (!settled) {
            settled = true;
            clearTimeout(authenticationTimeout);
            reject(error);
          }
          socket.close();
        }
      });
      socket.addEventListener("message", (event) => this.#handleMessage(event, {
        resolve,
        reject,
        settle: () => { settled = true; },
        authenticationTimeout,
        socket,
        isCurrent,
        reportFailure,
        markEstablished: () => { established = true; },
      }));
      socket.addEventListener("error", () => {
        const error = new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket 连接失败");
        reportFailure(error);
        if (!settled) {
          settled = true;
          clearTimeout(authenticationTimeout);
          reject(error);
        }
      });
      socket.addEventListener("close", (event) => {
        if (!isCurrent()) return;
        clearTimeout(authenticationTimeout);
        clearInterval(this.#heartbeat);
        this.#heartbeat = null;
        clearTimeout(this.#tokenRefreshTimer);
        this.#tokenRefreshTimer = null;
        const rotating = this.#rotationInProgress;
        this.#rotationInProgress = false;
        if (!settled) {
          settled = true;
          const error = new RelayError("RELAY_UNAVAILABLE", `Relay 在认证前断开：${event.code}`);
          reportFailure(error);
          reject(error);
        }
        if (established && !failureReported && !this.#manualClose && !rotating) {
          reportFailure(new RelayError("RELAY_UNAVAILABLE", `Relay 连接已断开：${event.code}`));
        }
        this.#detachSocket(socket);
        if (!this.#manualClose && !this.#credentialRefreshBlocked && !isTerminalRelayFailure({ code: failureCode }, this.#credential)) {
          this.#scheduleReconnect(rotating ? 100 : undefined);
        } else {
          this.emit("disconnected", { code: failureCode || event.code });
        }
      });
    });
  }

  #handleMessage(event, handshake) {
    if (handshake.isCurrent && !handshake.isCurrent()) return;
    let message;
    try {
      const raw = String(event.data);
      if (Buffer.byteLength(raw, "utf8") > this.#maxFrameSize) {
        handshake.socket?.close(1009, "message too large");
        throw new RelayError("INVALID_MESSAGE", "Relay 消息超过 maxFrameSize 限制");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "忽略 Relay 的无效 JSON", { message: error.message });
      return;
    }
    if (message.type === "connect.welcome") {
      if (this.state !== "authenticating" || (handshake.isCurrent && !handshake.isCurrent())) return;
      try {
        validateRelayWelcome(message);
        validateWelcomeIdentity(message, this.configStore.get());
        if (!Number.isInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
          throw new RelayError("INVALID_MESSAGE", "Relay welcome 缺少有效 maxFrameSize");
        }
      } catch (error) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.reportFailure?.(error);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close(1002, "invalid welcome");
        return;
      }
      clearTimeout(handshake.authenticationTimeout);
      this.state = "connected";
      handshake.markEstablished?.();
      this.connectedAt = nowIso();
      this.connectionId = message.connectionId;
      this.features = Array.isArray(message.features) ? message.features.filter((item) => typeof item === "string") : [];
      if (Number.isInteger(message.maxFrameSize) && message.maxFrameSize > 0) this.#maxFrameSize = message.maxFrameSize;
      this.#attempt = 0;
      this.lastError = null;
      this.#startHeartbeat();
      this.#scheduleTokenRefresh();
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
      if (isRefreshableCredentialFailure(error) && this.#credential?.endpointGrant) {
        // A manually entered token may not carry expiresAt metadata. Once the
        // relay proves that token is expired or unavailable, force the next
        // reconnect through the proof-bound Endpoint Grant instead of retrying
        // the same stale token forever.
        this.#forceTokenRefresh = true;
      }
      // Resource uploads and individual data frames are best-effort. The
      // server may reject one image because its short-lived resource cache is
      // full (or reject one oversized/rate-limited frame), but that must not
      // tear down the authenticated control channel and restart the whole
      // connector. The caller already has an inline/fallback path for these
      // request-level failures.
      const requestLevel = ["resource.", "message.too_large", "rate.limited", "frame.invalid"]
        .some((prefix) => error.code === prefix || error.code.startsWith(prefix));
      if (!authenticating && requestLevel) {
        this.logger.warn("relay", "Relay 拒绝了单个数据请求，保持连接", {
          code: error.code,
          message: error.message,
        });
        this.emit("status", this.status());
        return;
      }
      handshake.reportFailure?.(error);
      if (authenticating) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close();
      } else {
        handshake.socket?.close();
      }
      return;
    }
    if (message.type === "pong") {
      this.lastHeartbeat = nowIso();
      this.emit("status", this.status());
      return;
    }
    if (message.type === "stream.message" && message.protocol === "codex.resource.v1") {
      const resourceMessage = unwrapRelayFrame(message);
      if (resourceMessage?.type === "codex.resource.ready" && resourceMessage.requestId) {
        const pending = this.#resourceRequests.get(resourceMessage.requestId);
        if (pending) {
          this.#resourceRequests.delete(resourceMessage.requestId);
          pending.resolve(resourceMessage);
        }
      }
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
      capabilities: ["threads", "turns", "streaming", "steer", "interrupt", "approvals", "sync-v1", "resources-v1"],
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
    if (isTerminalRelayFailure(error, this.#credential)) {
      this.#manualClose = true;
      this.#credentialRefreshBlocked = true;
      clearTimeout(this.#tokenRefreshTimer);
      this.#tokenRefreshTimer = null;
    }
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay 连接异常", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }

  #scheduleReconnect(delayOverride = undefined) {
    if (this.#manualClose || this.#credentialRefreshBlocked || this.#reconnectTimer) return;
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = delayOverride ?? (
      Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1000
      + Math.floor(Math.random() * 500)
    );
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay 已断开，计划重连", { attempt: this.#attempt, delayMs: delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#manualClose || this.#credentialRefreshBlocked) return;
      this.#beginOpen().catch(() => {});
    }, delay);
    this.#reconnectTimer.unref?.();
  }

  #scheduleTokenRefresh(delayOverride = undefined) {
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    if (
      this.#manualClose
      || this.#credentialRefreshBlocked
      || this.state !== "connected"
      || !this.#credential?.endpointGrant
    ) return;
    const expiresAt = Number.isSafeInteger(this.#credential.expiresAt)
      && this.#credential.expiresAt > 0
      ? this.#credential.expiresAt
      : null;
    const delay = delayOverride ?? (
      expiresAt == null
        ? UNKNOWN_EXPIRY_REFRESH_MS
        : Math.max(1_000, expiresAt - Date.now() - TOKEN_REFRESH_LEAD_MS)
    );
    this.#tokenRefreshTimer = setTimeout(() => {
      this.#tokenRefreshTimer = null;
      this.#runScheduledTokenRefresh().catch(() => {});
    }, Math.max(250, delay));
    this.#tokenRefreshTimer.unref?.();
  }

  async #runScheduledTokenRefresh() {
    if (
      this.#manualClose
      || this.#credentialRefreshBlocked
      || this.state !== "connected"
    ) return;
    const socket = this.#socket;
    const credential = this.#credential;
    if (!socket || socket.readyState !== WebSocket.OPEN || !credential?.endpointGrant) return;
    const generation = this.#socketGeneration;
    const contextKey = this.#tokenRefreshKey(credential, generation);
    if (this.#tokenRefreshInFlight && this.#tokenRefreshContextKey === contextKey) return;
    const promise = (async () => {
      let rotationStarted = false;
      try {
        const refreshedCredential = await this.#usableCredential({ force: true, credential });
        const token = refreshedCredential?.connectToken || null;
        if (!token) throw new RelayError("AUTH_FAILED", "自动续期未返回有效 Connect Token");
        if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
        // Keep the complete refresh result (especially expiresAt).  Reading
        // only the token would leave a stale/unknown expiry in memory and the
        // next timer could either refresh too late or refresh on every boot.
        let nextCredential = {
          ...credential,
          ...(refreshedCredential || {}),
          connectToken: token,
        };
        const stored = await this.#authoritativeCredential();
        if (stored) {
          if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
          // The persisted view is authoritative for the Grant and endpoint,
          // while the just-returned refresh response is authoritative for the
          // rotated token and its expiry.  Merge in that order so a stale
          // environment override or cached record cannot overwrite metadata
          // from the successful refresh.
          nextCredential = {
            ...(stored || {}),
            ...credential,
            ...(refreshedCredential || {}),
            connectToken: token,
          };
        }
        this.#token = token;
        this.#credential = nextCredential;
        this.#forceTokenRefresh = false;
        this.#credentialRefreshBlocked = false;
        this.#rotationInProgress = true;
        rotationStarted = true;
        this.state = "reconnecting";
        this.emit("status", this.status());
        await closeSocket(socket, "connect token renewed");
        // A compliant WebSocket emits close and the close handler schedules
        // the reconnect. If a platform implementation drops that callback,
        // finish the rotation here so the client cannot remain stuck forever.
        if (this.#socket === socket && this.#socketGeneration === generation) {
          this.#detachSocket(socket);
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) this.#scheduleReconnect(100);
        }
      } catch (error) {
        if (rotationStarted) {
          this.logger.warn("relay", "旧 Relay 连接关闭异常，继续重连", {
            code: error.code,
            message: error.message,
          });
          return;
        }
        if (isTerminalRelayFailure(error, credential)) {
          this.#credentialRefreshBlocked = true;
          this.#manualClose = true;
          clearTimeout(this.#tokenRefreshTimer);
          this.#tokenRefreshTimer = null;
          // The current socket is no longer usable once the proof-bound
          // credential has been rejected. Publish an error state before
          // closing it so the dashboard cannot briefly report a dead session
          // as still connected.
          this.state = "error";
          this.connectedAt = null;
          this.connectionId = null;
          this.features = [];
          this.lastError = error.message;
          this.logger.error("relay", "Connect Token 自动续期已停止", {
            code: error.code,
            message: error.message,
          });
          this.emit("status", this.status());
          this.#rotationInProgress = true;
          const closed = await closeSocket(socket, "connect token renewal stopped");
          if (this.#socket === socket) {
            this.#detachSocket(socket);
          }
          this.#rotationInProgress = false;
          if (!closed) this.emit("disconnected", { code: error.code || "auth.refresh_rejected" });
          return;
        }
        // Keep a still-valid socket alive during a transient refresh outage;
        // retry before expiry and let the Relay's own expiry signal take over
        // if the outage lasts longer.
        this.lastError = error.message;
        this.logger.warn("relay", "Connect Token 自动续期暂时失败，稍后重试", {
          code: error.code,
          message: error.message,
        });
        this.emit("status", this.status());
        this.#scheduleTokenRefresh(refreshRetryDelay(error));
      } finally {
        if (
          rotationStarted
          && this.#rotationInProgress
          && this.#socket === socket
          && this.#socketGeneration === generation
        ) {
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) {
            this.#detachSocket(socket);
            this.#scheduleReconnect(100);
          }
        }
      }
    })();
    this.#tokenRefreshInFlight = promise;
    this.#tokenRefreshContextKey = contextKey;
    try {
      await promise;
    } finally {
      if (this.#tokenRefreshInFlight === promise) {
        this.#tokenRefreshInFlight = null;
        this.#tokenRefreshContextKey = null;
      }
    }
  }

  #isCurrentRefreshContext(socket, generation, credential) {
    return !this.#manualClose
      && this.#socket === socket
      && this.#socketGeneration === generation
      && this.state === "connected"
      && this.#credential?.endpointGrant === credential?.endpointGrant;
  }

  #tokenRefreshKey(credential, generation) {
    const config = this.configStore.get();
    return [
      generation,
      config.relay?.url || "",
      relaySpaceId(config.relay),
      relayEndpointId(config.relay),
      credential?.endpointGrant || "",
      credential?.tokenEndpoint || "",
    ].join("\u0000");
  }

  async #usableCredential(options) {
    if (typeof this.#tokenService.usableCredential === "function") {
      return this.#tokenService.usableCredential(options);
    }
    const token = await this.#tokenService.usableToken(options);
    return {
      ...(options?.credential || {}),
      ...(token ? { connectToken: token } : {}),
    };
  }

  async #authoritativeCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return null;
  }

  #detachSocket(socket) {
    if (this.#socket !== socket) return;
    this.#socket = null;
    clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay 连接已断开"));
    }
    this.#resourceRequests.clear();
  }
}

// A revoked, expired, or proof-mismatched credential cannot recover by
// reconnecting with the same first-frame token. Stop the retry loop and wait
// for the user to rotate the credential in the local dashboard.
function isTerminalRelayFailure(error, credential) {
  const code = typeof error === "string" ? error : error?.code;
  // HTTP 408/425/429/5xx and transport failures are temporary.  The current
  // authenticated socket remains usable, so a refresh outage must never be
  // converted into a permanent credential failure just because its public
  // error code happens to be listed in the auth set below.
  if (isRetryableRefreshFailure(error)) return false;
  if (code === "connection.rejected") return true;
  // Relay can reject either an expired short-lived token or a token that is no
  // longer available. A proof-bound Endpoint Grant can mint the next token,
  // so allow the normal reconnect path to run in either case.
  if (isRefreshableCredentialFailure({ code }) && credential?.endpointGrant) return false;
  return TERMINAL_RELAY_AUTH_CODES.has(code);
}

function isRetryableRefreshFailure(error) {
  return error?.code === "RELAY_RETRYABLE" || error?.details?.retryable === true;
}

function refreshRetryDelay(error) {
  const retryAfterMs = error?.details?.retryAfterMs;
  return Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0
    ? Math.max(250, retryAfterMs)
    : TOKEN_REFRESH_RETRY_MS;
}

function isRefreshableCredentialFailure(error) {
  const code = typeof error === "string" ? error : error?.code;
  return code === "auth.token_expired" || code === "auth.invalid_token";
}

function hasDifferentCredentialFields(supplied, stored) {
  if (supplied === undefined || supplied === null) return false;
  const candidate = typeof supplied === "string"
    ? { connectToken: supplied.trim() }
    : supplied;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
  if (!stored) return Object.keys(candidate).some((field) => [
    "connectToken",
    "endpointGrant",
    "tokenEndpoint",
    "expiresAt",
    "grantExpiresAt",
  ].includes(field));
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint", "expiresAt", "grantExpiresAt"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const suppliedValue = candidate[field] == null ? "" : String(candidate[field]).trim();
    const storedValue = stored[field] == null ? "" : String(stored[field]).trim();
    if (suppliedValue !== storedValue) return true;
  }
  return false;
}

function closeSocket(socket, reason) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed === false ? false : true);
    };
    const timer = setTimeout(() => finish(false), 3_000);
    try {
      socket.addEventListener("close", finish, { once: true });
      socket.close(1000, reason);
    } catch {
      finish();
    }
  });
}

function validateWelcomeIdentity(message, config) {
  const expectedSpaceId = relaySpaceId(config.relay);
  const expectedEndpointId = relayEndpointId(config.relay);
  if (message.spaceId !== expectedSpaceId || message.endpointId !== expectedEndpointId) {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome 的 Space 或 Endpoint 与本机配置不一致");
  }
}
