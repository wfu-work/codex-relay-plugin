import { EventEmitter } from "node:events";
import { AppServerClient } from "./app-server-client.js";
import { CommandRouter } from "./command-router.js";
import { ConfigStore } from "./config-store.js";
import { relayEndpointId, relaySpaceId } from "./config-store.js";
import { EventBuffer } from "./event-buffer.js";
import { InstanceLock } from "./instance-lock.js";
import { Logger } from "./logger.js";
import { eventEnvelope, extractContext, normalizeCodexNotification } from "./protocol.js";
import { RelayClient } from "./relay-client.js";
import { filterThreadList, safeProjectPath } from "./utils.js";

export class ConnectorService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.instanceLock = options.instanceLock || null;
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1000);
    this.dashboard = null;
    this.startedAt = null;
    this.starting = null;
    this.autoConnectStarted = false;
    this.eventQueue = Promise.resolve();
    this.threadAccess = new Map();
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
        startedAt: this.startedAt,
      },
      relay: this.relay.status(),
      appServer: this.appServer.status(),
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
        tokenExpiresAt: config.relay.tokenExpiresAt,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
        endpointPublicKey: config.relay.endpointPublicKey,
      },
      protocol: {
        version: 1,
        latestSequence: this.eventBuffer.latestSequence(),
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
        tokenEndpoint: config.relay.tokenEndpoint,
      },
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }

  async syncAfter(lastSequence) {
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
      && !(requestedSequence === 0 && events.length === 0)
    ) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence() };
    }
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 50 }), allowedProjects);
    return {
      mode: "snapshot",
      status: await this.status(),
      threads,
      latestSequence: this.eventBuffer.latestSequence(),
    };
  }

  #wireEvents() {
    this.relay.on("command", async (message) => {
      const response = await this.router.handle(message);
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
    this.appServer.on("status", (status) => this.emit("status", status));
    this.appServer.on("notification", (method, params) => {
      const event = normalizeCodexNotification(method, params);
      if (!event) return;
      this.eventQueue = this.eventQueue
        .then(() => this.#forwardEvent(event, params))
        .catch((error) => this.logger.warn("connector", "Codex 事件转发失败", { message: error.message }));
    });
    this.appServer.on("approval", (approval) => {
      this.eventQueue = this.eventQueue
        .then(() => this.#forwardEvent({ type: "approval.requested", ...approval }, approval.params))
        .catch((error) => this.logger.warn("connector", "审批事件转发失败", { message: error.message }));
    });
  }

  async #forwardEvent(event, params = {}) {
    if (!(await this.#isEventAllowed(params))) return;
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
      this.logger.warn("connector", "无法确认事件所属项目，已停止远程转发", { threadId: context.threadId, message: error.message });
      return false;
    }
  }
}
