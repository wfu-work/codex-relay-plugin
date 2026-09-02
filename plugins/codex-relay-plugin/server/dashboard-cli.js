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
  #paginatedThreads = null;
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
    this.#paginatedThreads = null;
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
        version: "1.0.0"
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
    this.#paginatedThreads = null;
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
  async listThreads(params = {}) {
    const limit = Math.min(Number(params.limit || 50), 100);
    const requestPage = (cursor2) => this.request("thread/list", {
      cursor: cursor2,
      limit,
      sortKey: params.sortKey || "updated_at",
      ...params.cwd ? { cwd: params.cwd } : {}
    });
    if (params.cursor != null) return requestPage(params.cursor);
    const first = await requestPage(null);
    if (!first || !Array.isArray(first.data)) return first;
    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor ? first.nextCursor : null;
    const seenCursors = /* @__PURE__ */ new Set();
    for (let page = 1; cursor && page < 1e3; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) {
        cursor = null;
      } else {
        cursor = nextCursor;
      }
    }
    return {
      ...first,
      data,
      nextCursor: null
    };
  }
  listModels(params = {}) {
    return this.request("model/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 100), 100),
      includeHidden: params.includeHidden === true
    });
  }
  readThread(threadId) {
    if (this.#paginatedThreads === true) return this.#readPaginatedThread(threadId);
    return this.request("thread/read", { threadId, includeTurns: true }).catch(async (error) => {
      if (!isPaginatedThreadReadError(error)) throw error;
      this.#paginatedThreads = true;
      return this.#readPaginatedThread(threadId);
    });
  }
  async #readPaginatedThread(threadId) {
    const metadata = await this.request("thread/read", { threadId });
    const turns = await this.#readAllThreadTurns(threadId);
    const metadataMap = isObject(metadata) ? metadata : {};
    const thread = isObject(metadataMap.thread) ? metadataMap.thread : metadataMap;
    const hydrated = { ...thread, turns };
    return isObject(metadataMap.thread) ? { ...metadataMap, thread: hydrated } : hydrated;
  }
  async #readAllThreadTurns(threadId) {
    const turns = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/turns/list", {
        threadId,
        cursor,
        limit: 100,
        sortDirection: "asc",
        itemsView: "full"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const turn of data) {
        if (!isObject(turn)) continue;
        const items = turn.itemsView === "full" && Array.isArray(turn.items) ? turn.items : await this.#readAllThreadItems(threadId, turn.id);
        turns.push({ ...turn, items });
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return turns;
  }
  async #readAllThreadItems(threadId, turnId) {
    if (typeof turnId !== "string" || !turnId) return [];
    const items = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/items/list", {
        threadId,
        turnId,
        cursor,
        limit: 100,
        sortDirection: "asc"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const entry of data) {
        if (isObject(entry?.item)) items.push(entry.item);
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return items;
  }
  createThread({ cwd } = {}) {
    return this.request("thread/start", { ...cwd ? { cwd } : {} });
  }
  resumeThread(threadId) {
    return this.request("thread/resume", { threadId });
  }
  startTurn({ threadId, text, cwd, model, effort }) {
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text }],
      ...cwd ? { cwd } : {},
      ...model ? { model } : {},
      ...effort ? { effort } : {}
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
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}

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
    return value.replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]").replace(/("?(?:token|connect[_-]?token|endpoint[_-]?grant|grant|secret|authorization|api[_-]?key|private[_-]?key|signature)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[REDACTED]");
  }
  return JSON.parse(redact(JSON.stringify(value)));
}
function normalizeRelayUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws:// \u6216 wss://");
  }
  if (!url.hostname) throw new Error("Relay \u5730\u5740\u7F3A\u5C11\u4E3B\u673A\u540D");
  if (url.username || url.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  if (url.search || url.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/v1/connect";
  if (url.pathname !== "/v1/connect") throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 /v1/connect");
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

// server/config-store.js
import fs3 from "node:fs/promises";
import os from "node:os";
import path4 from "node:path";

// server/secret-store.js
import crypto2 from "node:crypto";
import fs from "node:fs/promises";
import path2 from "node:path";
var SecretStore = class {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path2.join(configDir, "secrets.json");
    this.cache = /* @__PURE__ */ new Map();
    this.writeQueue = Promise.resolve();
  }
  async get(spaceId) {
    const credential = await this.getCredential(spaceId);
    return credential?.connectToken || null;
  }
  async getCredential(spaceId) {
    if (process.env.CODEX_RELAY_TOKEN) {
      return { connectToken: process.env.CODEX_RELAY_TOKEN };
    }
    const key = spaceId || "default";
    if (this.cache.has(key)) return cloneCredential(this.cache.get(key));
    const values = await this.#readFallback();
    const credential = values[key] ? validateCredential(values[key]) : null;
    this.cache.set(key, credential);
    return cloneCredential(credential);
  }
  async set(spaceId, credential) {
    const key = spaceId || "default";
    if (!credential) return this.delete(key);
    const normalized = validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return { backend: "file" };
    });
  }
  async update(spaceId, patch) {
    const current = await this.getCredential(spaceId) || {};
    return this.set(spaceId, { ...current, ...patch });
  }
  validate(credential) {
    return validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
  }
  async delete(spaceId) {
    const key = spaceId || "default";
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      delete values[key];
      await this.#writeFallback(values);
      this.cache.set(key, null);
    });
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
    const temporary = `${this.fallbackFile}.${process.pid}.${crypto2.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(values, null, 2)}
`, { mode: 384 });
    await fs.rename(temporary, this.fallbackFile);
    await fs.chmod(this.fallbackFile, 384);
  }
  #enqueue(operation) {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => void 0);
    return next;
  }
};
function validateCredential(value) {
  if (typeof value === "string") value = { connectToken: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Relay \u51ED\u8BC1\u683C\u5F0F\u65E0\u6548");
  }
  const connectToken = validateSecret(value.connectToken, "Connect Token", true);
  const endpointGrant = validateSecret(value.endpointGrant, "Endpoint Grant", false);
  const expiresAt = validateExpiry(value.expiresAt, "Connect Token");
  const grantExpiresAt = validateExpiry(value.grantExpiresAt, "Endpoint Grant");
  const tokenEndpoint = validateTokenEndpoint(value.tokenEndpoint);
  return {
    connectToken,
    ...expiresAt === void 0 ? {} : { expiresAt },
    ...endpointGrant === void 0 ? {} : { endpointGrant },
    ...grantExpiresAt === void 0 ? {} : { grantExpiresAt },
    ...tokenEndpoint === void 0 ? {} : { tokenEndpoint }
  };
}
function validateSecret(value, label, required) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new Error(`${label} \u4E0D\u80FD\u4E3A\u7A7A`);
    return void 0;
  }
  const minimum = label === "Endpoint Grant" ? 16 : 1;
  if (typeof value !== "string" || value.length < minimum || value.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} \u683C\u5F0F\u65E0\u6548`);
  }
  return value;
}
function validateExpiry(value, label) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} \u8FC7\u671F\u65F6\u95F4\u65E0\u6548`);
  return value;
}
function validateTokenEndpoint(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Token Endpoint \u65E0\u6548");
  const endpoint = new URL(value);
  if (!endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Token Endpoint \u4E0D\u80FD\u5305\u542B\u51ED\u8BC1\u3001query \u6216 hash");
  }
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
    throw new Error("\u975E\u672C\u673A Token Endpoint \u5FC5\u987B\u4F7F\u7528 https://");
  }
  return endpoint.toString();
}
function cloneCredential(value) {
  return value ? { ...value } : null;
}

