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
  #threadListSortMode = null;
  // `thread/read` only reads persisted history; it does not subscribe this
  // App Server connection to subsequent turn/item notifications. Keep track
  // of threads resumed in this process so a remote client can receive live
  // updates for a task that was originally opened by another Codex client.
  #resumedThreads = new Set();
  #resumingThreads = new Map();
  #resumeRetryAt = new Map();

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
    this.#threadListSortMode = null;
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
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
    this.#threadListSortMode = null;
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
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

  async listThreads(params = {}) {
    const limit = Math.min(Number(params.limit || 50), 100);
    const requestedSortKey = params.sortKey || "recency_at";
    const requestedSortDirection = params.sortDirection || "desc";
    const useDefaultSort = params.sortKey == null && params.sortDirection == null;
    let effectiveSortKey = requestedSortKey;
    let includeSortDirection = true;
    if (useDefaultSort && this.#threadListSortMode) {
      [effectiveSortKey, includeSortDirection] = this.#threadListSortMode;
    }
    const requestPage = (cursor) => this.request("thread/list", {
      cursor,
      limit,
      sortKey: effectiveSortKey,
      ...(includeSortDirection ? { sortDirection: requestedSortDirection } : {}),
      ...(params.cwd ? { cwd: params.cwd } : {}),
    });

    // `recency_at` is the sort key used by the current Codex sidebar. Older
    // App Server builds only know `updated_at` (and some reject the newer
    // sortDirection parameter as well), so make the compatibility downgrade
    // once per catalog request instead of failing the whole sidebar refresh.
    const requestFirstPage = async () => {
      if (useDefaultSort && this.#threadListSortMode) {
        return requestPage(null);
      }
      try {
        const result = await requestPage(null);
        if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
        return result;
      } catch (error) {
        if (requestedSortKey !== "recency_at" || !isUnsupportedThreadSort(error)) {
          throw error;
        }
        // Try the new key without the optional direction first. This handles
        // servers that understand `recency_at` but predate `sortDirection`.
        const fallbacks = [
          ["recency_at", false],
          ["updated_at", true],
          ["updated_at", false],
        ];
        let lastError = error;
        for (const [sortKey, withDirection] of fallbacks) {
          effectiveSortKey = sortKey;
          includeSortDirection = withDirection;
          try {
            const result = await requestPage(null);
            if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
            return result;
          } catch (fallbackError) {
            if (!isUnsupportedThreadSort(fallbackError)) throw fallbackError;
            lastError = fallbackError;
          }
        }
        throw lastError;
      }
    };

    // A cursor supplied by a caller means it explicitly requested one page.
    // Without a cursor, fetch every page so callers such as the Relay sidebar
    // can build a complete project list instead of seeing only the newest
    // page of threads.  The app server currently returns at most 100 items
    // per page; the guard prevents a malformed cursor chain from looping
    // forever while still allowing a large local history to be synchronized.
    const first = params.cursor != null
      ? await requestPage(params.cursor)
      : await requestFirstPage();
    if (params.cursor != null) return first;
    if (!first || !Array.isArray(first.data)) return first;

    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor
      ? first.nextCursor
      : null;
    const seenCursors = new Set();
    for (let page = 1; cursor && page < 1000; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor
        ? response.nextCursor
        : null;
      if (!nextCursor || nextCursor === cursor) {
        cursor = null;
      } else {
        cursor = nextCursor;
      }
    }
    return {
      ...first,
      // Some App Server builds can repeat a historical thread at a page
      // boundary while the on-disk index is being updated. The thread id is
      // the stable identity shared by desktop and Relay; collapse duplicates
      // before exposing the catalog so clients do not render two rows for one
      // task during eventual convergence.
      data: sortThreadList(
        dedupeThreadList(data),
        requestedSortDirection,
        effectiveSortKey,
      ),
      nextCursor: null,
    };
  }

  listModels(params = {}) {
    return this.request("model/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 100), 100),
      includeHidden: params.includeHidden === true,
    });
  }

  async listProjects(params = {}) {
    const limit = Math.min(Number(params.limit || 100), 100);
    const requestPage = (cursor) => this.request("project/list", {
      cursor,
      limit,
    });

    if (params.cursor != null) return requestPage(params.cursor);

    const first = await requestPage(null);
    if (!first || !Array.isArray(first.data)) return first;

    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor
      ? first.nextCursor
      : null;
    const seenCursors = new Set();
    for (let page = 1; cursor && page < 1000; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor
        ? response.nextCursor
        : null;
      cursor = !nextCursor || nextCursor === cursor ? null : nextCursor;
    }
    return {
      ...first,
      data: sortProjectList(dedupeProjectList(data)),
      nextCursor: null,
    };
  }

  async readThread(threadId) {
    const id = normalizeThreadId(threadId);
    await this.ensureThreadResumed(id);
    if (this.#paginatedThreads === true) return this.#readPaginatedThread(id);
    return this.request("thread/read", { threadId: id, includeTurns: true }).catch(async (error) => {
      if (!isPaginatedThreadReadError(error)) throw error;
      this.#paginatedThreads = true;
      return this.#readPaginatedThread(id);
    });
  }

  /**
   * Read the persisted thread snapshot without trying to acquire the thread
   * writer or subscribe this connection to future notifications.
   *
   * The official desktop client owns some threads through its private stdio
   * App Server. Those threads are still readable from the shared Codex
   * history, but `thread/resume` is rejected with an active-writer error.
   * Relay reads used for reconciliation must therefore be side-effect free;
   * starting a new turn remains responsible for resuming the thread when
   * necessary.
   */
  async readThreadSnapshot(threadId) {
    const id = normalizeThreadId(threadId);
    if (this.#paginatedThreads === true) return this.#readPaginatedThread(id);
    return this.request("thread/read", { threadId: id, includeTurns: true }).catch(async (error) => {
      if (!isPaginatedThreadReadError(error)) throw error;
      this.#paginatedThreads = true;
      return this.#readPaginatedThread(id);
    });
  }

  // Unlike readThread(), this explicitly disables includeTurns. Codex still
  // returns the current thread status, but does not stream the full history.
  // The Relay client uses it as a cheap heartbeat for a selected task. The
  // explicit false also keeps older non-paginated servers from falling back
  // to their full-history default. By default the heartbeat also resumes the
  // thread once so status polling establishes the live event subscription.
  async readThreadStatus(threadId, { ensureResumed = true } = {}) {
    const id = normalizeThreadId(threadId);
    if (ensureResumed) await this.ensureThreadResumed(id);
    return this.request("thread/read", { threadId: id, includeTurns: false });
  }

  /** Metadata-only persisted read used by snapshot reconciliation. */
  readThreadStatusSnapshot(threadId) {
    return this.readThreadStatus(threadId, { ensureResumed: false });
  }

  /**
   * Ensure this App Server process is subscribed to a historical thread.
   *
   * Codex's `thread/read` endpoint is intentionally non-resuming: it returns
   * the stored snapshot but does not attach the connection to future
   * notifications. `thread/resume` is therefore required before the Relay
   * can forward output generated by the desktop Codex client. Concurrent
   * status/read calls share one resume request, and the completed set avoids
   * issuing a resume on every two-second heartbeat.
   */
  ensureThreadResumed(threadId) {
    const id = normalizeThreadId(threadId);
    if (this.#resumedThreads.has(id)) return Promise.resolve();
    const retryAt = this.#resumeRetryAt.get(id) || 0;
    if (retryAt > Date.now()) return Promise.resolve();
    const existing = this.#resumingThreads.get(id);
    if (existing) return existing;
    const pending = this.resumeThread(id)
      .then(() => {
        this.#resumedThreads.add(id);
        this.#resumeRetryAt.delete(id);
      })
      .catch((error) => {
        if (!isActiveWriterConflict(error)) throw error;
        // A different Codex client currently owns the thread writer. The
        // persisted read below is still useful, and retrying after a short
        // cooldown lets the Relay subscribe automatically once that writer
        // releases the thread without flooding App Server with resume calls.
        this.#resumeRetryAt.set(id, Date.now() + 5_000);
        this.logger.warn("app-server", "任务正在其他 Codex 客户端运行，暂以快照同步", {
          threadId: id,
        });
      })
      .finally(() => {
        if (this.#resumingThreads.get(id) === pending) {
          this.#resumingThreads.delete(id);
        }
      });
    this.#resumingThreads.set(id, pending);
    return pending;
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

  async createThread({ cwd } = {}) {
    const result = await this.request("thread/start", { ...(cwd ? { cwd } : {}) });
    const id = result?.thread?.id || result?.id;
    if (id) this.#resumedThreads.add(normalizeThreadId(id));
    return result;
  }

  async resumeThread(threadId) {
    const id = normalizeThreadId(threadId);
    const result = await this.request("thread/resume", { threadId: id });
    this.#resumedThreads.add(id);
    return result;
  }

  async startTurn({ threadId, text, cwd, model, effort }) {
    const id = normalizeThreadId(threadId);
    const params = {
      threadId: id,
      input: [{ type: "text", text }],
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    };
    try {
      const result = await this.request("turn/start", params);
      this.#resumedThreads.add(id);
      return result;
    } catch (error) {
      // `thread/list` can expose an on-disk historical task before the App
      // Server has resumed it in the current process. Codex then rejects the
      // first turn with a precise "thread not found" error. Resume only that
      // case and retry once; all other errors (including an actually deleted
      // task) must keep their original failure semantics.
      if (!isThreadNotLoadedError(error)) throw error;
      await this.resumeThread(id);
      return this.request("turn/start", params);
    }
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
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
    this.lastError = error.message;
    this.logger.error("app-server", "Codex App Server 不可用", { message: error.message });
    for (const pending of this.#requests.values()) pending.reject(new RelayError("APP_SERVER_UNAVAILABLE", error.message));
    this.#requests.clear();
    this.emit("status", this.status());
  }
}

function normalizeThreadId(threadId) {
  const id = typeof threadId === "string" ? threadId.trim() : String(threadId || "").trim();
  if (!id) throw new RelayError("INVALID_MESSAGE", "threadId 不能为空");
  return id;
}

function dedupeThreadList(threads) {
  const seen = new Set();
  const unique = [];
  const indexes = new Map();
  for (const thread of threads) {
    if (!isObject(thread)) {
      unique.push(thread);
      continue;
    }
    const rawId = thread.id ?? thread.threadId ?? thread.thread_id;
    const id = typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id) {
      unique.push(thread);
      continue;
    }
    if (seen.has(id)) {
      const index = indexes.get(id);
      const previous = index == null ? null : unique[index];
      if (
        previous &&
        threadRecency(thread) > threadRecency(previous)
      ) {
        unique[index] = thread;
      }
      continue;
    }
    seen.add(id);
    indexes.set(id, unique.length);
    unique.push(thread);
  }
  return unique;
}

function sortThreadList(threads, direction = "desc", sortKey = "recency_at") {
  // Preserve the App Server's order when a legacy/malformed response omits
  // timestamps. Sorting a partially populated catalog by arbitrary IDs would
  // make the fallback less compatible with older Codex releases.
  const hasTimestamp = (thread) => [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at",
  ].some((key) => timestampValue(thread?.[key]) !== null);
  if (!threads.every(hasTimestamp)) return [...threads];

  const factor = direction === "asc" ? -1 : 1;
  const primaryKeys = sortKey === "updated_at"
    ? ["updatedAt", "updated_at", "createdAt", "created_at"]
    : ["recencyAt", "recency_at", "updatedAt", "updated_at", "createdAt", "created_at"];
  return [...threads].sort((left, right) => {
    const recency = threadTimestamp(right, primaryKeys) -
      threadTimestamp(left, primaryKeys);
    if (recency !== 0) return factor * recency;
    const updated = threadTimestamp(right, ["updatedAt", "updated_at"]) -
      threadTimestamp(left, ["updatedAt", "updated_at"]);
    if (updated !== 0) return factor * updated;
    const created = threadTimestamp(right, ["createdAt", "created_at"]) -
      threadTimestamp(left, ["createdAt", "created_at"]);
    if (created !== 0) return factor * created;
    const leftId = String(left?.id ?? left?.threadId ?? left?.thread_id ?? "");
    const rightId = String(right?.id ?? right?.threadId ?? right?.thread_id ?? "");
    return factor * rightId.localeCompare(leftId);
  });
}

function dedupeProjectList(projects) {
  const seen = new Set();
  const unique = [];
  for (const project of projects) {
    if (!isObject(project)) {
      unique.push(project);
      continue;
    }
    const id = String(project.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(project);
  }
  return unique;
}

function sortProjectList(projects) {
  if (!projects.every((project) => Number.isFinite(Number(project?.position)))) {
    return [...projects];
  }
  return [...projects].sort((left, right) => {
    const position = Number(left.position) - Number(right.position);
    if (position !== 0) return position;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}

function threadRecency(thread) {
  return threadTimestamp(thread, [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at",
  ]);
}

function threadTimestamp(thread, keys) {
  for (const key of keys) {
    const value = thread?.[key];
    const timestamp = timestampValue(value);
    if (timestamp !== null) return timestamp;
  }
  return 0;
}

function timestampValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUnsupportedThreadSort(error) {
  if (error?.code && error.code !== "APP_SERVER_ERROR") return false;
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("recency_at") ||
    message.includes("sortdirection") ||
    message.includes("sort direction") ||
    message.includes("sort key") ||
    message.includes("sort_key") ||
    message.includes("unsupported sort") ||
    message.includes("unknown sort");
}

function isActiveWriterConflict(error) {
  return error?.code === "APP_SERVER_ERROR" &&
    typeof error?.message === "string" &&
    /already has an active writer/i.test(error.message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" &&
    typeof error?.message === "string" &&
    error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}

function isThreadNotLoadedError(error) {
  return error?.code === "APP_SERVER_ERROR" &&
    typeof error?.message === "string" &&
    /\bthread\s+not\s+found\b/i.test(error.message);
}
