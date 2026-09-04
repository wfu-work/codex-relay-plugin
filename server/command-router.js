import { asRelayError, RelayError } from "./errors.js";
import { commandError, commandResult, validateRelayCommand } from "./protocol.js";
import { filterProjectList, filterThreadList, safeProjectPath } from "./utils.js";

// A thread can contain unbounded command output. Returning that complete
// history through a Relay frame can exceed the authenticated connection's
// maxFrameSize and make the host disconnect with WebSocket close code 1009.
// Keep enough recent context for the client timeline while leaving headroom
// for the protocol envelope and JSON encoding.
const MAX_THREAD_READ_BYTES = 1_500_000;
const MAX_THREAD_READ_TURNS = 12;
const MAX_THREAD_ITEM_STRING_BYTES = 8_192;
const MAX_THREAD_ARRAY_ITEMS = 128;

export class CommandRouter {
  #completed = new Map();
  #inflight = new Map();
  #sharedReads = new Map();
  #threadReadTails = new Map();
  #threadSnapshotRevisions = new Map();
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
          throw new RelayError("REQUEST_ID_REUSED", "requestId 已被另一条命令使用");
        }
        return completed.response;
      }

      const inflight = this.#inflight.get(message.requestId);
      if (inflight) {
        if (inflight.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId 已被另一条命令使用");
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
    if (!['project.list', 'thread.list', 'thread.read', 'thread.status'].includes(command.type)) {
      return this.#execute(command, envelope);
    }
    const key = JSON.stringify({
      deviceId: envelope.deviceId,
      threadId: envelope.threadId || null,
      command: stableValue(command),
    });
    const existing = this.#sharedReads.get(key);
    if (existing) return existing;
    // `thread.status` and `thread.read` are two projections of the same
    // persisted snapshot. Serialize them per thread so an older status read
    // cannot finish after a newer full read and reintroduce a stale terminal
    // state on the client. Different threads remain fully concurrent.
    const threadId = command.type === 'thread.read' || command.type === 'thread.status'
      ? String(command.threadId || envelope.threadId || '').trim()
      : '';
    const previous = threadId ? this.#threadReadTails.get(threadId) : null;
    const pending = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => this.#execute(command, envelope))
      .finally(() => {
        if (this.#sharedReads.get(key) === pending) this.#sharedReads.delete(key);
        if (threadId && this.#threadReadTails.get(threadId) === pending) {
          this.#threadReadTails.delete(threadId);
        }
      });
    this.#sharedReads.set(key, pending);
    if (threadId) this.#threadReadTails.set(threadId, pending);
    return pending;
  }

  #failure(config, message, fingerprint, error) {
    const relayError = asRelayError(error);
    this.logger.warn("command", "远程命令执行失败", {
      command: message?.command?.type,
      code: relayError.code,
      message: relayError.message,
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
      case "project.list":
        return filterProjectList(await this.appServer.listProjects(command), this.configStore.get().allowedProjects);
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
        const result = compactThreadReadResult(
          await readThread.call(
            this.appServer,
            threadId,
          ),
        );
        this.#assertThreadResultAllowed(result);
        const prepared = this.service.prepareResourceImages
          ? this.service.prepareResourceImages(result)
          : result;
        return this.#annotateThreadSnapshot(threadId, await prepared, "read");
      }
      case "thread.status": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await readStatus.call(this.appServer, threadId);
        this.#assertThreadResultAllowed(result);
        return this.#annotateThreadSnapshot(threadId, result, "status");
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
          effort: optionalString(command.effort),
        });
      }
      case "turn.steer": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.steerTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId"),
          text: requireString(command.text, "text"),
        });
      }
      case "turn.interrupt": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.interruptTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId"),
        });
      }
      case "approval.respond": {
        const allowed = new Set(["accept", "acceptForSession", "decline", "cancel"]);
        if (!allowed.has(command.decision)) throw new RelayError("INVALID_MESSAGE", "审批决定无效");
        return this.appServer.respondToApproval(requireString(command.approvalId, "approvalId"), command.decision);
      }
      default:
        throw new RelayError("COMMAND_NOT_ALLOWED", `不支持的命令：${command.type}`);
    }
  }

  #allowedCwd(cwd, required = false) {
    const config = this.configStore.get();
    const candidate = cwd || (required ? config.codex.defaultWorkingDirectory : "");
    if (!candidate) {
      if (required && config.allowedProjects.length) {
        throw new RelayError("PROJECT_REQUIRED", "启用项目白名单后，创建会话必须指定允许的工作目录");
      }
      return undefined;
    }
    const safe = safeProjectPath(candidate, config.allowedProjects);
    if (!safe) throw new RelayError("PROJECT_NOT_ALLOWED", "该项目不在远程访问白名单中");
    return safe;
  }

  async #assertThreadAllowed(threadId) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return;
    const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
    this.#assertThreadResultAllowed(await readThread.call(this.appServer, threadId));
  }

  #assertThreadResultAllowed(result) {
    const config = this.configStore.get();
    if (!config.allowedProjects.length) return;
    const cwd = result?.thread?.cwd || result?.cwd;
    if (!cwd || !safeProjectPath(cwd, config.allowedProjects)) {
      throw new RelayError("PROJECT_NOT_ALLOWED", "该会话不在远程访问白名单中");
    }
  }

  #remember(requestId, fingerprint, response) {
    this.#completed.set(requestId, { fingerprint, response });
    if (this.#completed.size > 500) this.#completed.delete(this.#completed.keys().next().value);
  }

  #annotateThreadSnapshot(threadId, result, source) {
    const id = String(threadId || '').trim();
    if (!id || !result || typeof result !== 'object') return result;
    const revision = (this.#threadSnapshotRevisions.get(id) || 0) + 1;
    this.#threadSnapshotRevisions.set(id, revision);
    return {
      ...result,
      snapshotRevision: revision,
      snapshotSource: source,
      snapshotObservedAt: new Date().toISOString(),
    };
  }
}