// server/endpoint-identity-store.js
import crypto3 from "node:crypto";
import fs2 from "node:fs/promises";
import path3 from "node:path";
var EndpointIdentityStore = class {
  constructor(configDir) {
    this.configDir = configDir;
    this.file = path3.join(configDir, "endpoint-identity.json");
    this.identity = null;
  }
  async get() {
    if (this.identity) return { ...this.identity };
    try {
      this.identity = this.#validate(JSON.parse(await fs2.readFile(this.file, "utf8")));
      await fs2.chmod(this.file, 384);
      return { ...this.identity };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pair = crypto3.generateKeyPairSync("ed25519");
    const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
    const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const identity = {
      schemaVersion: 1,
      publicKey: Buffer.from(publicDer).subarray(-32).toString("base64url"),
      privateKey: Buffer.from(privateDer).toString("base64url")
    };
    await fs2.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.file}.${process.pid}.${crypto3.randomUUID()}.tmp`;
    await fs2.writeFile(temporary, `${JSON.stringify(identity, null, 2)}
`, { mode: 384 });
    await fs2.rename(temporary, this.file);
    await fs2.chmod(this.file, 384);
    this.identity = identity;
    return { ...identity };
  }
  #validate(value) {
    if (!value || value.schemaVersion !== 1) throw new Error("Endpoint identity schema is invalid");
    const publicBytes = Buffer.from(value.publicKey || "", "base64url");
    const privateBytes = Buffer.from(value.privateKey || "", "base64url");
    if (publicBytes.length !== 32 || publicBytes.toString("base64url") !== value.publicKey || privateBytes.length < 32 || privateBytes.toString("base64url") !== value.privateKey) {
      throw new Error("Endpoint identity key material is invalid");
    }
    return { schemaVersion: 1, publicKey: value.publicKey, privateKey: value.privateKey };
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
      spaceId: "",
      endpointId: "",
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
    this.configDir = configDir || process.env.CODEX_RELAY_CONFIG_DIR || path4.join(os.homedir(), ".codex-relay-plugin");
    this.configFile = path4.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.endpointIdentityStore = new EndpointIdentityStore(this.configDir);
    this.config = null;
  }
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs3.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.config = mergeConfig(defaultConfig(), migrateSavedConfig(saved));
    validateConfig(this.config);
    return this.config;
  }
  get() {
    if (!this.config) throw new Error("\u914D\u7F6E\u5C1A\u672A\u52A0\u8F7D");
    return structuredClone(this.config);
  }
  async publicConfig({ includeToken = false } = {}) {
    const config = this.get();
    const credential = await this.secretStore.getCredential(relaySpaceId(config.relay));
    const identity = await this.endpointIdentityStore.get();
    return {
      ...config,
      relay: {
        ...config.relay,
        ...includeToken ? {
          token: credential?.connectToken || "",
          ...credential?.endpointGrant ? { endpointGrant: credential.endpointGrant } : {}
        } : {},
        tokenConfigured: Boolean(credential?.connectToken),
        tokenExpiresAt: credential?.expiresAt || null,
        endpointGrantConfigured: Boolean(credential?.endpointGrant),
        grantExpiresAt: credential?.grantExpiresAt || null,
        tokenEndpoint: credential?.tokenEndpoint || "",
        endpointPublicKey: identity.publicKey
      }
    };
  }
  async update(patch, credentialPatch) {
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    const nextSpace = relaySpaceId(next.relay);
    let nextCredential;
    if (credentialPatch !== void 0) {
      if (typeof credentialPatch === "string") credentialPatch = { connectToken: credentialPatch };
      if (!credentialPatch || typeof credentialPatch !== "object" || Array.isArray(credentialPatch)) {
        throw new Error("Relay Token \u51ED\u8BC1\u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      if (Object.hasOwn(credentialPatch, "token")) {
        throw new Error("Relay Token \u5FC5\u987B\u901A\u8FC7\u5B57\u7B26\u4E32\u6216 connectToken \u5B57\u6BB5\u63D0\u4F9B");
      }
      const current = await this.secretStore.getCredential(nextSpace) || {};
      const credential = credentialPatch.connectToken ? {
        connectToken: credentialPatch.connectToken,
        ...credentialPatch.expiresAt ? { expiresAt: credentialPatch.expiresAt } : {},
        ...credentialField(credentialPatch, "endpointGrant"),
        ...credentialField(credentialPatch, "grantExpiresAt"),
        ...credentialField(credentialPatch, "tokenEndpoint")
      } : {
        ...current,
        ...credentialPatch.expiresAt ? { expiresAt: credentialPatch.expiresAt } : {},
        ...credentialField(credentialPatch, "endpointGrant"),
        ...credentialField(credentialPatch, "grantExpiresAt"),
        ...credentialField(credentialPatch, "tokenEndpoint")
      };
      if (Object.keys(credential).length) nextCredential = this.secretStore.validate(credential);
    }
    await fs3.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.configFile}.tmp`;
    await fs3.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    await fs3.rename(temporary, this.configFile);
    await fs3.chmod(this.configFile, 384);
    this.config = next;
    if (nextCredential) await this.secretStore.set(nextSpace, nextCredential);
    this.logger?.info("config", "\u914D\u7F6E\u5DF2\u4FDD\u5B58", { relayUrl: next.relay.url, spaceId: nextSpace });
    return this.publicConfig();
  }
  async relayCredential() {
    return this.secretStore.getCredential(relaySpaceId(this.get().relay));
  }
  async token() {
    const credential = await this.relayCredential();
    return credential?.connectToken || null;
  }
  async updateRelayCredential(patch) {
    const spaceId = relaySpaceId(this.get().relay);
    await this.secretStore.update(spaceId, patch);
    return this.secretStore.getCredential(spaceId);
  }
  async endpointIdentity() {
    return this.endpointIdentityStore.get();
  }
};
function credentialField(patch, name) {
  if (!Object.hasOwn(patch, name)) return {};
  return patch[name] === "" || patch[name] === null ? { [name]: void 0 } : { [name]: patch[name] };
}
function mergeConfig(base, patch) {
  const relayPatch = patch.relay || {};
  const spaceId = relayPatch.spaceId ?? base.relay.spaceId ?? "";
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...relayPatch, spaceId },
    codex: { ...base.codex, ...patch.codex || {} },
    permissions: { ...base.permissions, ...patch.permissions || {} },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects
  };
}
function relaySpaceId(relay) {
  return String(relay?.spaceId || "");
}
function relayEndpointId(relay) {
  return String(relay?.endpointId || "");
}
function migrateSavedConfig(saved) {
  if (!saved || typeof saved !== "object" || !saved.relay || typeof saved.relay !== "object") return saved;
  if (Object.hasOwn(saved.relay, "endpointId")) return saved;
  const legacyDeviceId = typeof saved.relay.deviceId === "string" ? saved.relay.deviceId : "";
  const endpointId = legacyDeviceId && !legacyDeviceId.startsWith("host_") ? legacyDeviceId : "";
  return { ...saved, relay: { ...saved.relay, endpointId } };
}
function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("\u914D\u7F6E\u7248\u672C\u65E0\u6548");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay \u914D\u7F6E\u65E0\u6548");
  if (config.relay.url) {
    const normalizedRelayUrl = normalizeRelayUrl(config.relay.url);
    const relayUrl = new URL(normalizedRelayUrl);
    config.relay.url = normalizedRelayUrl;
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("\u975E\u672C\u673A Relay \u5FC5\u987B\u4F7F\u7528 wss:// \u52A0\u5BC6\u8FDE\u63A5");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
    if (relayUrl.search || relayUrl.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  }
  const spaceId = relaySpaceId(config.relay);
  if (spaceId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(spaceId)) {
    throw new Error("Space ID \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u5192\u53F7\u548C\u8FDE\u5B57\u7B26");
  }
  const endpointId = relayEndpointId(config.relay);
  if (typeof config.relay.endpointId !== "string") throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (endpointId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(endpointId)) throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.deviceId || "")) throw new Error("\u5185\u90E8\u4E3B\u673A\u8EAB\u4EFD ID \u65E0\u6548");
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
  if (config.codex.defaultWorkingDirectory && !path4.isAbsolute(config.codex.defaultWorkingDirectory)) {
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
    if (typeof project !== "string" || !path4.isAbsolute(project)) throw new Error(`\u9879\u76EE\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${project}`);
  }
  return config;
}

