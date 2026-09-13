import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RelayError } from "./errors.js";
import { StdioAppServerTransport } from "./app-server-transport.js";
import { RolloutSnapshots, applyRolloutSnapshot } from "./rollout-snapshot.js";
import { PendingInteractions } from "./pending-interactions.js";
import { composerSettings } from "./composer-settings.js";
import { DesktopProjectPins } from "./desktop-project-pins.js";

const execFileAsync = promisify(execFile);

export class AppServerClient extends EventEmitter {
  #transport = null;
  #generation = 0;
  #wanted = false;
  #retryTimer = null;
  #retryAttempt = 0;
  #subscriptions = new Set();
  #connectionConfig = null;
  #requests = new Map();
  #interactions = new PendingInteractions();
  #interrupts = new Map();
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
  #threadSettings = new Map();
  #settingsRevision = 0;
  // Codex keeps authoritative token_count rows in the local rollout journal.
  // App Server history does not always project those rows into thread/read,
  // especially for a thread owned by Desktop. Keep a read-only journal
  // projection so Relay can recover per-turn usage without taking the writer.
  #rollouts;
  #projectPins;
  static MAX_RESUMED_THREADS = 1000;

  static APPROVAL_METHODS = new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
  ]);

  constructor(configStore, logger, options = {}) {
    super();
    this.options = options;
    this.#projectPins = new DesktopProjectPins({ codexHome: options.codexHome });
    this.#rollouts = new RolloutSnapshots({ codexHome: options.codexHome });
    this.configStore = configStore;
    this.logger = logger;
    this.state = "stopped";
    this.version = null;
    this.lastError = null;
  }

  status() {
    const config = this.#connectionConfig || this.configStore.get().codex;
    const transport = this.#transport;
    return {
      state: this.state,
      version: this.version,
      pid: transport?.pid || null,
      connectionMode: "managed",
      transport: "stdio",
      ownsProcess: Boolean(transport?.pid),
      endpoint: null,
      reconnectAttempt: this.#retryAttempt,
      nextRetryAt: this.nextRetryAt || null,
      subscribedThreads: this.#resumedThreads.size,
      lastError: this.lastError,
      pendingRequests: this.#requests.size,
      pendingApprovals: this.#interactions.entries.size,
    };
  }

  async checkAvailability() {
    const codex = this.configStore.get().codex;
    const executable = codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 10_000 });
    this.version = (stdout || stderr).trim();
    return { executable, version: this.version, connectionMode: "managed", transport: "stdio" };
  }

  async start() {
    this.#wanted = true;
    if (this.#starting) return this.#starting;
    if (this.state === "ready") return this.status();
    if (this.#retryTimer) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server 正在重连，请稍后重试");
    const generation = ++this.#generation;
    const pending = this.#startInternal(generation);
    this.#starting = pending;
    try { return await pending; }
    finally { if (this.#starting === pending) this.#starting = null; }
  }

  #resetConnectionState() {
    this.#paginatedThreads = null;
    this.#threadListSortMode = null;
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
    this.#threadSettings.clear();
  }

  async #startInternal(generation) {
    const config = this.configStore.get().codex;
    this.#connectionConfig = { ...config };
    this.state = "starting";
    this.lastError = null;
    this.version = null;
    this.#resetConnectionState();
    let transport;
    try {
      await this.checkAvailability();
      transport = new StdioAppServerTransport(config);
      if (generation !== this.#generation || !this.#wanted) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server 连接已取消");
      this.#transport = transport;
      transport.on("message", line => { if (this.#transport === transport) this.#handleLine(line); });
      transport.on("log", message => { if (message) this.logger.info("app-server", message); });
      transport.on("closed", error => this.#handleExit(transport, error));
      this.logger.info("app-server", "正在启动 Codex App Server");
      await transport.open();
      if (generation !== this.#generation || this.#transport !== transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server 连接已取消");
      const initialized = await this.request("initialize", {
        clientInfo: { name: "codex-relay-plugin", title: "Codex Relay Plugin", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      }, this.options.initializeTimeoutMs || 15000);
      this.notify("initialized", {});
      this.version = this.version || initialized?.serverInfo?.version || initialized?.userAgent || null;
      // Restore only explicit, authorized subscriptions. Never replay turns
      // whose responses may have been lost on the previous connection.
      for (const id of [...this.#subscriptions]) {
        if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server 连接恢复已取消");
        try { await this.resumeThread(id); }
        catch (error) {
          if (!transport.writable) throw error;
          this.#subscriptions.delete(id);
          this.logger.warn("app-server", "任务订阅恢复失败，等待客户端重新读取", { threadId: id, message: error.message });
        }
      }
      if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server 连接已取消");
      this.state = "ready";
      this.#retryAttempt = 0;
      this.nextRetryAt = null;
      this.lastError = null;
      this.emit("status", this.status());
      return this.status();
    } catch (error) {
      if (this.#transport === transport) this.#transport = null;
      await transport?.close();
      if (generation === this.#generation && this.#wanted) {
        this.lastError = error.message;
        this.state = "error";
        this.#scheduleReconnect();
        this.emit("status", this.status());
      }
      throw error;
    }
  }

  #scheduleReconnect() {
    if (!this.#wanted) return;
    this.state = "reconnecting";
    if (this.#retryTimer) return;
    const delay = Math.min(this.options.reconnectMaxMs || 30000,
      (this.options.reconnectBaseMs || 500) * 2 ** Math.min(this.#retryAttempt++, 8) * (0.8 + Math.random() * 0.4));
    this.nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.nextRetryAt = null;
      // close/open cleanup may still be unwinding after a failed handshake.
      if (this.#starting) { this.#scheduleReconnect(); return; }
      this.start().catch(error => this.logger.warn("app-server", "App Server 重连失败", { message: error.message }));
    }, delay);
    this.#retryTimer.unref();
  }

  #rejectRequests(error) {
    for (const pending of this.#requests.values()) pending.reject(error);
    this.#requests.clear();
    for (const entry of this.#interactions.clear()) this.emit("interactionResolved", { ...this.#interactions.public(entry, this.configStore.get()), reason: "connectionClosed" });
  }

  async stop() {
    this.#wanted = false;
    ++this.#generation;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#retryAttempt = 0;
    this.nextRetryAt = null;
    this.#subscriptions.clear();
    this.#rollouts.clear();
    this.#resetConnectionState();
    const transport = this.#transport;
    this.#transport = null;
    this.state = "stopped";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server 连接已停止"));
    await transport?.close();
    await this.#starting?.catch(() => {});
    this.#connectionConfig = null;
    this.version = null;
    this.emit("status", this.status());
  }

  request(method, params = {}, timeoutMs = 30_000) {
    if (!this.#transport?.writable) {
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
      try { this.#write({ jsonrpc: "2.0", id, method, params }); }
      catch (error) { const pending = this.#requests.get(id); this.#requests.delete(id); pending?.reject(error); }
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
      // the thread id is the stable identity across paginated responses;
      // collapse duplicates
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

    if (params.cursor != null) return this.#projectPins.enrich(await requestPage(params.cursor));

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
    return this.#projectPins.enrich({
      ...first,
      data: sortProjectList(dedupeProjectList(data)),
      nextCursor: null,
    });
  }

  async readThread(threadId) {
    return this.readThreadSnapshot(threadId);
  }

  /**
   * Read the persisted thread snapshot without trying to acquire the thread
   * writer or subscribe this connection to future notifications.
   *
   * The official desktop client owns some threads through its private stdio
   * App Server. Those threads are still readable from the persisted Codex
   * history, but `thread/resume` is rejected with an active-writer error.
   * Relay reads used for reconciliation must therefore be side-effect free;
   * starting a new turn remains responsible for resuming the thread when
   * necessary.
   */
  async readThreadSnapshot(threadId) {
    const id = normalizeThreadId(threadId);
    // A live desktop-owned task can have a very large journal. Reading the
    // complete App Server history first blocks the mobile refresh path even
    // though the bounded rollout projection already contains the authoritative
    // current turn, lifecycle and usage counters. Prefer that projection for
    // active turns; completed tasks still use the normal full-history path.
    const liveRollout = await this.#rollouts.readLatest(id);
    if (liveRollout?.replaced === true && liveRollout.currentTurn?.status === "inProgress") {
      return {
        thread: applyRolloutSnapshot(
          { id, path: liveRollout.file, cwd: liveRollout.cwd },
          liveRollout,
          { includeTurns: true },
        ),
      };
    }
    const result = this.#paginatedThreads === true ? await this.#readPaginatedThread(id)
      : await this.request(
        "thread/read",
        { threadId: id, includeTurns: true },
        this.options.threadReadTimeoutMs ?? 5_000,
      ).catch(async (error) => {
        if (isPaginatedThreadReadError(error)) {
          this.#paginatedThreads = true;
          return this.#readPaginatedThread(id);
        }
        // A very large desktop-owned history can exceed the App Server's
        // response window. Return the bounded rollout projection immediately
        // so the phone keeps its lifecycle and latest output in sync.
        const snapshot = await this.#rollouts.readLatest(id);
        if (!snapshot) throw error;
        return {
          thread: applyRolloutSnapshot(
            { id, path: snapshot.file, cwd: snapshot.cwd },
            snapshot,
            { includeTurns: true },
          ),
        };
      });
    return this.#reconcileRolloutUsage(result);
  }

  // Unlike readThread(), this explicitly disables includeTurns. Codex still
  // returns the current thread status, but does not stream the full history.
  // The Relay client uses it as a cheap heartbeat for a selected task. The
  // explicit false also keeps older non-paginated servers from falling back
  // to their full-history default. Status reads never acquire a writer unless
  // a caller explicitly requests a local subscription.
  async readThreadStatus(threadId, { ensureResumed = false } = {}) {
    const id = normalizeThreadId(threadId);
    if (ensureResumed) await this.ensureThreadResumed(id);
    let result;
    try {
      result = await this.request(
        "thread/read",
        { threadId: id, includeTurns: false },
        this.options.threadStatusTimeoutMs ?? 5_000,
      );
    } catch (error) {
      // A desktop-owned thread may not exist in this App Server's in-memory
      // index yet. Use the single Codex session journal as a read-only
      // fallback so a stale `turn/completed` notification cannot overwrite a
      // newer active turn on the phone.
      const snapshot = await this.#rollouts.readLatest(id);
      if (!snapshot) throw error;
      return {
        thread: applyRolloutSnapshot(
          { id, path: snapshot.file, cwd: snapshot.cwd },
          snapshot,
        ),
      };
    }
    return this.#reconcileRolloutUsage(result);
  }

  async #reconcileRolloutUsage(result) {
    const thread = result?.thread || result;
    if (!thread || typeof thread !== "object") return result;
    const snapshot =
      (await this.#rollouts.read(thread)) ||
      (thread?.id ? await this.#rollouts.readLatest(thread.id) : null);
    if (!snapshot) return result;

    // Desktop owns its private App Server writer, so a second managed
    // App Server can briefly return the previous persisted turn (often
    // `interrupted`) while the current rollout is still running. The rollout
    // journal is the shared source of truth in that situation. Project its
    // current turn onto both status and history before the response reaches
    // the phone; otherwise the client can oscillate between running and
    // interrupted on every refresh.
    const projected = applyRolloutSnapshot(thread, snapshot, {
      includeTurns: Array.isArray(thread.turns),
    });
    const projectedResult = result?.thread
      ? { ...result, thread: projected }
      : projected;

    // Replay newly appended token_count rows immediately. The App Server may
    // not emit them to this connection when Desktop owns the writer.
    for (const [method, params] of snapshot.notifications || []) {
      if (method === "thread/tokenUsage/updated") this.emit("notification", method, params);
    }

    const sourceTurns = Array.isArray(snapshot.turns) ? snapshot.turns : [];
    const targetTurns = Array.isArray(projected.turns) ? projected.turns : [];
    const byId = new Map(targetTurns.map(turn => [turn?.id, turn]));
    let changed = false;
    for (const source of sourceTurns) {
      if (!source?.id || (!source.turnUsage && !source.tokenUsage)) continue;
      const target = byId.get(source.id);
      if (!target) continue;
      if (!target.turnUsage && source.turnUsage) {
        target.turnUsage = source.turnUsage;
        changed = true;
      }
      if (!target.tokenUsage && source.tokenUsage) {
        target.tokenUsage = source.tokenUsage;
        changed = true;
      }
    }
    if (!changed) return projectedResult;
    const hydrated = { ...projected, turns: targetTurns };
    return result?.thread ? { ...result, thread: hydrated } : hydrated;
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
   * notifications. Resuming loads a writer in this App Server; it does not
   * subscribe to a different App Server's live output. Concurrent
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
        this.#rememberResumedThread(id);
        this.#resumeRetryAt.delete(id);
      })
      .catch((error) => {
        if (!isActiveWriterConflict(error)) throw error;
        // A different Codex client currently owns the thread writer. The
        // persisted read below is still useful. Explicit subscription probes
        // back off for a minute; ordinary reads never enter this path.
        this.#rememberResumeRetry(id, Date.now() + 60_000);
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

  // Call only after the command router has checked project access.
  async subscribeThread(_threadId) {
    // Historical snapshots remain side-effect free; turns are resumed lazily
    // by the write path when this plugin becomes the active writer.
    return false;
  }

  #rememberResumedThread(id) {
    this.#subscriptions.delete(id);
    this.#subscriptions.add(id);
    while (this.#subscriptions.size > AppServerClient.MAX_RESUMED_THREADS) {
      const retired = this.#subscriptions.values().next().value;
      this.#subscriptions.delete(retired);
      this.request("thread/unsubscribe", { threadId: retired }).catch(() => {});
    }
    this.#resumedThreads.delete(id);
    this.#resumedThreads.add(id);
    while (this.#resumedThreads.size > AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumedThreads.delete(this.#resumedThreads.values().next().value);
    }
  }

  #rememberResumeRetry(id, retryAt) {
    this.#resumeRetryAt.delete(id);
    this.#resumeRetryAt.set(id, retryAt);
    while (this.#resumeRetryAt.size > AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumeRetryAt.delete(this.#resumeRetryAt.keys().next().value);
    }
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
    if (id) {
      this.#rememberResumedThread(normalizeThreadId(id));
      this.#rememberThreadSettings(id, result);
    }
    return { ...result, ...(this.threadSettings(id) ? { threadSettings: this.threadSettings(id) } : {}) };
  }

  async resumeThread(threadId) {
    const id = normalizeThreadId(threadId);
    const transport = this.#transport;
    const previousSettings = this.#threadSettings.get(id);
    const result = await this.request("thread/resume", { threadId: id });
    if (transport !== this.#transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "任务订阅的连接已过期");
    this.#rememberResumedThread(id);
    // A newer settings notification can arrive while resume is in flight.
    if (this.#threadSettings.get(id) === previousSettings) this.#rememberThreadSettings(id, result);
    return result;
  }

  threadSettings(threadId) {
    const value = this.#threadSettings.get(threadId);
    return value ? structuredClone(value) : null;
  }

  /** Refresh the process-local composer cache from an authoritative read. */
  rememberThreadSettings(threadId, value) {
    this.#rememberThreadSettings(threadId, value);
  }

  #rememberThreadSettings(threadId, value) {
    const settings = composerSettings(value);
    if (!settings || !threadId) return;
    const id = normalizeThreadId(threadId);
    if (!id) return;
    const previous = this.#threadSettings.get(id) || {};
    // Settings notifications may be field-level patches. Merge them into the
    // last authoritative task settings so changing effort does not erase the
    // model or permission profile (and vice versa).
    this.#threadSettings.delete(id);
    this.#threadSettings.set(id, {
      ...previous,
      ...settings,
      revision: ++this.#settingsRevision,
    });
    while (this.#threadSettings.size > AppServerClient.MAX_RESUMED_THREADS) {
      this.#threadSettings.delete(this.#threadSettings.keys().next().value);
    }
  }


  async updateThreadSettings(threadId, patch) {
    const id = normalizeThreadId(threadId);
    await this.ensureThreadResumed(id);
    const previous = this.#threadSettings.get(id);
    await this.request("thread/settings/update", { threadId: id, ...patch });
    // New servers notify every subscriber. If a server does not notify this
    // connection, resume gives the authoritative accepted values, not an echo.
    if (this.#threadSettings.get(id) === previous) await this.resumeThread(id);
    if (!this.threadSettings(id)) throw new RelayError("APP_SERVER_ERROR", "Codex 未返回任务设置，请升级 Codex 后重试");
    return { threadId: id, threadSettings: this.threadSettings(id) };
  }

  async startTurn({ threadId, text, cwd, model, effort, images = [] }) {
    const id = normalizeThreadId(threadId);
    const params = {
      threadId: id,
      input: [...(text ? [{ type: "text", text }] : []), ...images],
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    };
    try {
      const result = await this.request("turn/start", params);
      this.#rememberResumedThread(id);
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

  async interruptTurn({ threadId, turnId }) {
    const key = JSON.stringify([threadId, turnId]);
    if (this.#interrupts.has(key)) return this.#interrupts.get(key);
    const generation = this.#generation;
    const execute = async () => {
      const deadline = Date.now() + (this.options.interruptRetryMs ?? 5000);
      while (true) {
        if (generation !== this.#generation || !this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "停止请求未确认，请恢复连接后检查任务状态");
        const recent = await this.request("thread/turns/list", { threadId, limit: 2, sortDirection: "desc", itemsView: "notLoaded" }).catch(async error => {
          if (!isActiveWriterConflict(error)) throw error;
          return { data: (await this.readThreadSnapshot(threadId)).thread?.turns || [] };
        });
        const turns = recent.data || [];
        const target = turns.find(turn => turn.id === turnId);
        if (target && ["completed", "failed", "interrupted"].includes(target.status)) return { threadId, turnId, status: "alreadyFinished", turnStatus: target.status };
        if (turns.some(turn => turn.id !== turnId && ["inProgress", "in_progress"].includes(turn.status))) throw new RelayError("TURN_CHANGED", "当前轮次已经改变，未中断新的任务");
        if (!target) {
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "找不到指定轮次，未中断其他任务，请刷新后重试");
          await new Promise(resolve => setTimeout(resolve, this.options.interruptPollMs ?? 100));
          continue;
        }
        try {
          await this.request("turn/interrupt", { threadId, turnId });
          return { threadId, turnId, status: "requested" };
        } catch (error) {
          if (error.code !== "APP_SERVER_ERROR" || !/no active turn to interrupt/i.test(error.message)) throw error;
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "尚未确认任务开始执行，停止请求未完成，请刷新后重试");
          await new Promise(resolve => setTimeout(resolve, this.options.interruptPollMs ?? 100));
        }
      }
    };
    const pending = execute().finally(() => this.#interrupts.delete(key));
    this.#interrupts.set(key, pending);
    return pending;
  }

  pendingInteractions(threadId) {
    return [...this.#interactions.entries.values()].filter(entry => entry.params.threadId === threadId).map(entry => this.#interactions.public(entry, this.configStore.get()));
  }
  getInteraction(approvalId) { return this.#interactions.get(approvalId); }
  respondToApproval(approvalId, decision) { return this.#respondToInteraction(approvalId, { decision }, "approval"); }
  respondToUserInput(approvalId, answers) { return this.#respondToInteraction(approvalId, { answers }, "userInput"); }
  #respondToInteraction(approvalId, payload, kind) {
    const entry = this.#interactions.get(approvalId);
    const result = this.#interactions.validateResponse(entry, payload, kind);
    this.#write({ jsonrpc: "2.0", id: entry.backendId, result });
    entry.responding = true;
    this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
    return { approvalId, status: "submitted" };
  }

  #write(message) {
    if (!this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server 未运行");
    this.#transport.send(JSON.stringify(message));
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
      if (!AppServerClient.APPROVAL_METHODS.has(message.method) && !["tool/requestUserInput", "item/tool/requestUserInput"].includes(message.method)) {
        this.logger.warn("app-server", "拒绝不受支持的 App Server 客户端请求", { method: message.method });
        this.#write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Client request not supported: ${message.method}` },
        });
        return;
      }
      if (!message.params?.threadId) return;
      const entry = this.#interactions.add(message);
      this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
      return;
    }
    let resolved = [];
    if (message.method === "serverRequest/resolved") resolved = this.#interactions.resolve(message.params?.requestId, message.params?.threadId);
    if (message.method === "turn/completed") resolved = this.#interactions.clearThread(message.params?.threadId, message.params?.turn?.id);
    if (message.method === "thread/closed" || message.method === "thread/deleted") {
      this.#resumedThreads.delete(message.params?.threadId);
      this.#subscriptions.delete(message.params?.threadId);
      resolved = this.#interactions.clearThread(message.params?.threadId);
    }
    for (const entry of resolved) this.emit("interactionResolved", this.#interactions.public(entry, this.configStore.get()));
    if (message.method === "thread/settings/updated") {
      this.#rememberThreadSettings(message.params?.threadId, message.params?.threadSettings);
      message.params = { threadId: message.params?.threadId, threadSettings: this.threadSettings(message.params?.threadId) };
    }
    if (message.method) this.emit("notification", message.method, message.params || {});
  }

  #handleExit(transport, error) {
    if (this.#transport !== transport) return;
    this.#transport = null;
    this.#resetConnectionState();
    this.lastError = error.message;
    this.state = "error";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server 连接中断；未确认的命令不会自动重发"));
    transport.close().catch(() => {});
    this.#scheduleReconnect();
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
