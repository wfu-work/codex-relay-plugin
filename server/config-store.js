import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isLoopbackHostname, randomId, normalizeRelayUrl } from "./utils.js";
import { SecretStore } from "./secret-store.js";

export const DEFAULT_PERMISSIONS = Object.freeze({
  readThreads: true,
  sendMessages: true,
  createThreads: true,
  steerTurns: true,
  interruptTurns: true,
  respondToApprovals: false,
});

export function defaultConfig() {
  return {
    version: 1,
    relay: {
      url: "",
      roomId: "",
      deviceId: randomId("host"),
      deviceName: os.hostname(),
      autoConnect: false,
      heartbeatSeconds: 20,
      reconnectMaxSeconds: 30,
    },
    codex: {
      executable: "codex",
      autoStartAppServer: true,
      defaultWorkingDirectory: "",
    },
    permissions: { ...DEFAULT_PERMISSIONS },
    allowedProjects: [],
    readOnly: false,
  };
}

export class ConfigStore {
  constructor({ configDir, logger } = {}) {
    this.configDir = configDir || process.env.CODEX_RELAY_CONFIG_DIR || path.join(os.homedir(), ".codex-relay-plugin");
    this.configFile = path.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.config = null;
  }

  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.config = mergeConfig(defaultConfig(), saved);
    validateConfig(this.config);
    return this.config;
  }

  get() {
    if (!this.config) throw new Error("配置尚未加载");
    return structuredClone(this.config);
  }

  async publicConfig() {
    const config = this.get();
    return {
      ...config,
      relay: {
        ...config.relay,
        tokenConfigured: Boolean(await this.secretStore.get(config.relay.roomId)),
      },
    };
  }

  async update(patch, token) {
    if (token !== undefined && (typeof token !== "string" || token.length > 16_384)) {
      throw new Error("Relay Token 必须是长度不超过 16384 的字符串");
    }
    const previousRoom = this.config?.relay?.roomId;
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.configFile}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.configFile);
    await fs.chmod(this.configFile, 0o600);
    this.config = next;
    if (token !== undefined && token !== "") await this.secretStore.set(next.relay.roomId, token);
    if (previousRoom && previousRoom !== next.relay.roomId && token === undefined) {
      const oldToken = await this.secretStore.get(previousRoom);
      if (oldToken) await this.secretStore.set(next.relay.roomId, oldToken);
    }
    this.logger?.info("config", "配置已保存", { relayUrl: next.relay.url, roomId: next.relay.roomId });
    return this.publicConfig();
  }

  async token() {
    return this.secretStore.get(this.get().relay.roomId);
  }
}

function mergeConfig(base, patch) {
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...(patch.relay || {}) },
    codex: { ...base.codex, ...(patch.codex || {}) },
    permissions: { ...base.permissions, ...(patch.permissions || {}) },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects,
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("配置版本无效");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay 配置无效");
  if (config.relay.url) {
    const relayUrl = new URL(normalizeRelayUrl(config.relay.url));
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("非本机 Relay 必须使用 wss:// 加密连接");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay 地址不能包含用户名或密码");
  }
  if (config.relay.roomId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.roomId)) {
    throw new Error("房间 ID 只能包含字母、数字、点、下划线、冒号和连字符");
  }
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.deviceId || "")) throw new Error("设备 ID 无效");
  const heartbeat = Number(config.relay.heartbeatSeconds);
  if (!Number.isFinite(heartbeat) || heartbeat < 5 || heartbeat > 300) {
    throw new Error("心跳间隔必须在 5 到 300 秒之间");
  }
  const reconnectMax = Number(config.relay.reconnectMaxSeconds);
  if (!Number.isFinite(reconnectMax) || reconnectMax < 5 || reconnectMax > 600) {
    throw new Error("最大重连间隔必须在 5 到 600 秒之间");
  }
  if (typeof config.relay.deviceName !== "string" || config.relay.deviceName.length > 128) {
    throw new Error("设备名称无效");
  }
  if (typeof config.relay.autoConnect !== "boolean") throw new Error("自动连接配置必须是布尔值");
  if (!config.codex || typeof config.codex !== "object") throw new Error("Codex 配置无效");
  if (typeof config.codex.executable !== "string" || !config.codex.executable.trim()) throw new Error("Codex 命令无效");
  if (typeof config.codex.defaultWorkingDirectory !== "string") throw new Error("默认工作目录无效");
  if (config.codex.defaultWorkingDirectory && !path.isAbsolute(config.codex.defaultWorkingDirectory)) {
    throw new Error("默认工作目录必须是绝对路径");
  }
  if (typeof config.codex.autoStartAppServer !== "boolean") throw new Error("App Server 自动启动配置必须是布尔值");
  if (!config.permissions || typeof config.permissions !== "object") throw new Error("远程权限配置无效");
  for (const name of Object.keys(DEFAULT_PERMISSIONS)) {
    if (typeof config.permissions[name] !== "boolean") throw new Error(`远程权限 ${name} 必须是布尔值`);
  }
  if (typeof config.readOnly !== "boolean") throw new Error("只读模式必须是布尔值");
  if (!Array.isArray(config.allowedProjects)) throw new Error("项目白名单必须是数组");
  for (const project of config.allowedProjects) {
    if (typeof project !== "string" || !path.isAbsolute(project)) throw new Error(`项目路径必须是绝对路径：${project}`);
  }
  return config;
}
