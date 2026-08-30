import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isLoopbackHostname, randomId, normalizeRelayUrl } from "./utils.js";
import { SecretStore } from "./secret-store.js";
import { EndpointIdentityStore } from "./endpoint-identity-store.js";

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
      spaceId: "",
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
    this.endpointIdentityStore = new EndpointIdentityStore(this.configDir);
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

  async publicConfig({ includeToken = false } = {}) {
    const config = this.get();
    const credential = await this.secretStore.getCredential(relaySpaceId(config.relay));
    const identity = await this.endpointIdentityStore.get();
    return {
      ...config,
      relay: {
        ...config.relay,
        ...(includeToken ? {
          token: credential?.connectToken || "",
          ...(credential?.endpointGrant ? { endpointGrant: credential.endpointGrant } : {}),
        } : {}),
        tokenConfigured: Boolean(credential?.connectToken),
        tokenExpiresAt: credential?.expiresAt || null,
        endpointGrantConfigured: Boolean(credential?.endpointGrant),
        grantExpiresAt: credential?.grantExpiresAt || null,
        tokenEndpoint: credential?.tokenEndpoint || "",
        endpointPublicKey: identity.publicKey,
      },
    };
  }

  async update(patch, credentialPatch) {
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    const nextSpace = relaySpaceId(next.relay);
    let nextCredential;
    if (credentialPatch !== undefined) {
      if (typeof credentialPatch === "string") credentialPatch = { connectToken: credentialPatch };
      if (!credentialPatch || typeof credentialPatch !== "object" || Array.isArray(credentialPatch)) {
        throw new Error("Relay Token 凭证必须是对象");
      }
      if (Object.hasOwn(credentialPatch, "token")) {
        throw new Error("Relay Token 必须通过字符串或 connectToken 字段提供");
      }
      const current = (await this.secretStore.getCredential(nextSpace)) || {};
      const credential = credentialPatch.connectToken ? {
        connectToken: credentialPatch.connectToken,
        ...(credentialPatch.expiresAt ? { expiresAt: credentialPatch.expiresAt } : {}),
        ...credentialField(credentialPatch, "endpointGrant"),
        ...credentialField(credentialPatch, "grantExpiresAt"),
        ...credentialField(credentialPatch, "tokenEndpoint"),
      } : {
        ...current,
        ...(credentialPatch.expiresAt ? { expiresAt: credentialPatch.expiresAt } : {}),
        ...credentialField(credentialPatch, "endpointGrant"),
        ...credentialField(credentialPatch, "grantExpiresAt"),
        ...credentialField(credentialPatch, "tokenEndpoint"),
      };
      if (Object.keys(credential).length) nextCredential = this.secretStore.validate(credential);
    }
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.configFile}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.configFile);
    await fs.chmod(this.configFile, 0o600);
    this.config = next;
    if (nextCredential) await this.secretStore.set(nextSpace, nextCredential);
    // Connect Tokens are proof-bound to a single Space. Do not copy a token
    // when the configured Space changes; an existing token for the new Space,
    // if any, remains available in the per-Space secret store.
    this.logger?.info("config", "配置已保存", { relayUrl: next.relay.url, spaceId: nextSpace });
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
}

function credentialField(patch, name) {
  if (!Object.hasOwn(patch, name)) return {};
  return patch[name] === "" || patch[name] === null ? { [name]: undefined } : { [name]: patch[name] };
}

function mergeConfig(base, patch) {
  const relayPatch = patch.relay || {};
  const spaceId = relayPatch.spaceId ?? base.relay.spaceId ?? "";
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...relayPatch, spaceId },
    codex: { ...base.codex, ...(patch.codex || {}) },
    permissions: { ...base.permissions, ...(patch.permissions || {}) },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects,
  };
}

export function relaySpaceId(relay) {
  return String(relay?.spaceId || "");
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("配置版本无效");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay 配置无效");
  if (config.relay.url) {
    const normalizedRelayUrl = normalizeRelayUrl(config.relay.url);
    const relayUrl = new URL(normalizedRelayUrl);
    config.relay.url = normalizedRelayUrl;
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("非本机 Relay 必须使用 wss:// 加密连接");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay 地址不能包含用户名或密码");
    if (relayUrl.search || relayUrl.hash) throw new Error("Relay 地址不能包含 query 或 hash；Token 必须放在 connect.hello 首帧");
  }
  const spaceId = relaySpaceId(config.relay);
  if (spaceId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(spaceId)) {
    throw new Error("Space ID 只能包含字母、数字、点、下划线、冒号和连字符");
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
