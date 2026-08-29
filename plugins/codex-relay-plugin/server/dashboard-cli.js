#!/usr/bin/env node

// server/connector-service.js
import { EventEmitter as EventEmitter4 } from "node:events";

// server/app-server-client.js
import { EventEmitter } from "node:events";
import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";

// server/errors.js
var RelayError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
};
function asRelayError(error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof RelayError) return error;
  return new RelayError(fallbackCode, error instanceof Error ? error.message : String(error));
}

// server/app-server-client.js
var execFileAsync = promisify(execFile);
var AppServerClient = class _AppServerClient extends EventEmitter {
  #process = null;
  #requests = /* @__PURE__ */ new Map();
  #serverRequests = /* @__PURE__ */ new Map();
  #nextId = 1;
  #starting = null;
  static APPROVAL_METHODS = /* @__PURE__ */ new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval"
  ]);
  constructor(configStore, logger) {
    super();
    this.configStore = configStore;
    this.logger = logger;
    this.state = "stopped";
    this.version = null;
    this.lastError = null;
  }
  status() {
    return {
      state: this.state,
      version: this.version,
      pid: this.#process?.pid || null,
      lastError: this.lastError,
      pendingRequests: this.#requests.size,
      pendingApprovals: this.#serverRequests.size
    };
  }
  async checkAvailability() {
    const executable = this.configStore.get().codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 1e4 });
    this.version = (stdout || stderr).trim();
    return { executable, version: this.version };
  }
  async start() {
    if (this.state === "ready") return this.status();
    if (this.#starting) return this.#starting;
    this.#starting = this.#startInternal();
    try {
      return await this.#starting;
    } finally {
      this.#starting = null;
    }
  }
  async #startInternal() {
    const config = this.configStore.get();
    this.state = "starting";
    this.lastError = null;
    await this.checkAvailability();
    this.logger.info("app-server", "\u6B63\u5728\u542F\u52A8 Codex App Server", {
      executable: config.codex.executable
    });
    const child = spawn(config.codex.executable || "codex", ["app-server"], {
      cwd: config.codex.defaultWorkingDirectory || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    this.#process = child;
    child.once("error", (error) => this.#handleExit(child, error));
    child.once("exit", (code, signal) => this.#handleExit(child, new Error(`App Server \u5DF2\u9000\u51FA (${code ?? signal})`)));
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.#handleLine(line));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.logger.info("app-server", text);
    });
    await this.request("initialize", {
      clientInfo: {
        name: "codex-relay-plugin",
        title: "Codex Relay Plugin",
        version: "0.1.0"
      },
      capabilities: { experimentalApi: true }
    }, 15e3);
    this.notify("initialized", {});
    this.state = "ready";
    this.logger.info("app-server", "Codex App Server \u5DF2\u5C31\u7EEA", { version: this.version, pid: child.pid });
    this.emit("status", this.status());
    return this.status();
  }
  async stop() {
    if (!this.#process) return;
    const child = this.#process;
    this.#process = null;
    this.state = "stopped";
    child.kill("SIGTERM");
    for (const pending of this.#requests.values()) pending.reject(new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u5DF2\u505C\u6B62"));
    this.#requests.clear();
    this.#serverRequests.clear();
    this.emit("status", this.status());
  }
  request(method, params = {}, timeoutMs = 3e4) {
    if (!this.#process?.stdin?.writable) {
      return Promise.reject(new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id);
        reject(new RelayError("APP_SERVER_TIMEOUT", `${method} \u8BF7\u6C42\u8D85\u65F6`));
      }, timeoutMs);
      this.#requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.#write({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method, params = {}) {
    this.#write({ jsonrpc: "2.0", method, params });
  }
  listThreads(params = {}) {
    return this.request("thread/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 50), 100),
      sortKey: params.sortKey || "updated_at",
      ...params.cwd ? { cwd: params.cwd } : {}
    });
  }
  readThread(threadId) {
    return this.request("thread/read", { threadId, includeTurns: true });
  }
  createThread({ cwd } = {}) {
    return this.request("thread/start", { ...cwd ? { cwd } : {} });
  }
  resumeThread(threadId) {
    return this.request("thread/resume", { threadId });
  }
  startTurn({ threadId, text, cwd }) {
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text }],
      ...cwd ? { cwd } : {}
    });
  }
  steerTurn({ threadId, turnId, text }) {
    return this.request("turn/steer", {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: "text", text }]
    });
  }
  interruptTurn({ threadId, turnId }) {
    return this.request("turn/interrupt", { threadId, turnId });
  }
  respondToApproval(approvalId, decision) {
    const key = String(approvalId);
    const request = this.#serverRequests.get(key);
    if (!request) throw new RelayError("APPROVAL_EXPIRED", "\u5BA1\u6279\u8BF7\u6C42\u4E0D\u5B58\u5728\u6216\u5DF2\u7ECF\u5904\u7406");
    this.#serverRequests.delete(key);
    this.#write({ jsonrpc: "2.0", id: request.id, result: { decision } });
    return { approvalId: String(approvalId), decision };
  }
  #write(message) {
    if (!this.#process?.stdin?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C");
    this.#process.stdin.write(`${JSON.stringify(message)}
`);
  }
  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.warn("app-server", "\u5FFD\u7565\u975E JSON \u8F93\u51FA", { line });
      return;
    }
    if (message.id !== void 0 && !message.method) {
      const pending = this.#requests.get(message.id);
      if (!pending) return;
      this.#requests.delete(message.id);
      if (message.error) pending.reject(new RelayError("APP_SERVER_ERROR", message.error.message || "App Server \u8BF7\u6C42\u5931\u8D25", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== void 0 && message.method) {
      if (!_AppServerClient.APPROVAL_METHODS.has(message.method)) {
        this.logger.warn("app-server", "\u62D2\u7EDD\u4E0D\u53D7\u652F\u6301\u7684 App Server \u5BA2\u6237\u7AEF\u8BF7\u6C42", { method: message.method });
        this.#write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Client request not supported: ${message.method}` }
        });
        return;
      }
      this.#serverRequests.set(String(message.id), message);
      this.emit("approval", {
        approvalId: String(message.id),
        method: message.method,
        params: message.params || {}
      });
      return;
    }
    if (message.method) this.emit("notification", message.method, message.params || {});
  }
  #handleExit(child, error) {
    if (this.#process !== child || this.state === "stopped") return;
    this.#process = null;
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("app-server", "Codex App Server \u4E0D\u53EF\u7528", { message: error.message });
    for (const pending of this.#requests.values()) pending.reject(new RelayError("APP_SERVER_UNAVAILABLE", error.message));
    this.#requests.clear();
    this.emit("status", this.status());
  }
};