function commandFingerprint(message) {
  return JSON.stringify({
    spaceId: message.spaceId,
    deviceId: message.deviceId,
    targetDeviceId: message.targetDeviceId,
    threadId: message.threadId || null,
    turnId: message.turnId || null,
    command: stableValue(message.command),
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new RelayError("INVALID_MESSAGE", `缺少 ${name}`);
  return value;
}

function optionalString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function compactThreadReadResult(result) {
  if (!result || typeof result !== "object") return result;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_THREAD_READ_BYTES) return result;

  const sourceThread = result.thread && typeof result.thread === "object" ? result.thread : result;
  const sourceTurns = Array.isArray(sourceThread.turns) ? sourceThread.turns : [];
  const compactThread = compactValue({ ...sourceThread, turns: [] });
  const compactTurns = [];

  // Preserve the newest turns first. The timeline is chronological, so add
  // selected turns back at the front after each size check.
  for (let index = sourceTurns.length - 1; index >= 0 && compactTurns.length < MAX_THREAD_READ_TURNS; index -= 1) {
    const turn = sourceTurns[index];
    if (!turn || typeof turn !== "object") continue;
    compactTurns.unshift(compactValue(turn));
    compactThread.turns = compactTurns;
    const candidate = result.thread && typeof result.thread === "object"
      ? { ...result, thread: compactThread }
      : compactThread;
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_THREAD_READ_BYTES) {
      compactTurns.shift();
      compactThread.turns = compactTurns;
      break;
    }
  }

  const compacted = result.thread && typeof result.thread === "object"
    ? { ...result, thread: compactThread }
    : compactThread;
  if (Buffer.byteLength(JSON.stringify(compacted), "utf8") <= MAX_THREAD_READ_BYTES) {
    return compacted;
  }

  // A malformed or unusually large metadata field can still exceed the
  // budget after normal value compaction. Keep the fields required by the
  // client and project whitelist, then omit optional metadata and turns.
  const minimalThread = compactValue(Object.fromEntries(
    ["id", "sessionId", "cwd", "path", "preview", "name", "status", "createdAt", "updatedAt"]
      .filter((key) => sourceThread[key] !== undefined)
      .map((key) => [key, sourceThread[key]]),
  ));
  minimalThread.turns = [];
  return result.thread && typeof result.thread === "object"
    ? { thread: minimalThread }
    : minimalThread;
}

function compactValue(value, depth = 0) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") <= MAX_THREAD_ITEM_STRING_BYTES) return value;
    const suffix = "\n…（历史输出已截断）";
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
    Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)]),
  );
}