// server/protocol.js
var PROTOCOL_VERSION = 1;
function validateRelayWelcome(message) {
  if (!message || typeof message !== "object" || message.type !== "connect.welcome") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u6D88\u606F\u65E0\u6548");
  }
  if (message.version !== PROTOCOL_VERSION) {
    throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "Relay \u8FD4\u56DE\u4E86\u4E0D\u517C\u5BB9\u7684\u534F\u8BAE\u7248\u672C");
  }
  if (!message.connectionId || typeof message.connectionId !== "string") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11 connectionId");
  }
  if (!message.sessionId || !message.spaceId || !message.endpointId) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11 sessionId\u3001spaceId \u6216 endpointId");
  }
  if (!Number.isSafeInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
  }
  return message;
}
var PRODUCT_FRAME_TYPES = /* @__PURE__ */ new Set(["codex.command", "codex.command.result", "codex.event", "host.snapshot"]);
function wrapRelayFrame(message, config) {
  if (!message || typeof message !== "object" || message.type === "stream.message") return message;
  if (!PRODUCT_FRAME_TYPES.has(message.type)) return message;
  return {
    version: PROTOCOL_VERSION,
    type: "stream.message",
    messageId: message.messageId || randomId("msg"),
    streamId: message.streamId || "codex",
    sequence: Number.isInteger(message.sequence) ? message.sequence : void 0,
    // Relay's directed-routing key is the authenticated Endpoint ID. The
    // legacy host deviceId remains product metadata, but must not be used as
    // the transport-level source/target identity.
    from: relayEndpointId(config.relay),
    ...message.targetDeviceId ? { to: message.targetDeviceId } : {},
    protocol: "codex.v1",
    encrypted: false,
    payload: message
  };
}
function unwrapRelayFrame(message) {
  if (!message || message.type !== "stream.message" || !message.payload || typeof message.payload !== "object") return message;
  const payload = { ...message.payload };
  if (message.from) payload.deviceId = message.from;
  if (message.to) payload.targetDeviceId = message.to;
  return payload;
}
var COMMAND_PERMISSIONS = Object.freeze({
  "host.get_status": "readThreads",
  "model.list": "readThreads",
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
  if (message.targetDeviceId !== relayEndpointId(config.relay)) throw new RelayError("DEVICE_NOT_TARGETED", "\u547D\u4EE4\u672A\u53D1\u9001\u7ED9\u672C\u673A\u63A5\u5165\u7AEF");
  if (message.spaceId !== relaySpaceId(config.relay)) throw new RelayError("SPACE_NOT_JOINED", "\u547D\u4EE4 Space \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  const commandType = message.command?.type;
  if (!Object.hasOwn(COMMAND_PERMISSIONS, commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${commandType || "unknown"}`);
  }
  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1e3) {
    throw new RelayError("MESSAGE_EXPIRED", "\u547D\u4EE4\u65F6\u95F4\u6233\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  }
  const permission = COMMAND_PERMISSIONS[commandType];
  if (config.readOnly && !["host.get_status", "model.list", "thread.list", "thread.read", "sync.request", "ping"].includes(commandType)) {
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
    spaceId: relaySpaceId(config.relay),
    sequence: buffer.nextSequence(),
    timestamp: nowIso(),
    ...context.threadId ? { threadId: context.threadId } : {},
    ...context.turnId ? { turnId: context.turnId } : {},
    event
  });
}
function commandResult(config, requestId, result, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId,
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
    timestamp: nowIso(),
    success: true,
    result
  };
}
function commandError(config, requestId, error, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId: requestId || randomId("invalid"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
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
    "thread/statusChanged": "thread.updated",
    "thread/status_changed": "thread.updated",
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/failed": "turn.failed",
    "turn/aborted": "turn.interrupted",
    "turn/interrupted": "turn.interrupted",
    "turn/status/changed": "thread.updated",
    "processing/heartbeat": "turn.heartbeat",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/agentMessage/textDelta": "message.assistant.delta",
    "item/agentMessage/text/delta": "message.assistant.delta",
    "item/agent_message/delta": "message.assistant.delta",
    "item/agent_message/text/delta": "message.assistant.delta",
    "item/agent_message/text_delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/reasoning/textDelta": "reasoning.delta",
    "item/reasoning/summaryText/delta": "reasoning.delta",
    "item/reasoning/summary_text_delta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/commandExecution/output/delta": "tool.output",
    "item/command_execution/output_delta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/fileChange/output/delta": "diff.updated",
    "item/file_change/output_delta": "diff.updated",
    "item/started": "item.started",
    "item/updated": "item.updated",
    "item/completed": "item.completed",
    error: "error"
  };
  const methodKey = normalizeNotificationMethod(method);
  const type = map[method] || Object.entries(map).find(([name]) => normalizeNotificationMethod(name) === methodKey)?.[1] || inferStreamingNotificationType(methodKey);
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params
  };
}
function normalizeNotificationMethod(method) {
  return String(method).trim().toLowerCase().replace(/[.-]+/g, "/").replace(/\/+/g, "/").replaceAll("_", "");
}
function inferStreamingNotificationType(methodKey) {
  if (!methodKey.endsWith("delta")) return null;
  if (methodKey.includes("item/agentmessage/") || methodKey.includes("item/assistant/")) {
    return "message.assistant.delta";
  }
  if (methodKey.includes("item/reasoning/")) return "reasoning.delta";
  if (methodKey.includes("item/commandexecution/") || methodKey.includes("item/tool/")) {
    return "tool.output";
  }
  if (methodKey.includes("item/filechange/") || methodKey.includes("item/diff/")) {
    return "diff.updated";
  }
  return null;
}
function extractContext(params = {}) {
  const thread = params.thread || {};
  const turn = params.turn || {};
  const item = params.item || {};
  return {
    threadId: params.threadId || params.thread_id || params.thread?.id || params.thread?.threadId || params.thread?.thread_id || thread.id || thread.threadId || thread.thread_id || item.threadId || item.thread_id,
    turnId: params.turnId || params.turn_id || params.turn?.id || params.turn?.turnId || params.turn?.turn_id || turn.id || turn.turnId || turn.turn_id || item.turnId || item.turn_id
  };
}

// server/command-router.js
var MAX_THREAD_READ_BYTES = 15e5;
var MAX_THREAD_READ_TURNS = 12;
var MAX_THREAD_ITEM_STRING_BYTES = 8192;
var MAX_THREAD_ARRAY_ITEMS = 128;
var CommandRouter = class {
  #completed = /* @__PURE__ */ new Map();
  #inflight = /* @__PURE__ */ new Map();
  #sharedReads = /* @__PURE__ */ new Map();
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
      const result = await this.#executeSharedRead(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {}, message.deviceId);
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
  }
  async #executeSharedRead(command, envelope) {
    if (!["thread.list", "thread.read"].includes(command.type)) {
      return this.#execute(command, envelope);
    }
    const key = JSON.stringify({
      deviceId: envelope.deviceId,
      threadId: envelope.threadId || null,
      command: stableValue(command)
    });
    const existing = this.#sharedReads.get(key);
    if (existing) return existing;
    const pending = this.#execute(command, envelope).finally(() => {
      if (this.#sharedReads.get(key) === pending) this.#sharedReads.delete(key);
    });
    this.#sharedReads.set(key, pending);
    return pending;
  }
  #failure(config, message, fingerprint, error) {
    const relayError = asRelayError(error);
    this.logger.warn("command", "\u8FDC\u7A0B\u547D\u4EE4\u6267\u884C\u5931\u8D25", {
      command: message?.command?.type,
      code: relayError.code,
      message: relayError.message
    });
    const response = commandError(config, message?.requestId, relayError, message?.deviceId);
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
      case "model.list":
        return this.appServer.listModels(command);
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const result = compactThreadReadResult(
          await this.appServer.readThread(requireString(command.threadId || envelope.threadId, "threadId"))
        );
        this.#assertThreadResultAllowed(result);
        return this.service.prepareResourceImages ? this.service.prepareResourceImages(result) : result;
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
          cwd: this.#allowedCwd(command.cwd),
          model: optionalString(command.model),
          effort: optionalString(command.effort)
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
    spaceId: message.spaceId,
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
function optionalString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || void 0;
}
function compactThreadReadResult(result) {
  if (!result || typeof result !== "object") return result;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_THREAD_READ_BYTES) return result;
  const sourceThread = result.thread && typeof result.thread === "object" ? result.thread : result;
  const sourceTurns = Array.isArray(sourceThread.turns) ? sourceThread.turns : [];
  const compactThread = compactValue({ ...sourceThread, turns: [] });
  const compactTurns = [];
  for (let index = sourceTurns.length - 1; index >= 0 && compactTurns.length < MAX_THREAD_READ_TURNS; index -= 1) {
    const turn = sourceTurns[index];
    if (!turn || typeof turn !== "object") continue;
    compactTurns.unshift(compactValue(turn));
    compactThread.turns = compactTurns;
    const candidate = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_THREAD_READ_BYTES) {
      compactTurns.shift();
      compactThread.turns = compactTurns;
      break;
    }
  }
  const compacted = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
  if (Buffer.byteLength(JSON.stringify(compacted), "utf8") <= MAX_THREAD_READ_BYTES) {
    return compacted;
  }
  const minimalThread = compactValue(Object.fromEntries(
    ["id", "sessionId", "cwd", "path", "preview", "name", "status", "createdAt", "updatedAt"].filter((key) => sourceThread[key] !== void 0).map((key) => [key, sourceThread[key]])
  ));
  minimalThread.turns = [];
  return result.thread && typeof result.thread === "object" ? { thread: minimalThread } : minimalThread;
}
function compactValue(value, depth = 0) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") <= MAX_THREAD_ITEM_STRING_BYTES) return value;
    const suffix = "\n\u2026\uFF08\u5386\u53F2\u8F93\u51FA\u5DF2\u622A\u65AD\uFF09";
    const maxChars = Math.max(0, MAX_THREAD_ITEM_STRING_BYTES - Buffer.byteLength(suffix, "utf8"));
    return `${value.slice(0, maxChars)}${suffix}`;
  }
  if (Array.isArray(value)) {
    const items = value.length > MAX_THREAD_ARRAY_ITEMS ? value.slice(-MAX_THREAD_ARRAY_ITEMS) : value;
    return items.map((item) => compactValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  if (depth > 8) return "[nested value omitted]";
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)])
  );
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

// server/instance-lock.js
import fs4 from "node:fs/promises";
import path5 from "node:path";
var LOCK_WRITE_GRACE_MS = 5e3;
var InstanceLock = class {
  #file = null;
  #handle = null;
  #acquirePromise = null;
  constructor(configDir, name = "connector.lock") {
    this.#file = path5.join(configDir, name);
  }
  async acquire() {
    if (this.#handle) return;
    if (this.#acquirePromise) return this.#acquirePromise;
    this.#acquirePromise = this.#acquire();
    try {
      await this.#acquirePromise;
    } finally {
      this.#acquirePromise = null;
    }
  }
  async #acquire() {
    await fs4.mkdir(path5.dirname(this.#file), { recursive: true, mode: 448 });
    for (; ; ) {
      try {
        this.#handle = await fs4.open(this.#file, "wx", 384);
        await this.#handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })}
`);
        return;
      } catch (error) {
        if (this.#handle) {
          await this.#handle.close().catch(() => {
          });
          this.#handle = null;
        }
        if (error.code !== "EEXIST") throw error;
        if (await this.#removeIfStale()) continue;
        const active = new Error("\u540C\u4E00\u914D\u7F6E\u76EE\u5F55\u5DF2\u6709 Codex Relay Connector \u5728\u8FD0\u884C");
        active.code = "RELAY_INSTANCE_ALREADY_RUNNING";
        throw active;
      }
    }
  }
  async release() {
    const handle = this.#handle;
    if (!handle) return;
    this.#handle = null;
    await handle.close().catch(() => {
    });
    await fs4.unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async #removeIfStale() {
    let record;
    try {
      record = JSON.parse(await fs4.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return true;
      try {
        const stat = await fs4.stat(this.#file);
        if (Date.now() - stat.mtimeMs < LOCK_WRITE_GRACE_MS) return false;
      } catch (statError) {
        if (statError.code === "ENOENT") return true;
        return false;
      }
      await fs4.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      await fs4.unlink(this.#file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
      await fs4.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
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
import crypto5 from "node:crypto";

// server/relay-token-service.js
import crypto4 from "node:crypto";
var REFRESH_LEAD_MS = 6e4;
var RelayTokenService = class {
  #refreshing = null;
  constructor(configStore, logger, options = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.fetch = options.fetch || globalThis.fetch;
  }
  async usableToken({ force = false, credential: suppliedCredential = null } = {}) {
    const credential = suppliedCredential || await this.#credential();
    if (!credential?.connectToken) throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token");
    const expiring = Number.isSafeInteger(credential.expiresAt) && credential.expiresAt <= Date.now() + REFRESH_LEAD_MS;
    if (!force && !expiring) return credential.connectToken;
    if (!credential.endpointGrant) {
      if (!force && credential.expiresAt > Date.now()) return credential.connectToken;
      throw new RelayError("auth.grant_required", "Connect Token \u5DF2\u8FC7\u671F\u4E14\u672A\u914D\u7F6E Endpoint Grant");
    }
    if (Number.isSafeInteger(credential.grantExpiresAt) && credential.grantExpiresAt <= Date.now()) {
      throw new RelayError("auth.grant_expired", "Endpoint Grant \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u7B7E\u53D1\u51ED\u8BC1");
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
    if (!tokenEndpoint) throw new RelayError("auth.refresh_invalid", "\u672A\u914D\u7F6E\u6709\u6548\u7684 Token \u5237\u65B0\u5730\u5740");
    const requestId = randomId("refresh");
    const issuedAt = Date.now();
    const nonce = crypto4.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-token-v1",
      requestId,
      issuedAt,
      nonce,
      credential.endpointGrant
    ].join("\n");
    const privateKey = crypto4.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
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
            signature: crypto4.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
          }
        }),
        signal: AbortSignal.timeout(1e4)
      });
    } catch (error) {
      throw new RelayError("RELAY_UNAVAILABLE", `Connect Token \u5237\u65B0\u5931\u8D25\uFF1A${error.message}`);
    }
    const body = await response.json().catch(() => null);
    const errorCode = body?.data?.errorCode;
    if (!response.ok || Number.isInteger(body?.code) && body.code !== 200) {
      throw new RelayError(errorCode || "auth.refresh_rejected", body?.msg || `Connect Token \u5237\u65B0\u88AB\u62D2\u7EDD\uFF08HTTP ${response.status}\uFF09`);
    }
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    if (typeof data?.connectToken !== "string" || data.connectToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(data.connectToken) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) {
      throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u5237\u65B0\u51ED\u8BC1");
    }
    if (typeof this.configStore.updateRelayCredential !== "function") {
      throw new RelayError("AUTH_FAILED", "\u5F53\u524D\u51ED\u8BC1\u5B58\u50A8\u4E0D\u652F\u6301\u81EA\u52A8\u7EED\u671F");
    }
    const updated = await this.configStore.updateRelayCredential({
      connectToken: data.connectToken,
      expiresAt: data.expiresAt,
      ...credential.tokenEndpoint ? {} : { tokenEndpoint },
      ...Number.isSafeInteger(data.grantExpiresAt) ? { grantExpiresAt: data.grantExpiresAt } : {}
    });
    this.logger.info("relay", "Connect Token \u5DF2\u901A\u8FC7 Endpoint Grant \u81EA\u52A8\u7EED\u671F", {
      expiresAt: new Date(updated.expiresAt).toISOString()
    });
    return updated;
  }
  async #credential() {
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential();
    }
    const token = typeof this.configStore.token === "function" ? await this.configStore.token() : typeof this.configStore.get === "function" ? await this.configStore.get() : null;
    if (typeof token === "string") return token ? { connectToken: token } : null;
    if (typeof token?.relay?.token === "string" && token.relay.token) {
      return { connectToken: token.relay.token };
    }
    return null;
  }
};
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