// server/utils.js
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
function redact(value) {
  if (typeof value === "string") {
    return value.replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]").replace(/("?(?:token|secret|authorization|api[_-]?key)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[REDACTED]");
  }
  return JSON.parse(redact(JSON.stringify(value)));
}
function normalizeRelayUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws:// \u6216 wss://");
  }
  if (!url.hostname) throw new Error("Relay \u5730\u5740\u7F3A\u5C11\u4E3B\u673A\u540D");
  return url.toString();
}
function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "localhost"].includes(hostname);
}
function safeProjectPath(projectPath, allowedProjects) {
  if (!projectPath) return null;
  const candidate = path.resolve(projectPath);
  if (!allowedProjects?.length) return candidate;
  const allowed = allowedProjects.some((root) => {
    const normalizedRoot = path.resolve(root);
    const relative = path.relative(normalizedRoot, candidate);
    return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  return allowed ? candidate : null;
}
function filterThreadList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((thread) => Boolean(thread?.cwd && safeProjectPath(thread.cwd, allowedProjects)))
  };
}

// server/protocol.js
var PROTOCOL_VERSION = 1;
function validateRelayWelcome(message) {
  if (!message || typeof message !== "object" || message.type !== "host.welcome") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u6D88\u606F\u65E0\u6548");
  }
  if (message.version !== PROTOCOL_VERSION) {
    throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "Relay \u8FD4\u56DE\u4E86\u4E0D\u517C\u5BB9\u7684\u534F\u8BAE\u7248\u672C");
  }
  if (!message.connectionId || typeof message.connectionId !== "string") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11 connectionId");
  }
  return message;
}
var COMMAND_PERMISSIONS = Object.freeze({
  "host.get_status": "readThreads",
  "thread.list": "readThreads",
  "thread.read": "readThreads",
  "thread.create": "createThreads",
  "thread.resume": "readThreads",
  "thread.select": "readThreads",
  "turn.start": "sendMessages",
  "turn.steer": "steerTurns",
  "turn.interrupt": "interruptTurns",
  "approval.respond": "respondToApprovals",
  "sync.request": "readThreads",
  ping: null
});
function validateRelayCommand(message, config) {
  if (!message || typeof message !== "object") throw new RelayError("INVALID_MESSAGE", "\u547D\u4EE4\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  if (message.version !== PROTOCOL_VERSION) throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "\u4E0D\u652F\u6301\u7684\u534F\u8BAE\u7248\u672C");
  if (message.type !== "codex.command") throw new RelayError("INVALID_MESSAGE", "\u6D88\u606F\u7C7B\u578B\u5FC5\u987B\u662F codex.command");
  if (!message.requestId || typeof message.requestId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11 requestId");
  if (!message.deviceId || typeof message.deviceId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11\u53D1\u9001\u7AEF deviceId");
  if (message.targetDeviceId !== config.relay.deviceId) throw new RelayError("DEVICE_NOT_TARGETED", "\u547D\u4EE4\u672A\u53D1\u9001\u7ED9\u672C\u673A\u8BBE\u5907");
  if (message.roomId !== config.relay.roomId) throw new RelayError("ROOM_NOT_JOINED", "\u547D\u4EE4\u623F\u95F4\u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  const commandType = message.command?.type;
  if (!Object.hasOwn(COMMAND_PERMISSIONS, commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${commandType || "unknown"}`);
  }
  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1e3) {
    throw new RelayError("MESSAGE_EXPIRED", "\u547D\u4EE4\u65F6\u95F4\u6233\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  }
  const permission = COMMAND_PERMISSIONS[commandType];
  if (config.readOnly && !["host.get_status", "thread.list", "thread.read", "sync.request", "ping"].includes(commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", "\u63D2\u4EF6\u5F53\u524D\u5904\u4E8E\u53EA\u8BFB\u6A21\u5F0F");
  }
  if (permission && !config.permissions[permission]) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u8FDC\u7A0B\u6743\u9650 ${permission} \u672A\u542F\u7528`);
  }
  return message;
}
function eventEnvelope(config, buffer, event, context = {}) {
  return buffer.push({
    version: PROTOCOL_VERSION,
    type: "codex.event",
    eventId: randomId("evt"),
    deviceId: config.relay.deviceId,
    roomId: config.relay.roomId,
    sequence: buffer.nextSequence(),
    timestamp: nowIso(),
    ...context.threadId ? { threadId: context.threadId } : {},
    ...context.turnId ? { turnId: context.turnId } : {},
    event
  });
}
function commandResult(config, requestId, result) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId,
    deviceId: config.relay.deviceId,
    roomId: config.relay.roomId,
    timestamp: nowIso(),
    success: true,
    result
  };
}
function commandError(config, requestId, error) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId: requestId || randomId("invalid"),
    deviceId: config.relay.deviceId,
    roomId: config.relay.roomId,
    timestamp: nowIso(),
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "\u672A\u77E5\u9519\u8BEF",
      ...error.details === void 0 ? {} : { details: error.details }
    }
  };
}
function normalizeCodexNotification(method, params = {}) {
  const map = {
    "thread/started": "thread.created",
    "thread/status/changed": "thread.updated",
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/failed": "turn.failed",
    "turn/aborted": "turn.interrupted",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/started": "item.started",
    "item/completed": "item.completed",
    error: "error"
  };
  const type = map[method];
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params
  };
}
function extractContext(params = {}) {
  return {
    threadId: params.threadId || params.thread?.id,
    turnId: params.turnId || params.turn?.id
  };
}

