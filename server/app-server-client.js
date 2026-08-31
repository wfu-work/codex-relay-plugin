import { EventEmitter } from "node:events";
import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import { RelayError } from "./errors.js";

const execFileAsync = promisify(execFile);

export class AppServerClient extends EventEmitter {
  #process = null;
  #requests = new Map();
  #serverRequests = new Map();
  #nextId = 1;
  #starting = null;
  #paginatedThreads = null;

  static APPROVAL_METHODS = new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
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
      pendingApprovals: this.#serverRequests.size,
    };
  }

  async checkAvailability() {
    const executable = this.configStore.get().codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 10_000 });
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
    this.logger.info("app-server", "正在启动 Codex App Server", {
      executable: config.codex.executable,
    });
    const child = spawn(config.codex.executable || "codex", ["app-server"], {
      cwd: config.codex.defaultWorkingDirectory || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.#process = child;
    child.once("error", (error) => this.#handleExit(child, error));
    child.once("exit", (code, signal) => this.#handleExit(child, new Error(`App Server 已退出 (${code ?? signal})`)));
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
        version: "1.0.0",
      },
      capabilities: { experimentalApi: true },
    }, 15_000);
    this.notify("initialized", {});
    this.state = "ready";
    this.logger.info("app-server", "Codex App Server 已就绪", { version: this.version, pid: child.pid });
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
    for (const pending of this.#requests.values()) pending.reject(new RelayError("APP_SERVER_UNAVAILABLE", "App Server 已停止"));
    this.#requests.clear();
    this.#serverRequests.clear();
    this.emit("status", this.status());
  }

  request(method, params = {}, timeoutMs = 30_000) {
    if (!this.#process?.stdin?.writable) {
      return Promise.reject(new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server 未运行"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id);
        reject(new RelayError("APP_SERVER_TIMEOUT", `${method} 请求超时`));
      }, timeoutMs);
      this.#requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
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
      ...(params.cwd ? { cwd: params.cwd } : {}),
    });
  }

  listModels(params = {}) {
    return this.request("model/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 100), 100),
      includeHidden: params.includeHidden === true,
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
    // The paginated history contract keeps metadata on thread/read and moves
    // turns/items to dedicated list methods. Keep the connector response in
    // the legacy { thread: { turns } } shape so Relay clients remain stable.
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
    for (let page = 0; page < 1000; page += 1) {
      const response = await this.request("thread/turns/list", {
        threadId,
        cursor,
        limit: 100,
        sortDirection: "asc",
        itemsView: "full",
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const turn of data) {
        if (!isObject(turn)) continue;
        const items = turn.itemsView === "full" && Array.isArray(turn.items)
          ? turn.items
          : await this.#readAllThreadItems(threadId, turn.id);
        turns.push({ ...turn, items });
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor
        ? response.nextCursor
        : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return turns;
  }

  async #readAllThreadItems(threadId, turnId) {
    if (typeof turnId !== "string" || !turnId) return [];
    const items = [];
    let cursor = null;
    for (let page = 0; page < 1000; page += 1) {
      const response = await this.request("thread/items/list", {
        threadId,
        turnId,
        cursor,
        limit: 100,
        sortDirection: "asc",
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const entry of data) {
        if (isObject(entry?.item)) items.push(entry.item);
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor
        ? response.nextCursor
        : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return items;
  }

  createThread({ cwd } = {}) {
    return this.request("thread/start", { ...(cwd ? { cwd } : {}) });
  }

  resumeThread(threadId) {
    return this.request("thread/resume", { threadId });
  }

  startTurn({ threadId, text, cwd, model, effort }) {
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text }],
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    });
  }

  steerTurn({ threadId, turnId, text }) {
    return this.request("turn/steer", {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: "text", text }],
    });
  }

  interruptTurn({ threadId, turnId }) {
    return this.request("turn/interrupt", { threadId, turnId });
  }

  respondToApproval(approvalId, decision) {
    const key = String(approvalId);
    const request = this.#serverRequests.get(key);
    if (!request) throw new RelayError("APPROVAL_EXPIRED", "审批请求不存在或已经处理");
    this.#serverRequests.delete(key);
    this.#write({ jsonrpc: "2.0", id: request.id, result: { decision } });
    return { approvalId: String(approvalId), decision };
  }

  #write(message) {
    if (!this.#process?.stdin?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server 未运行");
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.warn("app-server", "忽略非 JSON 输出", { line });
      return;
    }
    if (message.id !== undefined && !message.method) {
      const pending = this.#requests.get(message.id);
      if (!pending) return;
      this.#requests.delete(message.id);
      if (message.error) pending.reject(new RelayError("APP_SERVER_ERROR", message.error.message || "App Server 请求失败", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      if (!AppServerClient.APPROVAL_METHODS.has(message.method)) {
        this.logger.warn("app-server", "拒绝不受支持的 App Server 客户端请求", { method: message.method });
        this.#write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Client request not supported: ${message.method}` },
        });
        return;
      }
      this.#serverRequests.set(String(message.id), message);
      this.emit("approval", {
        approvalId: String(message.id),
        method: message.method,
        params: message.params || {},
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
    this.logger.error("app-server", "Codex App Server 不可用", { message: error.message });
    for (const pending of this.#requests.values()) pending.reject(new RelayError("APP_SERVER_UNAVAILABLE", error.message));
    this.#requests.clear();
    this.emit("status", this.status());
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" &&
    typeof error?.message === "string" &&
    error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}