// server/relay-client.js
var TERMINAL_RELAY_AUTH_CODES = /* @__PURE__ */ new Set([
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
  "handshake.invalid",
  "connection.kicked"
]);
var RelayClient = class extends EventEmitter3 {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #connectPromise = null;
  #socketGeneration = 0;
  #attempt = 0;
  #manualClose = false;
  #token = null;
  #credential = null;
  #tokenService;
  #maxFrameSize = 10 * 1024 * 1024;
  #forceTokenRefresh = false;
  #resourceRequests = /* @__PURE__ */ new Map();
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
      reconnectAttempt: this.#attempt
    };
  }
  async connect(credential) {
    if (this.#connectPromise) return this.#connectPromise;
    if (["connected", "authenticating", "connecting", "disconnecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay \u5730\u5740");
    if (!spaceId) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Space ID");
    if (!relayEndpointId(config.relay)) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay Endpoint ID");
    const token = typeof credential === "string" ? credential : credential?.connectToken;
    if (credential !== void 0 && !token) throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Token");
    if (credential === void 0) this.#credential = null;
    else if (typeof credential === "string") this.#credential = { connectToken: credential };
    else if (credential?.connectToken) this.#credential = { ...credential };
    this.#manualClose = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    return this.#beginOpen();
  }
  async test(credential, timeoutMs = 8e3) {
    if (this.state === "connected") {
      return {
        ok: true,
        connectionId: this.connectionId,
        protocolVersion: PROTOCOL_VERSION,
        reused: true
      };
    }
    if (["connecting", "authenticating", "reconnecting", "disconnecting"].includes(this.state)) {
      throw new RelayError("RELAY_BUSY", "Relay \u6B63\u5728\u8FDE\u63A5\u6216\u65AD\u5F00\uFF0C\u8BF7\u7B49\u5F85\u5F53\u524D\u64CD\u4F5C\u5B8C\u6210");
    }
    const config = this.configStore.get();
    const supplied = typeof credential === "string" ? { connectToken: credential } : credential;
    if (!config.relay.url || !relaySpaceId(config.relay) || !relayEndpointId(config.relay)) {
      throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Relay \u5730\u5740\u3001Space ID \u548C Relay Endpoint ID");
    }
    const token = await this.#tokenService.usableToken({ credential: supplied });
    if (!token) throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Connect Token");
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
  async disconnect(reason = "manual disconnect") {
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    const socket = this.#socket;
    const opening = this.#connectPromise;
    this.#credential = null;
    this.#token = null;
    this.#forceTokenRefresh = false;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
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
    if (opening) await opening.catch(() => {
    });
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
        "\u5F53\u524D Relay \u5957\u9910\u4E0D\u652F\u6301\u5B9A\u5411\u8F6C\u53D1\uFF0C\u654F\u611F\u547D\u4EE4\u672A\u53D1\u9001"
      );
      this.lastError = error.message;
      this.logger.warn("relay", "Relay \u672A\u63D0\u4F9B\u5B9A\u5411\u8F6C\u53D1\u80FD\u529B\uFF0C\u5DF2\u963B\u6B62\u76EE\u6807\u6D88\u606F", {
        code: error.code,
        target: frame.to
      });
      this.emit("status", this.status());
      return false;
    }
    const encoded = JSON.stringify(frame);
    if (Buffer.byteLength(encoded, "utf8") > this.#maxFrameSize) {
      this.lastError = "\u5F85\u53D1\u9001\u6D88\u606F\u8D85\u8FC7 Relay maxFrameSize \u9650\u5236";
      this.logger.warn("relay", "\u5DF2\u963B\u6B62\u8D85\u8FC7 maxFrameSize \u7684\u6D88\u606F", {
        bytes: Buffer.byteLength(encoded, "utf8"),
        maxFrameSize: this.#maxFrameSize,
        type: message?.type
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
      return Promise.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u5C1A\u672A\u8FDE\u63A5\uFF0C\u65E0\u6CD5\u4E0A\u4F20\u56FE\u7247"));
    }
    if (!this.features.includes("resources-v1")) {
      return Promise.reject(new RelayError("RESOURCE_UNSUPPORTED", "\u5F53\u524D Relay \u4E0D\u652F\u6301\u53D7\u63A7\u56FE\u7247\u8D44\u6E90"));
    }
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const frameBudget = Math.max(0, this.#maxFrameSize - 1024);
    const maxByFrame = Math.floor(frameBudget * 3 / 4);
    if (!bytes.length || bytes.length > Math.min(6 * 1024 * 1024, maxByFrame)) {
      return Promise.reject(new RelayError("RESOURCE_TOO_LARGE", "\u56FE\u7247\u8D85\u8FC7 6 MiB \u9650\u5236"));
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
        ...Number.isInteger(ttlSeconds) ? { ttlSeconds } : {}
      }
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#resourceRequests.delete(requestId);
        reject(new RelayError("RESOURCE_TIMEOUT", "Relay \u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u8D85\u65F6"));
      }, 15e3);
      this.#resourceRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
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
      this.#token = await this.#tokenService.usableToken({
        force: this.#forceTokenRefresh,
        credential: this.#credential
      });
      this.#forceTokenRefresh = false;
      if (typeof this.configStore.relayCredential === "function") {
        this.#credential = await this.configStore.relayCredential();
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
    this.logger.info("relay", "\u6B63\u5728\u8FDE\u63A5 Relay", { url: config.relay.url, spaceId });
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
        const error = new RelayError("RELAY_TIMEOUT", "Relay \u8BA4\u8BC1\u8D85\u65F6");
        reportFailure(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
        socket.close();
      }, 1e4);
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
        settle: () => {
          settled = true;
        },
        authenticationTimeout,
        socket,
        isCurrent,
        reportFailure,
        markEstablished: () => {
          established = true;
        }
      }));
      socket.addEventListener("error", () => {
        const error = new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket \u8FDE\u63A5\u5931\u8D25");
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
        if (!settled) {
          settled = true;
          const error = new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`);
          reportFailure(error);
          reject(error);
        }
        if (established && !failureReported && !this.#manualClose) {
          reportFailure(new RelayError("RELAY_UNAVAILABLE", `Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF1A${event.code}`));
        }
        this.#socket = null;
        if (this.#resourceRequests.size) {
          for (const pending of this.#resourceRequests.values()) {
            pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
          }
          this.#resourceRequests.clear();
        }
        if (!this.#manualClose && !isTerminalRelayFailure({ code: failureCode }, this.#credential)) {
          this.#scheduleReconnect();
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
        throw new RelayError("INVALID_MESSAGE", "Relay \u6D88\u606F\u8D85\u8FC7 maxFrameSize \u9650\u5236");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "\u5FFD\u7565 Relay \u7684\u65E0\u6548 JSON", { message: error.message });
      return;
    }
    if (message.type === "connect.welcome") {
      if (this.state !== "authenticating" || handshake.isCurrent && !handshake.isCurrent()) return;
      try {
        validateRelayWelcome(message);
        validateWelcomeIdentity(message, this.configStore.get());
        if (!Number.isInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
          throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
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
      if (error.code === "auth.token_expired" && this.#credential?.endpointGrant) {
        this.#forceTokenRefresh = true;
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
    const nonce = crypto5.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-v1",
      PROTOCOL_VERSION,
      requestId,
      spaceId,
      endpointId,
      "bridge",
      token,
      issuedAt,
      nonce
    ].join("\n");
    const privateKey = crypto5.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
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
        signature: crypto5.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
      },
      capabilities: ["threads", "turns", "streaming", "steer", "interrupt", "approvals", "sync-v1", "resources-v1"],
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
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: nowIso()
      });
    }, seconds * 1e3);
  }
  #handleFailure(error) {
    if (isTerminalRelayFailure(error, this.#credential)) this.#manualClose = true;
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay \u8FDE\u63A5\u5F02\u5E38", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }
  #scheduleReconnect() {
    if (this.#manualClose || this.#reconnectTimer) return;
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1e3 + Math.floor(Math.random() * 500);
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay \u5DF2\u65AD\u5F00\uFF0C\u8BA1\u5212\u91CD\u8FDE", { attempt: this.#attempt, delayMs: delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#manualClose) return;
      this.#beginOpen().catch(() => {
      });
    }, delay);
  }
};
function isTerminalRelayFailure(error, credential) {
  const code = typeof error === "string" ? error : error?.code;
  if (code === "connection.rejected") return true;
  if (code === "auth.token_expired" && credential?.endpointGrant) return false;
  return TERMINAL_RELAY_AUTH_CODES.has(code);
}
function closeSocket(socket, reason) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 3e3);
    try {
      socket.addEventListener("close", finish, { once: true });
      socket.close(1e3, reason);
    } catch {
      finish();
    }
  });
}
function validateWelcomeIdentity(message, config) {
  const expectedSpaceId = relaySpaceId(config.relay);
  const expectedEndpointId = relayEndpointId(config.relay);
  if (message.spaceId !== expectedSpaceId || message.endpointId !== expectedEndpointId) {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7684 Space \u6216 Endpoint \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  }
}

// server/resource-images.js
import { execFile as execFile2 } from "node:child_process";
import fs5 from "node:fs/promises";
import os2 from "node:os";
import path6 from "node:path";
import { promisify as promisify2 } from "node:util";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var MAX_IMAGE_BYTES = 6 * 1024 * 1024;
var INLINE_THUMBNAIL_BYTES = 256 * 1024;
var execFileAsync2 = promisify2(execFile2);
function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;]+)?;base64,([a-z0-9+/=_-]+)$/i.exec(value.trim());
  if (!match) return null;
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: match[1].toLowerCase(), bytes };
}
function imageDataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
function imageMimeForPath(filePath) {
  const extension = path6.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif"
  }[extension] || "";
}
function localPathFromValue(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("file://")) {
    try {
      return fileURLToPath2(candidate);
    } catch {
      return null;
    }
  }
  return path6.isAbsolute(candidate) ? candidate : null;
}
async function parseLocalImage(value, declaredMime, allowedRoots) {
  const candidate = localPathFromValue(value);
  if (!candidate) return null;
  const roots = await Promise.all([os2.tmpdir(), ...allowedRoots || []].filter((root) => typeof root === "string" && path6.isAbsolute(root)).map(async (root) => {
    try {
      return await fs5.realpath(root);
    } catch {
      return path6.resolve(root);
    }
  }));
  let realPath;
  try {
    realPath = await fs5.realpath(candidate);
  } catch {
    return null;
  }
  if (!roots.some((root) => realPath === root || realPath.startsWith(`${root}${path6.sep}`))) return null;
  const mime = typeof declaredMime === "string" && declaredMime.toLowerCase().startsWith("image/") ? declaredMime.toLowerCase() : imageMimeForPath(realPath);
  if (!mime) return null;
  try {
    const stat = await fs5.stat(realPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return null;
    return { mime, bytes: await fs5.readFile(realPath) };
  } catch {
    return null;
  }
}
function thumbnailDataUrl(mime, bytes) {
  return bytes.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl(mime, bytes) : "";
}
async function createThumbnailDataUrl(mime, bytes) {
  const inline = thumbnailDataUrl(mime, bytes);
  if (inline || process.platform !== "darwin") return inline;
  const directory = await fs5.mkdtemp(path6.join(os2.tmpdir(), "recodex-thumb-"));
  const extension = mime.split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "") || "img";
  const input = path6.join(directory, `source.${extension}`);
  const output = path6.join(directory, "thumbnail.jpg");
  try {
    await fs5.writeFile(input, bytes, { mode: 384 });
    await execFileAsync2("sips", ["--resampleWidth", "640", "--setProperty", "format", "jpeg", input, "--out", output], { timeout: 5e3 });
    const thumbnail = await fs5.readFile(output);
    return thumbnail.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl("image/jpeg", thumbnail) : "";
  } catch {
    return "";
  } finally {
    await fs5.rm(directory, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function prepareEventImages(value, upload, seen = /* @__PURE__ */ new WeakSet(), options = {}) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => prepareEventImages(entry, upload, seen, options)));
  }
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = await prepareEventImages(entry, upload, seen, options);
  }
  const sourceKeys = ["dataUrl", "data_url", "imageUrl", "image_url", "url", "path", "filePath", "file_path", "localPath", "local_path", "data"];
  let sourceKey = null;
  let source = null;
  for (const key of sourceKeys) {
    const parsed = parseImageDataUrl(value[key]) || await parseLocalImage(
      value[key],
      value.mime || value.mimeType || value.mediaType,
      options.allowedRoots
    );
    if (parsed) {
      sourceKey = key;
      source = parsed;
      break;
    }
  }
  if (!source) return result;
  const existingThumbnail = parseImageDataUrl(value.thumbnailDataUrl || value.thumbnail_data_url);
  const thumb = existingThumbnail ? imageDataUrl(existingThumbnail.mime, existingThumbnail.bytes) : await createThumbnailDataUrl(source.mime, source.bytes);
  if (thumb) result.thumbnailDataUrl = thumb;
  try {
    const ready = await upload({ mime: source.mime, bytes: source.bytes });
    if (ready?.resourceUrl) {
      result.resourceUrl = ready.resourceUrl;
      if (ready.expiresAt) result.expiresAt = ready.expiresAt;
      if (sourceKey === "dataUrl" || sourceKey === "data_url" || sourceKey === "data") {
        delete result[sourceKey];
      } else {
        result[sourceKey] = ready.resourceUrl;
      }
    }
  } catch {
  }
  const removableSource = /* @__PURE__ */ new Set(["dataUrl", "data_url", "data", "url", "imageUrl", "image_url", "path", "filePath", "file_path", "localPath", "local_path"]);
  const localSource = ["path", "filePath", "file_path", "localPath", "local_path"].includes(sourceKey) || sourceKey === "url" && localPathFromValue(value[sourceKey]) !== null;
  if (!result.resourceUrl && removableSource.has(sourceKey) && (localSource || source.bytes.length > INLINE_THUMBNAIL_BYTES)) {
    delete result[sourceKey];
  }
  return result;
}

// server/connector-service.js
var ConnectorService = class extends EventEmitter4 {
  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.instanceLock = options.instanceLock || null;
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1e3);
    this.dashboard = null;
    this.startedAt = null;
    this.starting = null;
    this.autoConnectStarted = false;
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
    if (!this.starting) {
      this.starting = (async () => {
        await this.configStore.load();
        this.instanceLock ||= new InstanceLock(this.configStore.configDir);
        this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.logger.info("connector", "Codex Relay Connector \u5DF2\u542F\u52A8");
      })();
    }
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
    if (this.configStore.get().relay.autoConnect && !this.autoConnectStarted) {
      this.autoConnectStarted = true;
      this.connect().catch((error) => this.logger.error("connector", "\u81EA\u52A8\u8FDE\u63A5\u5931\u8D25", { message: error.message }));
    }
    return this.status();
  }
  attachDashboard(dashboard2) {
    this.dashboard = dashboard2;
  }
  async stop() {
    await this.disconnect("connector stopped");
    await this.appServer.stop();
    await this.dashboard?.stop();
    this.startedAt = null;
    this.autoConnectStarted = false;
  }
  async connect() {
    await this.start();
    const config = this.configStore.get();
    const credential = await this.configStore.relayCredential();
    await this.instanceLock.acquire();
    try {
      if (config.codex.autoStartAppServer) await this.appServer.start();
      return await this.relay.connect(credential);
    } catch (error) {
      if (this.relay.state !== "reconnecting") await this.instanceLock.release();
      throw error;
    }
  }
  async disconnect(reason = "manual disconnect") {
    await this.relay.disconnect(reason);
    await this.instanceLock?.release();
    return this.status();
  }
  async testConnection() {
    await this.start();
    return this.relay.test(await this.configStore.relayCredential());
  }
  async updateConfig(patch, credentialPatch) {
    const wasConnected = ["connected", "connecting", "authenticating", "reconnecting"].includes(this.relay.state);
    if (wasConnected) await this.disconnect("configuration changed");
    const config = await this.configStore.update(patch, credentialPatch);
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
      space: {
        spaceId: relaySpaceId(config.relay),
        endpointId: relayEndpointId(config.relay),
        endpointType: "bridge",
        deviceId: config.relay.deviceId,
        deviceName: config.relay.deviceName
      },
      security: {
        readOnly: config.readOnly,
        allowedProjects: config.allowedProjects.length,
        remoteApprovalEnabled: config.permissions.respondToApprovals,
        tokenConfigured: config.relay.tokenConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
        endpointPublicKey: config.relay.endpointPublicKey
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
      ok: Boolean(config.relay.url && relaySpaceId(config.relay) && relayEndpointId(config.relay) && config.relay.tokenConfigured),
      details: {
        relayUrlConfigured: Boolean(config.relay.url),
        spaceConfigured: Boolean(relaySpaceId(config.relay)),
        endpointConfigured: Boolean(relayEndpointId(config.relay)),
        endpointId: relayEndpointId(config.relay),
        tokenConfigured: config.relay.tokenConfigured,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint
      }
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }
  async prepareResourceImages(value) {
    const config = this.configStore.get();
    return prepareEventImages(value, async ({ mime, bytes }) => {
      try {
        return await this.relay.uploadResource({ mime, data: bytes });
      } catch (error) {
        this.logger.warn("resource", "\u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u5931\u8D25\uFF0C\u4FDD\u7559\u5185\u8054\u56DE\u9000", { message: error.message });
        return null;
      }
    }, /* @__PURE__ */ new WeakSet(), {
      allowedRoots: [
        ...Array.isArray(config.allowedProjects) ? config.allowedProjects : [],
        config.codex?.defaultWorkingDirectory
      ]
    });
  }
  async syncAfter(lastSequence) {
    const events = this.eventBuffer.after(lastSequence);
    const requestedSequence = Number(lastSequence || 0);
    const latestSequence = this.eventBuffer.latestSequence();
    if (events !== null && requestedSequence <= latestSequence && !(requestedSequence === 0 && events.length === 0)) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence() };
    }
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 100 }), allowedProjects);
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
      if (!this.relay.send(response)) {
        this.logger.warn("connector", "Relay \u672A\u63A5\u53D7\u5B9A\u5411\u547D\u4EE4\u54CD\u5E94\uFF0C\u6D88\u606F\u672A\u53D1\u9001", {
          requestId: message?.requestId,
          targetDeviceId: response?.targetDeviceId
        });
      }
    });
    this.relay.on("connected", async () => {
      this.relay.send({
        version: 1,
        type: "host.snapshot",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: await this.status()
      });
    });
    this.relay.on("status", (status) => this.emit("status", status));
    this.relay.on("disconnected", () => {
      this.instanceLock?.release().catch((error) => {
        this.logger.warn("connector", "\u91CA\u653E Connector \u5B9E\u4F8B\u9501\u5931\u8D25", { message: error.message });
      });
    });
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
    const preparedEvent = await this.prepareResourceImages(event);
    const envelope = eventEnvelope(config, this.eventBuffer, preparedEvent, extractContext(params));
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
import crypto6 from "node:crypto";
import fs6 from "node:fs/promises";
import http from "node:http";
import path7 from "node:path";
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};
var DashboardServer = class {
  #server = null;
  #accessKey = crypto6.randomBytes(24).toString("base64url");
  #port = null;
  constructor(service, logger) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path7.join(PLUGIN_ROOT, "ui");
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
    const file = path7.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path7.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
    try {
      const body = await fs6.readFile(file);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path7.extname(file)] || "application/octet-stream",
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
      const credential = body.credential || (body.token !== void 0 || body.endpointGrant !== void 0 || body.grantExpiresAt !== void 0 || body.tokenEndpoint !== void 0 ? {
        ...body.token !== void 0 ? { connectToken: body.token } : {},
        ...body.endpointGrant !== void 0 ? { endpointGrant: body.endpointGrant } : {},
        ...body.grantExpiresAt !== void 0 ? { grantExpiresAt: body.grantExpiresAt } : {},
        ...body.tokenEndpoint !== void 0 ? { tokenEndpoint: body.tokenEndpoint } : {}
      } : void 0);
      await this.service.updateConfig(body.config || {}, credential);
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
    return expected.length === actual.length && crypto6.timingSafeEqual(expected, actual);
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