// server/command-router.js
var CommandRouter = class {
  #completed = /* @__PURE__ */ new Map();
  #inflight = /* @__PURE__ */ new Map();
  #selectedThreadId = null;
  constructor({ configStore, appServer, service, logger }) {
    this.configStore = configStore;
    this.appServer = appServer;
    this.service = service;
    this.logger = logger;
  }
  async handle(message) {
    const config = this.configStore.get();
    let fingerprint;
    try {
      validateRelayCommand(message, config);
      fingerprint = commandFingerprint(message);
      const completed = this.#completed.get(message.requestId);
      if (completed) {
        if (completed.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        return completed.response;
      }
      const inflight = this.#inflight.get(message.requestId);
      if (inflight) {
        if (inflight.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        return await inflight.promise;
      }
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
    const promise = this.#run(config, message, fingerprint);
    this.#inflight.set(message.requestId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (this.#inflight.get(message.requestId)?.promise === promise) {
        this.#inflight.delete(message.requestId);
      }
    }
  }
  async #run(config, message, fingerprint) {
    try {
      const result = await this.#execute(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {});
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
  }
  #failure(config, message, fingerprint, error) {
    const relayError = asRelayError(error);
    this.logger.warn("command", "\u8FDC\u7A0B\u547D\u4EE4\u6267\u884C\u5931\u8D25", {
      command: message?.command?.type,
      code: relayError.code,
      message: relayError.message
    });
    const response = commandError(config, message?.requestId, relayError);
    if (message?.requestId && fingerprint && !this.#completed.has(message.requestId)) {
      this.#remember(message.requestId, fingerprint, response);
    }
    return response;
  }
  async #execute(command, envelope) {
    if (command.type === "ping") return { pong: true };
    if (command.type === "host.get_status") return this.service.status();
    if (command.type === "sync.request") {
      return this.service.syncAfter(Object.hasOwn(command, "lastSequence") ? command.lastSequence : null);
    }
    await this.appServer.start();
    switch (command.type) {
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const result = await this.appServer.readThread(requireString(command.threadId || envelope.threadId, "threadId"));
        this.#assertThreadResultAllowed(result);
        return result;
      }
      case "thread.create": {
        const cwd = this.#allowedCwd(command.cwd, true);
        const result = await this.appServer.createThread({ cwd });
        this.#selectedThreadId = result?.thread?.id || result?.id || null;
        return result;
      }
      case "thread.resume": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        const result = await this.appServer.resumeThread(threadId);
        this.#selectedThreadId = threadId;
        return result;
      }
      case "thread.select": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        this.#selectedThreadId = threadId;
        return { threadId: this.#selectedThreadId };
      }
      case "turn.start": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.startTurn({
          threadId,
          text: requireString(command.text, "text"),
          cwd: this.#allowedCwd(command.cwd)
        });
      }
      case "turn.steer": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.steerTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId"),
          text: requireString(command.text, "text")
        });
      }
      case "turn.interrupt": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.interruptTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId")
        });
      }
      case "approval.respond": {
        const allowed = /* @__PURE__ */ new Set(["accept", "acceptForSession", "decline", "cancel"]);
        if (!allowed.has(command.decision)) throw new RelayError("INVALID_MESSAGE", "\u5BA1\u6279\u51B3\u5B9A\u65E0\u6548");
        return this.appServer.respondToApproval(requireString(command.approvalId, "approvalId"), command.decision);
      }
      default:
        throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${command.type}`);
    }
  }
  #allowedCwd(cwd, required = false) {
    const config = this.configStore.get();
    const candidate = cwd || (required ? config.codex.defaultWorkingDirectory : "");
    if (!candidate) {
      if (required && config.allowedProjects.length) {
        throw new RelayError("PROJECT_REQUIRED", "\u542F\u7528\u9879\u76EE\u767D\u540D\u5355\u540E\uFF0C\u521B\u5EFA\u4F1A\u8BDD\u5FC5\u987B\u6307\u5B9A\u5141\u8BB8\u7684\u5DE5\u4F5C\u76EE\u5F55");
      }
      return void 0;
    }
    const safe = safeProjectPath(candidate, config.allowedProjects);
    if (!safe) throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u9879\u76EE\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    return safe;
  }
  async #assertThreadAllowed(threadId) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return;
    this.#assertThreadResultAllowed(await this.appServer.readThread(threadId));
  }
  #assertThreadResultAllowed(result) {
    const config = this.configStore.get();
    if (!config.allowedProjects.length) return;
    const cwd = result?.thread?.cwd || result?.cwd;
    if (!cwd || !safeProjectPath(cwd, config.allowedProjects)) {
      throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u4F1A\u8BDD\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    }
  }
  #remember(requestId, fingerprint, response) {
    this.#completed.set(requestId, { fingerprint, response });
    if (this.#completed.size > 500) this.#completed.delete(this.#completed.keys().next().value);
  }
};
function commandFingerprint(message) {
  return JSON.stringify({
    roomId: message.roomId,
    deviceId: message.deviceId,
    targetDeviceId: message.targetDeviceId,
    threadId: message.threadId || null,
    turnId: message.turnId || null,
    command: stableValue(message.command)
  });
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new RelayError("INVALID_MESSAGE", `\u7F3A\u5C11 ${name}`);
  return value;
}

// server/config-store.js
import fs2 from "node:fs/promises";
import os from "node:os";
import path3 from "node:path";

// server/secret-store.js
import fs from "node:fs/promises";
import path2 from "node:path";
var SecretStore = class {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path2.join(configDir, "secrets.json");
    this.cache = /* @__PURE__ */ new Map();
  }
  async get(roomId) {
    if (process.env.CODEX_RELAY_TOKEN) return process.env.CODEX_RELAY_TOKEN;
    const account = roomId || "default";
    if (this.cache.has(account)) return this.cache.get(account);
    const values = await this.#readFallback();
    const token = values[account] || null;
    this.cache.set(account, token);
    return token;
  }
  async set(roomId, token) {
    const account = roomId || "default";
    if (!token) return this.delete(account);
    const values = await this.#readFallback();
    values[account] = token;
    await this.#writeFallback(values);
    this.cache.set(account, token);
    return { backend: "file" };
  }
  async delete(roomId) {
    const account = roomId || "default";
    const values = await this.#readFallback();
    delete values[account];
    await this.#writeFallback(values);
    this.cache.set(account, null);
  }
  async #readFallback() {
    try {
      return JSON.parse(await fs.readFile(this.fallbackFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async #writeFallback(values) {
    await fs.mkdir(this.configDir, { recursive: true, mode: 448 });
    await fs.writeFile(this.fallbackFile, `${JSON.stringify(values, null, 2)}
