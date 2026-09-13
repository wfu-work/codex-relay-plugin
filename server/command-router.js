import { createHash } from "node:crypto";
import { asRelayError, RelayError } from "./errors.js";
import { commandError, commandResult, validateRelayCommand } from "./protocol.js";
import { filterProjectList, filterThreadList, safeProjectPath } from "./utils.js";
import { CommandJournal } from "./command-journal.js";
import { composerSettingsPatch } from "./composer-settings.js";
import { ImageUploads } from "./image-uploads.js";
import { buildTurnContext, listSkills, resolveSkills, resolveWorkspaceReferences, searchWorkspace } from "./workspace-tools.js";

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
  #readRequests = new Map();
  #threadReadTails = new Map();
  // Metadata-only status probes must not wait behind a potentially large
  // thread/read. The client reconciles snapshots by lifecycle/turn identity,
  // so an older status response cannot resurrect a terminal turn.
  #threadStatusTails = new Map();
  #settingsWriteTails = new Map();
  #nextSnapshotRevision = 0;
  #selectedThreadId = null;

  constructor({ configStore, appServer, service, logger }) {
    this.configStore = configStore;
    this.appServer = appServer;
    this.service = service;
    this.logger = logger;
    this.journal = new CommandJournal(configStore.configDir);
    this.images = new ImageUploads(configStore.configDir);
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
        await this.#authorizeReplay(message, completed.response);
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

    // Preserve arrival order between picker changes and a subsequent send.
    // Journal writes and authorization reads must not let turn/start overtake
    // an earlier settings update on the same thread.
    const threadId = message.command.threadId || message.threadId;
    const ordered = threadId && ["thread.settings.update", "turn.start"].includes(message.command.type);
    const previous = ordered ? this.#settingsWriteTails.get(threadId) : null;
    const promise = (previous ? previous.catch(() => {}) : Promise.resolve())
      .then(() => this.#run(config, message, fingerprint));
    if (ordered) this.#settingsWriteTails.set(threadId, promise);
    this.#inflight.set(message.requestId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (this.#inflight.get(message.requestId)?.promise === promise) {
        this.#inflight.delete(message.requestId);
      }
      if (ordered && this.#settingsWriteTails.get(threadId) === promise) this.#settingsWriteTails.delete(threadId);
    }
  }

  async #run(config, message, fingerprint) {
    let entry;
    try {
      entry = await this.journal.begin(config, message, fingerprint);
      if (entry?.response) {
        await this.#authorizeReplay(message, entry.response);
        return entry.response;
      }
      const result = await this.#executeRead(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {}, message.deviceId);
      try { await this.journal.finish(entry, response); }
      catch { throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "后端可能已执行命令，但回执未能保存；请刷新任务核对结果"); }
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      const uncertain = entry && ["APP_SERVER_UNAVAILABLE", "APP_SERVER_TIMEOUT"].includes(error.code);
      const response = this.#failure(config, message, fingerprint, uncertain ? new RelayError("COMMAND_OUTCOME_UNKNOWN", "连接中断或超时，命令结果尚未确认；请刷新任务，勿重复发送", { cause: error.code, threadId: message.threadId, command: message.command.type }) : error);
      if (entry && error.code !== "COMMAND_OUTCOME_UNKNOWN") await this.journal.finish(entry, response).catch(() => {});
      return response;
    }
  }

  async #authorizeReplay(message, response) {
    if (!response.success) return;
    const command = message.command;
    if (command.type === "thread.settings.update") composerSettingsPatch(command, this.configStore.get());
    if (command.type === "thread.create") this.#allowedCwd(command.cwd, true);
    const threadId = command.threadId || message.threadId;
    if (threadId) await this.#assertThreadAllowed(threadId);
  }

  async #executeRead(command, envelope) {
    if (!['project.list', 'thread.list', 'thread.read', 'thread.status', 'thread.resume', 'sync.request', 'workspace.search', 'skills.list'].includes(command.type)) {
      return this.#execute(command, envelope);
    }
    const key = JSON.stringify({
      deviceId: envelope.deviceId,
      threadId: envelope.threadId || null,
      command: stableValue(command),
    });
    const existing = this.#readRequests.get(key);
    if (existing) return existing;
    // Full history reads remain serialized per thread to avoid duplicate
    // expensive reads. Metadata-only status probes use a separate queue so
    // they can return promptly while a large history is being compacted.
    const threadId = command.type === 'thread.read' || command.type === 'thread.status'
      ? String(command.threadId || envelope.threadId || '').trim()
      : '';
    const tails = command.type === 'thread.status' ? this.#threadStatusTails : this.#threadReadTails;
    const previous = threadId ? tails.get(threadId) : null;
    const pending = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => this.#execute(command, envelope))
      .finally(() => {
        if (this.#readRequests.get(key) === pending) this.#readRequests.delete(key);
        if (threadId && tails.get(threadId) === pending) {
          tails.delete(threadId);
        }
      });
    this.#readRequests.set(key, pending);
    if (threadId) tails.set(threadId, pending);
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
      return this.service.syncAfter(Object.hasOwn(command, "lastSequence") ? command.lastSequence : null, command.eventStreamId);
    }
    // Local discovery must remain usable while Codex is starting or when the
    // configured executable is unavailable. It only touches an allowlisted
    // workspace and does not require an App Server connection.
    if (command.type === "workspace.search") {
      const cwd = this.#allowedCwd(command.cwd, true);
      return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
    }
    if (command.type === "skills.list") {
      const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : undefined;
      return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
    }
    if (command.type.startsWith("image.upload.")) {
      const owner = this.images.owner(this.configStore.get(), envelope);
      if (command.type === "image.upload.append") return this.images.append(command, owner);
      if (command.type === "image.upload.finish") return this.images.finish(command.uploadId, owner);
      if (command.type === "image.upload.remove") return this.images.remove(command.uploadId, owner);
      const threadId = command.threadId || envelope.threadId;
      let cwd = this.#allowedCwd(command.cwd, true);
      if (threadId) {
        await this.appServer.start();
        const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
        const result = await read.call(this.appServer, threadId);
        this.#assertThreadResultAllowed(result);
        cwd = this.#allowedCwd((result.thread || result).cwd, true);
      }
      return this.images.begin(command, owner, { cwd, threadId });
    }
    await this.appServer.start();
    switch (command.type) {
      case "model.list":
        return this.appServer.listModels(command);
      case "project.list":
        return filterProjectList(await this.appServer.listProjects(command), this.configStore.get().allowedProjects);
      case "workspace.search": {
        const cwd = this.#allowedCwd(command.cwd, true);
        return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
      }
      case "skills.list": {
        const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : undefined;
        return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
      }
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
        const result = compactThreadReadResult(
          await this.#readSubscribedThread(threadId, readThread),
        );
        // Hash the persisted content before replacing images with expiring
        // resource URLs. Clients can reconcile without downloading the same
        // history (or uploading its images) on every poll.
        const snapshotHash = createHash("sha256").update(JSON.stringify(result)).digest("hex");
        if (command.snapshotHash === snapshotHash) {
          return { threadId, snapshotHash, unchanged: true, pendingInteractions: this.appServer.pendingInteractions?.(threadId) || [] };
        }
        const prepared = this.service.prepareResourceImages
          ? this.service.prepareResourceImages(result)
          : result;
        return { ...this.#annotateThreadSnapshot(threadId, compactThreadReadResult(await prepared), "read"), snapshotHash };
      }
      case "thread.status": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
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
        // Legacy clients use resume as a subscription. Managed mode keeps
        // Resume is a local subscription in the managed App Server process.
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
        this.#selectedThreadId = threadId;
        return { ...result, syncMode: "snapshot" };
      }
      case "thread.select": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        await this.appServer.subscribeThread?.(threadId);
        this.#selectedThreadId = threadId;
        return { threadId: this.#selectedThreadId };
      }
      case "thread.settings.update": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const patch = composerSettingsPatch(command, this.configStore.get());
        await this.#assertThreadAllowed(threadId);
        return this.appServer.updateThreadSettings(threadId, patch);
      }
      case "turn.start": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        let images;
        let references = [];
        let skills = [];
        let threadCwd = this.#allowedCwd(command.cwd);
        if (command.workspaceRefs !== undefined || command.skills !== undefined) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          threadCwd = this.#allowedCwd((result.thread || result).cwd, true);
          references = await resolveWorkspaceReferences({ cwd: threadCwd, references: command.workspaceRefs || [], allowedProjects: this.configStore.get().allowedProjects });
          skills = await resolveSkills({ cwd: threadCwd, skills: command.skills || [], allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
        }
        if (command.attachmentIds !== undefined) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          const cwd = this.#allowedCwd((result.thread || result).cwd, true);
          threadCwd = threadCwd || cwd;
          images = await this.images.resolve(command.attachmentIds, this.images.owner(this.configStore.get(), envelope), { cwd, threadId });
        }
        return this.appServer.startTurn({
          threadId,
          text: `${buildTurnContext(references, skills)}${images?.length ? optionalString(command.text) || "" : requireString(command.text, "text")}`,
          ...(images ? { images } : {}),
          cwd: threadCwd,
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
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToApproval(id, command.decision);
      }
      case "userInput.respond": {
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToUserInput(id, command.answers);
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

  async #assertInteractionAllowed(id, envelope) {
    const entry = this.appServer.getInteraction(id);
    const threadId = entry.params.threadId;
    if (!threadId || (envelope.threadId && envelope.threadId !== threadId)) throw new RelayError("PROJECT_NOT_ALLOWED", "交互请求不属于当前任务");
    await this.#assertThreadAllowed(threadId);
  }

  async #readSubscribedThread(threadId, read) {
    let result = await read.call(this.appServer, threadId, { ensureResumed: false });
    this.#assertThreadResultAllowed(result);
    if (await this.appServer.subscribeThread?.(threadId)) {
      // Loading a thread changes runtime status. Do not return the older
      // notLoaded snapshot after its live subscription has already started.
      result = await read.call(this.appServer, threadId, { ensureResumed: false });
      this.#assertThreadResultAllowed(result);
    }
    // A desktop client can change composer settings without emitting an event
    // to this Relay connection. Reconcile the cache from every authoritative
    // read before returning it, so mobile reads never keep an older effort.
    this.appServer.rememberThreadSettings?.(threadId, result);
    const settings = this.appServer.threadSettings?.(threadId);
    return settings ? { ...result, threadSettings: settings } : result;
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
    // One process-local monotonic clock avoids a per-thread map that grows
    // forever and never reuses a revision when an old thread is revisited.
    const revision = ++this.#nextSnapshotRevision;
    return {
      ...result,
      snapshotRevision: revision,
      snapshotSource: source,
      snapshotObservedAt: new Date().toISOString(),
      pendingInteractions: this.appServer.pendingInteractions?.(id) || [],
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
    command: message.command.type === "image.upload.append"
      ? { ...stableValue(message.command), data: createHash("sha256").update(String(message.command.data)).digest("hex") }
      : stableValue(message.command),
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
