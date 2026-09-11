import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { AppServerClient } from "./app-server-client.js";
import { CommandRouter } from "./command-router.js";
import { ConfigStore } from "./config-store.js";
import { relayEndpointId, relaySpaceId } from "./config-store.js";
import { RelayError } from "./errors.js";
import { EventBuffer } from "./event-buffer.js";
import { InstanceLock } from "./instance-lock.js";
import { Logger } from "./logger.js";
import { eventEnvelope, extractContext, normalizeCodexNotification } from "./protocol.js";
import { RelayClient } from "./relay-client.js";
import { prepareEventImages } from "./resource-images.js";
import { filterProjectList, filterThreadList, safeProjectPath } from "./utils.js";
import { inspectRemoteControl, installOfficialStandalone, runRemoteControl } from "./remote-control.js";

export class ConnectorService extends EventEmitter {
  #unsupportedNotificationMethods = new Set();
  static MAX_THREAD_ACCESS_ENTRIES = 1000;
  static MAX_PENDING_EVENTS = 256;

  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.instanceLock = options.instanceLock || null;
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.remoteControl = options.remoteControl || {
      inspect: () => inspectRemoteControl(),
      start: () => runRemoteControl("start"),
      stop: () => runRemoteControl("stop"),
      pair: () => runRemoteControl("pair"),
      install: () => installOfficialStandalone(),
    };
    this.remoteControlInstalling = false;
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1000, {
      maxBytes: options.eventBufferMaxBytes,
      maxEventBytes: options.eventMaxBytes,
    });
    this.dashboard = null;
    this.startedAt = null;
    this.starting = null;
    this.autoConnectStarted = false;
    this.eventQueue = Promise.resolve();
    this.#pendingEvents = [];
    this.#eventWorker = null;
    this.#eventQueueOverflowed = false;
    this.threadAccess = new Map();
    this.eventStreamId = randomUUID();
    this.router = new CommandRouter({
      configStore: this.configStore,
      appServer: this.appServer,
      service: this,
      logger: this.logger,
    });
    this.#wireEvents();
  }

  async start() {
    if (this.startedAt) return this.status();
    if (!this.starting) {
      this.starting = (async () => {
        await this.configStore.load();
        this.instanceLock ||= new InstanceLock(this.configStore.configDir);
        this.startedAt = new Date().toISOString();
        this.logger.info("connector", "Codex Relay Connector 已启动");
        await this.router.journal.prune();
      })();
    }
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
    if (this.configStore.get().relay.autoConnect && !this.autoConnectStarted) {
      this.autoConnectStarted = true;
      this.connect().catch((error) => this.logger.error("connector", "自动连接失败", { message: error.message }));
    }
    return this.status();
  }

  attachDashboard(dashboard) {
    this.dashboard = dashboard;
  }

  async stop() {
    this.#pendingEvents.length = 0;
    this.#eventQueueOverflowed = false;
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
      if (config.codex.autoStartAppServer || config.codex.connectionMode === "shared") {
        try { await this.appServer.start(); }
        catch (error) {
          if (config.codex.connectionMode !== "shared" || this.appServer.state !== "reconnecting") throw error;
          // Keep Relay reachable so the phone can see backend recovery state.
          this.logger.warn("connector", "共享后端暂不可用，保持 Relay 连接等待恢复", { message: error.message });
        }
      }
      return await this.relay.connect(credential);
    } catch (error) {
      // A transient socket failure schedules an internal reconnect, so retain
      // the lock for the connector that owns that retry loop. Configuration or
      // terminal authentication errors leave the client idle and release it.
      if (this.relay.state !== "reconnecting") await this.instanceLock.release();
      throw error;
    }
  }

  async disconnect(reason = "manual disconnect") {
    await this.relay.disconnect(reason);
    await this.instanceLock?.release();
    return this.status();
  }

  // Reconnect only this plugin's App Server transport. In shared mode the
  // shared backend process remains owned by its service, so desktop and
  // Flutter clients are not asked to stop or migrate anything.
  async restartAppServerConnection() {
    await this.appServer.stop();
    await this.appServer.start();
    this.emit("status", await this.status());
    return this.status();
  }

  async reconnectRelay() {
    await this.disconnect("dashboard reconnect");
    return this.connect();
  }

  async testConnection() {
    await this.start();
    return this.relay.test(await this.configStore.relayCredential());
  }

  async remoteControlStatus() {
    return this.remoteControl.inspect();
  }

  async remoteControlStart() {
    const result = await this.remoteControl.start();
    this.emit("status", await this.status());
    return result;
  }

  async remoteControlStop() {
    const result = await this.remoteControl.stop();
    this.emit("status", await this.status());
    return result;
  }

  async remoteControlPair() {
    return this.remoteControl.pair();
  }

  async remoteControlInstall() {
    if (this.remoteControlInstalling) {
      const error = new RelayError("REMOTE_CONTROL_INSTALL_BUSY", "官方 standalone 正在安装，请稍候");
      throw error;
    }
    this.remoteControlInstalling = true;
    try { return await this.remoteControl.install(); }
    finally { this.remoteControlInstalling = false; }
  }

  async updateConfig(patch, credentialPatch) {
    const previous = this.configStore.get();
    this.configStore.preview?.(patch); // Reject invalid endpoints before disconnecting a working session.
    const wasConnected = ["connected", "connecting", "authenticating", "reconnecting"].includes(this.relay.state);
    if (wasConnected) await this.disconnect("configuration changed");
    const config = await this.configStore.update(patch, credentialPatch);
    const backendChanged = ["connectionMode", "appServerEndpoint", "executable", "defaultWorkingDirectory"]
      .some(key => previous.codex[key] !== config.codex[key]);
    const accessChanged = JSON.stringify([previous.allowedProjects, previous.permissions, previous.readOnly])
      !== JSON.stringify([config.allowedProjects, config.permissions, config.readOnly]);
    if (backendChanged || (previous.codex.connectionMode === "shared" && accessChanged)) {
      await this.appServer.stop();
      this.#pendingEvents.length = 0;
      await this.eventQueue.catch(() => {});
      this.#resetEventStream();
      this.router = new CommandRouter({ configStore: this.configStore, appServer: this.appServer, service: this, logger: this.logger });
    }
    this.threadAccess.clear();
    if (wasConnected || config.relay.autoConnect) await this.connect();
    this.emit("status", await this.status());
    return config;
  }

  #rememberThreadAccess(threadId, allowed) {
    const id = String(threadId || '').trim();
    if (!id) return;
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { allowed: Boolean(allowed), touchedAt: Date.now() });
    while (this.threadAccess.size > ConnectorService.MAX_THREAD_ACCESS_ENTRIES) {
      this.threadAccess.delete(this.threadAccess.keys().next().value);
    }
  }

  #pendingEvents;
  #eventWorker;
  #eventQueueOverflowed;

  #resetEventStream() {
    this.eventBuffer.invalidateReplay();
    this.eventStreamId = randomUUID();
    this.#pendingEvents.length = 0;
  }

  #enqueueEvent(event, params = {}) {
    const context = extractContext(params);
    const isDelta = event.type.endsWith('.delta') || event.type === 'tool.output';
    if (this.#pendingEvents.length >= ConnectorService.MAX_PENDING_EVENTS) {
      // A full queue cannot promise lossless deltas. Invalidate every client's
      // cursor and retain the newest event so a snapshot closes the gap.
      this.#eventQueueOverflowed = true;
      this.#resetEventStream();
    }
    this.#pendingEvents.push({ event, params, isDelta, threadId: context.threadId, eventStreamId: this.eventStreamId });
    if (!this.#eventWorker) {
      this.#eventWorker = this.#drainEvents();
      this.eventQueue = this.#eventWorker.finally(() => { this.#eventWorker = null; });
    }
  }

  async #drainEvents() {
    while (this.#pendingEvents.length) {
      const entry = this.#pendingEvents.shift();
      try {
        await this.#forwardEvent(entry.event, entry.params, entry.eventStreamId);
      } catch (error) {
        this.#resetEventStream();
        this.logger.warn("connector", "Codex 事件转发失败", { message: error.message });
      }
    }
  }

  #readThreadAccess(threadId) {
    const id = String(threadId || '').trim();
    const entry = this.threadAccess.get(id);
    if (!entry) return undefined;
    // Access decisions are cheap metadata reads; expire them so project
    // whitelist changes cannot leave stale authorization in memory forever.
    if (Date.now() - entry.touchedAt > 15 * 60 * 1000) {
      this.threadAccess.delete(id);
      return undefined;
    }
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { ...entry, touchedAt: Date.now() });
    return entry.allowed;
  }

  async status() {
    const config = await this.configStore.publicConfig();
    return {
      connector: {
        state: this.startedAt ? "running" : "stopped",
        startedAt: this.startedAt,
      },
      relay: this.relay.status(),
      appServer: this.appServer.status(),
      eventStreamId: this.eventStreamId,
      space: {
        spaceId: relaySpaceId(config.relay),
        endpointId: relayEndpointId(config.relay),
        endpointType: "bridge",
        deviceId: config.relay.deviceId,
        deviceName: config.relay.deviceName,
      },
      security: {
        readOnly: config.readOnly,
        allowedProjects: config.allowedProjects.length,
        remoteApprovalEnabled: config.permissions.respondToApprovals,
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
        endpointPublicKey: config.relay.endpointPublicKey,
      },
      protocol: {
        version: 1,
        latestSequence: this.eventBuffer.latestSequence(),
        bufferedEvents: this.eventBuffer.size,
        bufferedBytes: this.eventBuffer.bytes,
        threadAccessEntries: this.threadAccess.size,
        pendingEventQueue: this.#pendingEvents.length,
        eventQueueOverflowed: this.#eventQueueOverflowed,
      },
      dashboard: this.dashboard?.status() || { state: "stopped", url: null },
    };
  }

  async diagnostics() {
    const checks = [];
    try {
      checks.push({ name: "codex", ok: true, ...(await this.appServer.checkAvailability()) });
    } catch (error) {
      checks.push({ name: "codex", ok: false, error: error.message });
    }
    const config = await this.configStore.publicConfig();
    checks.push({
      name: "configuration",
      ok: Boolean(config.relay.url && relaySpaceId(config.relay) && relayEndpointId(config.relay) && config.relay.credentialConfigured),
      details: {
        relayUrlConfigured: Boolean(config.relay.url),
        spaceConfigured: Boolean(relaySpaceId(config.relay)),
        endpointConfigured: Boolean(relayEndpointId(config.relay)),
        endpointId: relayEndpointId(config.relay),
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
      },
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }

  async prepareResourceImages(value) {
    const config = this.configStore.get();
    return prepareEventImages(value, async ({ mime, bytes }) => {
      try {
        return await this.relay.uploadResource({ mime, data: bytes });
      } catch (error) {
        this.logger.warn("resource", "图片资源上传失败，保留内联回退", { message: error.message });
        return null;
      }
    }, new WeakSet(), {
      allowedRoots: [
        ...(Array.isArray(config.allowedProjects) ? config.allowedProjects : []),
        config.codex?.defaultWorkingDirectory,
      ],
    });
  }

  async syncAfter(lastSequence, eventStreamId) {
    if (lastSequence == null) return this.#snapshotSync();
    if (eventStreamId && eventStreamId !== this.eventStreamId) return this.#snapshotSync();
    if (this.#eventQueueOverflowed) {
      this.#eventQueueOverflowed = false;
      return this.#snapshotSync();
    }
    const events = this.eventBuffer.after(lastSequence);
    const requestedSequence = Number(lastSequence || 0);
    const latestSequence = this.eventBuffer.latestSequence();
    // EventBuffer is process-local. If the connector restarted, a mobile
    // client may present a sequence from the previous process; an empty
    // incremental response would leave it with stale or no session state.
    // Fall back to a fresh snapshot whenever the requested cursor is ahead of
    // the current journal, or when there is no journal to replay.
    if (
      events !== null
      && requestedSequence <= latestSequence
      && !(requestedSequence === 0 && events.length === 0 && !eventStreamId)
    ) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence(), eventStreamId: this.eventStreamId };
    }
    return this.#snapshotSync();
  }

  async #snapshotSync(attempt = 0) {
    const latestSequence = this.eventBuffer.latestSequence();
    const eventStreamId = this.eventStreamId;
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 100 }), allowedProjects);
    let projects = { data: [], nextCursor: null };
    if (typeof this.appServer.listProjects === "function") {
      try {
        projects = filterProjectList(
          await this.appServer.listProjects({ limit: 100 }),
          allowedProjects,
        );
      } catch (error) {
        this.logger.warn("connector", "项目列表不可用，使用任务目录回退", {
          message: error.message,
        });
      }
    }
    const status = await this.status();
    if (eventStreamId !== this.eventStreamId) {
      if (attempt < 2) return this.#snapshotSync(attempt + 1);
      throw new RelayError("APP_SERVER_UNAVAILABLE", "后端正在重新连接，请稍后刷新任务");
    }
    return {
      mode: "snapshot",
      status,
      threads,
      projects,
      latestSequence,
      eventStreamId,
    };
  }

  #wireEvents() {
    this.relay.on("command", async (message) => {
      const connectionId = this.relay.connectionId;
      const response = await this.router.handle(message);
      // An in-flight history read can outlive a disconnect. Its old request
      // must not be sent into the new connection alongside recovery reads.
      if (connectionId !== this.relay.connectionId) return;
      if (!this.relay.send(response)) {
        this.logger.warn("connector", "Relay 未接受定向命令响应，消息未发送", {
          requestId: message?.requestId,
          targetDeviceId: response?.targetDeviceId,
        });
      }
    });
    this.relay.on("connected", async () => {
      this.relay.send({
        version: 1,
        type: "host.snapshot",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: new Date().toISOString(),
        status: await this.status(),
      });
    });
    this.relay.on("status", (status) => this.emit("status", status));
    this.relay.on("disconnected", () => {
      this.instanceLock?.release().catch((error) => {
        this.logger.warn("connector", "释放 Connector 实例锁失败", { message: error.message });
      });
    });
    this.appServer.on("status", (status) => {
      this.emit("status", status);
      if (status.state === "reconnecting") this.#resetEventStream();
      if (this.relay.state === "connected") {
        this.status().then(current => this.relay.send({
          version: 1, type: "host.snapshot", spaceId: relaySpaceId(this.configStore.get().relay),
          deviceId: this.configStore.get().relay.deviceId, timestamp: new Date().toISOString(), status: current,
        })).catch(error => this.logger.warn("connector", "后端连接状态同步失败", { message: error.message }));
      }
    });
    this.appServer.on("notification", (method, params) => {
      const event = normalizeCodexNotification(method, params);
      if (!event) {
        // Keep protocol drift visible without flooding the log when Codex
        // repeats an unsupported notification on every turn.
        if (!this.#unsupportedNotificationMethods.has(method)) {
          this.#unsupportedNotificationMethods.add(method);
          this.logger.warn("app-server", "忽略不支持的 Codex 通知", { method });
        }
        return;
      }
      this.#enqueueEvent(event, params);
    });
    this.appServer.on("approval", (approval) => {
      this.#enqueueEvent({ type: "approval.requested", ...approval }, approval.params);
    });
    this.appServer.on("interactionResolved", (interaction) => {
      this.#enqueueEvent({ type: "interaction.resolved", ...interaction }, interaction.params);
    });
  }

  async #forwardEvent(event, params = {}, eventStreamId = this.eventStreamId) {
    if (!(await this.#isEventAllowed(params))) return;
    const config = this.configStore.get();
    const preparedEvent = await this.prepareResourceImages(event);
    if (eventStreamId !== this.eventStreamId) return;
    const envelope = eventEnvelope(config, this.eventBuffer, preparedEvent, extractContext(params));
    envelope.eventStreamId = this.eventStreamId;
    const sent = this.relay.send(envelope);
    if (!sent) {
      // Keep the event in EventBuffer so a reconnecting mobile client can
      // recover it through sync.request instead of treating a closed socket as
      // a successful delivery.
      this.logger.warn("connector", "Relay 当前不可用，事件已保留待同步", {
        eventId: envelope.eventId,
        sequence: envelope.sequence,
        type: event.type,
      });
    }
    this.emit("event", envelope);
  }

  async #isEventAllowed(params) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return true;
    const context = extractContext(params);
    const cwd = params.cwd || params.thread?.cwd;
    if (cwd) {
      const allowed = Boolean(safeProjectPath(cwd, allowedProjects));
      if (context.threadId) this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    }
    if (!context.threadId) return false;
    const cached = this.#readThreadAccess(context.threadId);
    if (cached !== undefined) return cached;
    try {
      // Access checks only need the thread cwd. A full thread.read can pull
      // megabytes of tool output and, while a turn is running, block the
      // event queue long enough for every streamed delta to appear frozen on
      // the remote client. The current App Server contract exposes the
      // metadata-only status read, so use it as the single source of truth.
      // This is only an access-control probe. Do not resume an untrusted
      // historical thread before its cwd has been checked. Only a write may
      // acquire the thread writer; reads remain persisted snapshots.
      const result = await this.appServer.readThreadStatus(context.threadId, { ensureResumed: false });
      const allowed = Boolean(result?.thread?.cwd && safeProjectPath(result.thread.cwd, allowedProjects));
      this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    } catch (error) {
      this.logger.warn("connector", "无法确认事件所属项目，已停止远程转发", { threadId: context.threadId, message: error.message });
      return false;
    }
  }
}
