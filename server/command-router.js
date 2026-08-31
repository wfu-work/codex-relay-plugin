import { asRelayError, RelayError } from "./errors.js";
import { commandError, commandResult, validateRelayCommand } from "./protocol.js";
import { filterThreadList, safeProjectPath } from "./utils.js";

export class CommandRouter {
  #completed = new Map();
  #inflight = new Map();
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
      const result = await this.#execute(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {}, message.deviceId);
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
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
    this.#assertThreadResultAllowed(await this.appServer.readThread(threadId));
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