`, { mode: 384 });
    await fs.chmod(this.fallbackFile, 384);
  }
};

// server/config-store.js
var DEFAULT_PERMISSIONS = Object.freeze({
  readThreads: true,
  sendMessages: true,
  createThreads: true,
  steerTurns: true,
  interruptTurns: true,
  respondToApprovals: false
});
function defaultConfig() {
  return {
    version: 1,
    relay: {
      url: "",
      roomId: "",
      deviceId: randomId("host"),
      deviceName: os.hostname(),
      autoConnect: false,
      heartbeatSeconds: 20,
      reconnectMaxSeconds: 30
    },
    codex: {
      executable: "codex",
      autoStartAppServer: true,
      defaultWorkingDirectory: ""
    },
    permissions: { ...DEFAULT_PERMISSIONS },
    allowedProjects: [],
    readOnly: false
  };
}
var ConfigStore = class {
  constructor({ configDir, logger } = {}) {
    this.configDir = configDir || process.env.CODEX_RELAY_CONFIG_DIR || path3.join(os.homedir(), ".codex-relay-plugin");
    this.configFile = path3.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.config = null;
  }
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs2.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.config = mergeConfig(defaultConfig(), saved);
    validateConfig(this.config);
    return this.config;
  }
  get() {
    if (!this.config) throw new Error("\u914D\u7F6E\u5C1A\u672A\u52A0\u8F7D");
    return structuredClone(this.config);
  }
  async publicConfig({ includeToken = false } = {}) {
    const config = this.get();
    const token = await this.secretStore.get(config.relay.roomId);
    return {
      ...config,
      relay: {
        ...config.relay,
        ...includeToken ? { token: token || "" } : {},
        tokenConfigured: Boolean(token)
      }
    };
  }
  async update(patch, token) {
    if (token !== void 0 && (typeof token !== "string" || token.length > 16384)) {
      throw new Error("Relay Token \u5FC5\u987B\u662F\u957F\u5EA6\u4E0D\u8D85\u8FC7 16384 \u7684\u5B57\u7B26\u4E32");
    }
    const previousRoom = this.config?.relay?.roomId;
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    await fs2.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.configFile}.tmp`;
    await fs2.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    await fs2.rename(temporary, this.configFile);
    await fs2.chmod(this.configFile, 384);
    this.config = next;
    if (token !== void 0 && token !== "") await this.secretStore.set(next.relay.roomId, token);
    if (previousRoom && previousRoom !== next.relay.roomId && token === void 0) {
      const oldToken = await this.secretStore.get(previousRoom);
      if (oldToken) await this.secretStore.set(next.relay.roomId, oldToken);
    }
    this.logger?.info("config", "\u914D\u7F6E\u5DF2\u4FDD\u5B58", { relayUrl: next.relay.url, roomId: next.relay.roomId });
    return this.publicConfig();
  }
  async token() {
    return this.secretStore.get(this.get().relay.roomId);
  }
};
function mergeConfig(base, patch) {
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...patch.relay || {} },
    codex: { ...base.codex, ...patch.codex || {} },
    permissions: { ...base.permissions, ...patch.permissions || {} },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects
  };
}
function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("\u914D\u7F6E\u7248\u672C\u65E0\u6548");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay \u914D\u7F6E\u65E0\u6548");
  if (config.relay.url) {
    const relayUrl = new URL(normalizeRelayUrl(config.relay.url));
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("\u975E\u672C\u673A Relay \u5FC5\u987B\u4F7F\u7528 wss:// \u52A0\u5BC6\u8FDE\u63A5");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  }
  if (config.relay.roomId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.roomId)) {
    throw new Error("\u623F\u95F4 ID \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u5192\u53F7\u548C\u8FDE\u5B57\u7B26");
  }
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.deviceId || "")) throw new Error("\u8BBE\u5907 ID \u65E0\u6548");
  const heartbeat = Number(config.relay.heartbeatSeconds);
  if (!Number.isFinite(heartbeat) || heartbeat < 5 || heartbeat > 300) {
    throw new Error("\u5FC3\u8DF3\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 300 \u79D2\u4E4B\u95F4");
  }
  const reconnectMax = Number(config.relay.reconnectMaxSeconds);
  if (!Number.isFinite(reconnectMax) || reconnectMax < 5 || reconnectMax > 600) {
    throw new Error("\u6700\u5927\u91CD\u8FDE\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 600 \u79D2\u4E4B\u95F4");
  }
  if (typeof config.relay.deviceName !== "string" || config.relay.deviceName.length > 128) {
    throw new Error("\u8BBE\u5907\u540D\u79F0\u65E0\u6548");
  }
  if (typeof config.relay.autoConnect !== "boolean") throw new Error("\u81EA\u52A8\u8FDE\u63A5\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.codex || typeof config.codex !== "object") throw new Error("Codex \u914D\u7F6E\u65E0\u6548");
  if (typeof config.codex.executable !== "string" || !config.codex.executable.trim()) throw new Error("Codex \u547D\u4EE4\u65E0\u6548");
  if (typeof config.codex.defaultWorkingDirectory !== "string") throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u65E0\u6548");
  if (config.codex.defaultWorkingDirectory && !path3.isAbsolute(config.codex.defaultWorkingDirectory)) {
    throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
  }
  if (typeof config.codex.autoStartAppServer !== "boolean") throw new Error("App Server \u81EA\u52A8\u542F\u52A8\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.permissions || typeof config.permissions !== "object") throw new Error("\u8FDC\u7A0B\u6743\u9650\u914D\u7F6E\u65E0\u6548");
  for (const name of Object.keys(DEFAULT_PERMISSIONS)) {
    if (typeof config.permissions[name] !== "boolean") throw new Error(`\u8FDC\u7A0B\u6743\u9650 ${name} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
  }
  if (typeof config.readOnly !== "boolean") throw new Error("\u53EA\u8BFB\u6A21\u5F0F\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!Array.isArray(config.allowedProjects)) throw new Error("\u9879\u76EE\u767D\u540D\u5355\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const project of config.allowedProjects) {
    if (typeof project !== "string" || !path3.isAbsolute(project)) throw new Error(`\u9879\u76EE\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${project}`);
  }
  return config;
}

// server/event-buffer.js
var EventBuffer = class {
  #items = [];
  #sequence = 0;
  constructor(limit = 1e3) {
    this.limit = limit;
  }
  nextSequence() {
    this.#sequence += 1;
    return this.#sequence;
  }
  push(event) {
    this.#items.push(event);
    if (this.#items.length > this.limit) this.#items.shift();
    return event;
  }
  after(lastSequence) {
    const sequence = Number(lastSequence || 0);
    if (!this.#items.length) return [];
    const first = this.#items[0].sequence;
    if (sequence < first - 1) return null;
    return this.#items.filter((item) => item.sequence > sequence);
  }
  latestSequence() {
    return this.#sequence;
  }
  clear() {
    this.#items.length = 0;
    this.#sequence = 0;
  }
};

// server/logger.js
import { EventEmitter as EventEmitter2 } from "node:events";
var Logger = class extends EventEmitter2 {
  #entries = [];
  constructor(limit = 300) {
    super();
    this.limit = limit;
  }
  log(level, component, message, data) {
    const entry = {
      timestamp: nowIso(),
      level,
      component,
      message: redact(String(message)),
      ...data === void 0 ? {} : { data: redact(data) }
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.shift();
    this.emit("entry", entry);
    return entry;
  }
  info(component, message, data) {
    return this.log("info", component, message, data);
  }
  warn(component, message, data) {
    return this.log("warn", component, message, data);
  }
  error(component, message, data) {
    return this.log("error", component, message, data);
  }
  list(limit = 100) {
    return this.#entries.slice(-Math.max(1, Math.min(limit, this.limit)));
  }
  clear() {
    this.#entries.length = 0;
  }
};

// server/relay-client.js
import { EventEmitter as EventEmitter3 } from "node:events";
var RelayClient = class extends EventEmitter3 {
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
      reconnectAttempt: this.#attempt
    };
  }
  async connect(token) {
    if (["connected", "authenticating", "connecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay \u5730\u5740");
    if (!config.relay.roomId) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E\u623F\u95F4 ID");
    if (!token) throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Token");
    this.#token = token;
    this.#manualClose = false;
    return this.#open();
  }
  async test(token, timeoutMs = 8e3) {
    const config = this.configStore.get();
    if (!config.relay.url || !config.relay.roomId || !token) {
      throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Relay \u5730\u5740\u3001\u623F\u95F4 ID \u548C Token");
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
        finishReject(new RelayError("RELAY_TIMEOUT", "Relay \u5728\u6D4B\u8BD5\u65F6\u95F4\u5185\u6CA1\u6709\u786E\u8BA4\u8BA4\u8BC1"));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify(this.#hello(config, token, true)));
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "host.welcome") {
            validateRelayWelcome(message);
            socket.close(1e3, "test complete");
            finishResolve({ ok: true, connectionId: message.connectionId, protocolVersion: message.version });
          } else if (message.type === "relay.error") {
            socket.close();
            finishReject(new RelayError(message.code || "AUTH_FAILED", message.message || "Relay \u62D2\u7EDD\u8FDE\u63A5"));
          }
        } catch (error) {
          socket.close();
          finishReject(new RelayError("INVALID_MESSAGE", `Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u6D88\u606F\uFF1A${error.message}`));
        }
      });
      socket.addEventListener("error", () => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", "\u65E0\u6CD5\u8FDE\u63A5 Relay"));
      });
      socket.addEventListener("close", (event) => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`));
      });
    });
  }
  disconnect(reason = "manual disconnect") {
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    if (this.#socket) this.#socket.close(1e3, reason);
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
    this.logger.info("relay", "\u6B63\u5728\u8FDE\u63A5 Relay", { url: config.relay.url, roomId: config.relay.roomId });
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(config.relay.url);
      this.#socket = socket;
      const authenticationTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new RelayError("RELAY_TIMEOUT", "Relay \u8BA4\u8BC1\u8D85\u65F6"));
        }
        socket.close();
      }, 1e4);
      socket.addEventListener("open", () => {
        this.state = "authenticating";
        this.emit("status", this.status());
        socket.send(JSON.stringify(this.#hello(config, this.#token, false)));
      });
      socket.addEventListener("message", (event) => this.#handleMessage(event, { resolve, reject, settle: () => {
        settled = true;
      }, authenticationTimeout }));
      socket.addEventListener("error", () => {
        const error = new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket \u8FDE\u63A5\u5931\u8D25");
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
          reject(new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`));
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
        throw new RelayError("INVALID_MESSAGE", "Relay \u6D88\u606F\u8D85\u8FC7 1 MiB \u9650\u5236");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "\u5FFD\u7565 Relay \u7684\u65E0\u6548 JSON", { message: error.message });
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
      this.logger.info("relay", "Relay \u5DF2\u8FDE\u63A5\u5E76\u5B8C\u6210\u8BA4\u8BC1", { connectionId: this.connectionId });
      this.emit("status", this.status());
      this.emit("connected", message);
      handshake.settle();
      handshake.resolve(this.status());
      return;
    }
    if (message.type === "relay.error") {
      const authenticating = this.state === "authenticating";
      const error = new RelayError(message.code || "RELAY_ERROR", message.message || "Relay \u8FD4\u56DE\u9519\u8BEF");
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
      ...test ? { test: true } : {}
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
        timestamp: nowIso()
      });
    }, seconds * 1e3);
  }
  #handleFailure(error) {
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay \u8FDE\u63A5\u5F02\u5E38", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }
  #scheduleReconnect() {
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1e3 + Math.floor(Math.random() * 500);
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay \u5DF2\u65AD\u5F00\uFF0C\u8BA1\u5212\u91CD\u8FDE", { attempt: this.#attempt, delayMs: delay });
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => {
      this.#open().catch((error) => this.#handleFailure(error));
    }, delay);
  }
};

// server/connector-service.js
var ConnectorService = class extends EventEmitter4 {
  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1e3);
    this.dashboard = null;
    this.startedAt = null;
    this.eventQueue = Promise.resolve();
    this.threadAccess = /* @__PURE__ */ new Map();
    this.router = new CommandRouter({
      configStore: this.configStore,
      appServer: this.appServer,
      service: this,
      logger: this.logger
    });
    this.#wireEvents();
  }
  async start() {
    if (this.startedAt) return this.status();
    await this.configStore.load();
    this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.logger.info("connector", "Codex Relay Connector \u5DF2\u542F\u52A8");
    if (this.configStore.get().relay.autoConnect) {
      this.connect().catch((error) => this.logger.error("connector", "\u81EA\u52A8\u8FDE\u63A5\u5931\u8D25", { message: error.message }));
    }
    return this.status();
  }
  attachDashboard(dashboard2) {
    this.dashboard = dashboard2;
  }
  async stop() {
    this.relay.disconnect("connector stopped");
    await this.appServer.stop();
    await this.dashboard?.stop();
    this.startedAt = null;
  }
  async connect() {
    await this.start();
    const config = this.configStore.get();
    const token = await this.configStore.token();
    if (config.codex.autoStartAppServer) await this.appServer.start();
    return this.relay.connect(token);
  }
  disconnect() {
    this.relay.disconnect();
    return this.status();
  }
  async testConnection() {
    await this.start();
    return this.relay.test(await this.configStore.token());
  }
  async updateConfig(patch, token) {
    const wasConnected = ["connected", "connecting", "authenticating", "reconnecting"].includes(this.relay.state);
    if (wasConnected) this.relay.disconnect("configuration changed");
    const config = await this.configStore.update(patch, token);
    this.threadAccess.clear();
    if (wasConnected || config.relay.autoConnect) await this.connect();
    this.emit("status", await this.status());
    return config;
  }
  async status() {
    const config = await this.configStore.publicConfig();
    return {
      connector: {
        state: this.startedAt ? "running" : "stopped",
        startedAt: this.startedAt
      },
      relay: this.relay.status(),
      appServer: this.appServer.status(),
      room: {
        roomId: config.relay.roomId,
        deviceId: config.relay.deviceId,
        deviceName: config.relay.deviceName
      },
      security: {
        readOnly: config.readOnly,
        allowedProjects: config.allowedProjects.length,
        remoteApprovalEnabled: config.permissions.respondToApprovals,
        tokenConfigured: config.relay.tokenConfigured
      },
      protocol: {
        version: 1,
        latestSequence: this.eventBuffer.latestSequence()
      },
      dashboard: this.dashboard?.status() || { state: "stopped", url: null }
    };
  }
  async diagnostics() {
    const checks = [];
    try {
      checks.push({ name: "codex", ok: true, ...await this.appServer.checkAvailability() });
    } catch (error) {
      checks.push({ name: "codex", ok: false, error: error.message });
    }
    const config = await this.configStore.publicConfig();
    checks.push({
      name: "configuration",
      ok: Boolean(config.relay.url && config.relay.roomId && config.relay.tokenConfigured),
      details: {
        relayUrlConfigured: Boolean(config.relay.url),
        roomConfigured: Boolean(config.relay.roomId),
        tokenConfigured: config.relay.tokenConfigured
      }
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }
  async syncAfter(lastSequence) {
    const events = this.eventBuffer.after(lastSequence);
    if (events !== null && !(Number(lastSequence || 0) === 0 && events.length === 0)) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence() };
    }
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 50 }), allowedProjects);
    return {
      mode: "snapshot",
      status: await this.status(),
      threads,
      latestSequence: this.eventBuffer.latestSequence()
    };
  }
  #wireEvents() {
    this.relay.on("command", async (message) => {
      const response = await this.router.handle(message);
      this.relay.send(response);
    });
    this.relay.on("connected", async () => {
      this.relay.send({
        version: 1,
        type: "host.snapshot",
        roomId: this.configStore.get().relay.roomId,
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: await this.status()
      });
    });
    this.relay.on("status", (status) => this.emit("status", status));
    this.appServer.on("status", (status) => this.emit("status", status));
    this.appServer.on("notification", (method, params) => {
      const event = normalizeCodexNotification(method, params);
      if (!event) return;
      this.eventQueue = this.eventQueue.then(() => this.#forwardEvent(event, params)).catch((error) => this.logger.warn("connector", "Codex \u4E8B\u4EF6\u8F6C\u53D1\u5931\u8D25", { message: error.message }));
    });
    this.appServer.on("approval", (approval) => {
      this.eventQueue = this.eventQueue.then(() => this.#forwardEvent({ type: "approval.requested", ...approval }, approval.params)).catch((error) => this.logger.warn("connector", "\u5BA1\u6279\u4E8B\u4EF6\u8F6C\u53D1\u5931\u8D25", { message: error.message }));
    });
  }
  async #forwardEvent(event, params = {}) {
    if (!await this.#isEventAllowed(params)) return;
    const config = this.configStore.get();
    const envelope = eventEnvelope(config, this.eventBuffer, event, extractContext(params));
    this.relay.send(envelope);
    this.emit("event", envelope);
  }
  async #isEventAllowed(params) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return true;
    const context = extractContext(params);
    const cwd = params.cwd || params.thread?.cwd;
    if (cwd) {
      const allowed = Boolean(safeProjectPath(cwd, allowedProjects));
      if (context.threadId) this.threadAccess.set(context.threadId, allowed);
      return allowed;
    }
    if (!context.threadId) return false;
    if (this.threadAccess.has(context.threadId)) return this.threadAccess.get(context.threadId);
    try {
      const result = await this.appServer.readThread(context.threadId);
      const allowed = Boolean(result?.thread?.cwd && safeProjectPath(result.thread.cwd, allowedProjects));
      this.threadAccess.set(context.threadId, allowed);
      return allowed;
    } catch (error) {
      this.logger.warn("connector", "\u65E0\u6CD5\u786E\u8BA4\u4E8B\u4EF6\u6240\u5C5E\u9879\u76EE\uFF0C\u5DF2\u505C\u6B62\u8FDC\u7A0B\u8F6C\u53D1", { threadId: context.threadId, message: error.message });
      return false;
    }
  }
};

// server/dashboard-server.js
import crypto2 from "node:crypto";
import fs3 from "node:fs/promises";
import http from "node:http";
import path4 from "node:path";
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};
var DashboardServer = class {
  #server = null;
  #accessKey = crypto2.randomBytes(24).toString("base64url");
  #port = null;
  constructor(service, logger) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path4.join(PLUGIN_ROOT, "ui");
  }
  async start() {
    if (this.#server) return this.url();
    this.#server = http.createServer((request, response) => {
      this.#handle(request, response).catch((error) => {
        this.logger.error("dashboard", "\u63A7\u5236\u53F0\u8BF7\u6C42\u5931\u8D25", { message: error.message });
        this.#json(response, 500, { error: { code: "INTERNAL_ERROR", message: error.message } });
      });
    });
    await new Promise((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(0, "127.0.0.1", resolve);
    });
    this.#port = this.#server.address().port;
    this.logger.info("dashboard", "\u672C\u5730\u914D\u7F6E\u63A7\u5236\u53F0\u5DF2\u542F\u52A8", { port: this.#port });
    return this.url();
  }
  async stop() {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = null;
    await new Promise((resolve) => server.close(resolve));
    this.#port = null;
  }
  url() {
    return this.#port ? `http://127.0.0.1:${this.#port}/#key=${this.#accessKey}` : null;
  }
  status() {
    return { state: this.#server ? "running" : "stopped" };
  }
  async #handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    this.#securityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      if (!this.#authorized(request)) return this.#json(response, 401, { error: { code: "UNAUTHORIZED", message: "\u63A7\u5236\u53F0\u8BBF\u95EE\u5BC6\u94A5\u65E0\u6548" } });
      return this.#api(request, response, url);
    }
    if (!["GET", "HEAD"].includes(request.method)) return this.#json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "\u65B9\u6CD5\u4E0D\u5141\u8BB8" } });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path4.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path4.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
    try {
      const body = await fs3.readFile(file);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path4.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      if (request.method === "HEAD") return response.end();
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
      throw error;
    }
  }
  async #api(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/config") {
      return this.#json(response, 200, await this.service.configStore.publicConfig({ includeToken: true }));
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return this.#json(response, 200, await this.service.status());
    }
    if (request.method === "GET" && url.pathname === "/api/logs") {
      return this.#json(response, 200, { logs: this.service.logger.list(Number(url.searchParams.get("limit") || 100)) });
    }
    if (request.method === "GET" && url.pathname === "/api/diagnostics") {
      return this.#json(response, 200, await this.service.diagnostics());
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await this.#body(request);
      await this.service.updateConfig(body.config || {}, body.token);
      const config = await this.service.configStore.publicConfig({ includeToken: true });
      return this.#json(response, 200, config);
    }
    if (request.method === "POST" && url.pathname === "/api/connection/test") {
      return this.#json(response, 200, await this.service.testConnection());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/connect") {
      return this.#json(response, 200, await this.service.connect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/disconnect") {
      return this.#json(response, 200, await this.service.disconnect());
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/start") {
      return this.#json(response, 200, await this.service.appServer.start());
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/stop") {
      await this.service.appServer.stop();
      return this.#json(response, 200, this.service.appServer.status());
    }
    if (request.method === "DELETE" && url.pathname === "/api/logs") {
      this.service.logger.clear();
      return this.#json(response, 200, { ok: true });
    }
    return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "API \u4E0D\u5B58\u5728" } });
  }
  #authorized(request) {
    const authorization = request.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = Buffer.from(this.#accessKey);
    const actual = Buffer.from(supplied);
    return expected.length === actual.length && crypto2.timingSafeEqual(expected, actual);
  }
  async #body(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 256 * 1024) throw new Error("\u8BF7\u6C42\u5185\u5BB9\u8D85\u8FC7 256 KiB \u9650\u5236");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  #json(response, status, payload) {
    if (response.headersSent) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(payload));
  }
  #securityHeaders(response) {
    response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
};

// server/runtime.js
var runtime;
async function getRuntime() {
  if (runtime) return runtime;
  const service = new ConnectorService();
  await service.start();
  const dashboard2 = new DashboardServer(service, service.logger);
  service.attachDashboard(dashboard2);
  await dashboard2.start();
  runtime = { service, dashboard: dashboard2 };
  return runtime;
}
async function stopRuntime() {
  if (!runtime) return;
  await runtime.service.stop();
  runtime = null;
}

// server/dashboard-cli.js
var { dashboard } = await getRuntime();
console.log(`Codex Relay dashboard: ${dashboard.url()}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopRuntime();
    process.exit(0);
  });
}
