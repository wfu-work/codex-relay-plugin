import { EventEmitter } from "node:events";
import { RelayError } from "./errors.js";
import { nowIso, randomId } from "./utils.js";
import { PROTOCOL_VERSION, validateRelayWelcome } from "./protocol.js";

export class RelayClient extends EventEmitter {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #attempt = 0;
  #manualClose = false;
  #token = null;

  constructor(configStore, logger) {
    super();
    this.configStore = configStore;
    this.logger = logger;
    this.state = "disconnected";
    this.lastError = null;
    this.lastHeartbeat = null;
    this.connectedAt = null;
    this.connectionId = null;
  }

  status() {
    return {
      state: this.state,
      lastError: this.lastError,
      lastHeartbeat: this.lastHeartbeat,
      connectedAt: this.connectedAt,
      connectionId: this.connectionId,
      reconnectAttempt: this.#attempt,
    };
  }

  async connect(token) {
    if (["connected", "authenticating", "connecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置 Relay 地址");
    if (!config.relay.roomId) throw new RelayError("CONFIG_INCOMPLETE", "尚未配置房间 ID");
    if (!token) throw new RelayError("AUTH_FAILED", "尚未配置 Relay Token");
    this.#token = token;
    this.#manualClose = false;
    return this.#open();
  }

  async test(token, timeoutMs = 8_000) {
    const config = this.configStore.get();
    if (!config.relay.url || !config.relay.roomId || !token) {
      throw new RelayError("CONFIG_INCOMPLETE", "请先填写 Relay 地址、房间 ID 和 Token");
    }
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
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify(this.#hello(config, token, true)));
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "host.welcome") {
            validateRelayWelcome(message);
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
    this.state = "disconnected";
    this.connectedAt = null;
    this.connectionId = null;
    this.emit("status", this.status());
  }

  send(message) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") return false;
    this.#socket.send(JSON.stringify(message));
    return true;
  }

  async #open() {
    const config = this.configStore.get();
    this.state = "connecting";
    this.lastError = null;
    this.emit("status", this.status());
    this.logger.info("relay", "正在连接 Relay", { url: config.relay.url, roomId: config.relay.roomId });
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
      socket.addEventListener("open", () => {
        this.state = "authenticating";
        this.emit("status", this.status());
        socket.send(JSON.stringify(this.#hello(config, this.#token, false)));
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
      if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) {
        this.#socket?.close(1009, "message too large");
        throw new RelayError("INVALID_MESSAGE", "Relay 消息超过 1 MiB 限制");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "忽略 Relay 的无效 JSON", { message: error.message });
      return;
    }
    if (message.type === "host.welcome") {
      if (this.state !== "authenticating") return;
      try {
        validateRelayWelcome(message);
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
    if (message.type === "codex.command") this.emit("command", message);
  }

  #hello(config, token, test) {
    return {
      version: PROTOCOL_VERSION,
      type: "host.hello",
      requestId: randomId("hello"),
      roomId: config.relay.roomId,
      deviceId: config.relay.deviceId,
      deviceName: config.relay.deviceName,
      token,
      timestamp: nowIso(),
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
        roomId: this.configStore.get().relay.roomId,
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: nowIso(),
      });
    }, seconds * 1000);
  }

  #handleFailure(error) {
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
