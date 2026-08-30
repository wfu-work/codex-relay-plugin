import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class SecretStore {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path.join(configDir, "secrets.json");
    this.cache = new Map();
    this.writeQueue = Promise.resolve();
  }

  async get(spaceId) {
    const credential = await this.getCredential(spaceId);
    return credential?.connectToken || null;
  }

  async getCredential(spaceId) {
    if (process.env.CODEX_RELAY_TOKEN) {
      return { connectToken: process.env.CODEX_RELAY_TOKEN };
    }
    const key = spaceId || "default";
    if (this.cache.has(key)) return cloneCredential(this.cache.get(key));
    const values = await this.#readFallback();
    const credential = values[key] ? validateCredential(values[key]) : null;
    this.cache.set(key, credential);
    return cloneCredential(credential);
  }

  async set(spaceId, credential) {
    const key = spaceId || "default";
    if (!credential) return this.delete(key);
    const normalized = validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return { backend: "file" };
    });
  }

  async update(spaceId, patch) {
    const current = (await this.getCredential(spaceId)) || {};
    return this.set(spaceId, { ...current, ...patch });
  }

  validate(credential) {
    return validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
  }

  async delete(spaceId) {
    const key = spaceId || "default";
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      delete values[key];
      await this.#writeFallback(values);
      this.cache.set(key, null);
    });
  }

  async #readFallback() {
    try {
      return JSON.parse(await fs.readFile(this.fallbackFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async #writeFallback(values) {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.fallbackFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.fallbackFile);
    await fs.chmod(this.fallbackFile, 0o600);
  }

  #enqueue(operation) {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }
}

function validateCredential(value) {
  if (typeof value === "string") value = { connectToken: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Relay 凭证格式无效");
  }
  const connectToken = validateSecret(value.connectToken, "Connect Token", true);
  const endpointGrant = validateSecret(value.endpointGrant, "Endpoint Grant", false);
  const expiresAt = validateExpiry(value.expiresAt, "Connect Token");
  const grantExpiresAt = validateExpiry(value.grantExpiresAt, "Endpoint Grant");
  const tokenEndpoint = validateTokenEndpoint(value.tokenEndpoint);
  return {
    connectToken,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(endpointGrant === undefined ? {} : { endpointGrant }),
    ...(grantExpiresAt === undefined ? {} : { grantExpiresAt }),
    ...(tokenEndpoint === undefined ? {} : { tokenEndpoint }),
  };
}

function validateSecret(value, label, required) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${label} 不能为空`);
    return undefined;
  }
  const minimum = label === "Endpoint Grant" ? 16 : 1;
  if (typeof value !== "string" || value.length < minimum || value.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} 格式无效`);
  }
  return value;
}

function validateExpiry(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} 过期时间无效`);
  return value;
}

function validateTokenEndpoint(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Token Endpoint 无效");
  const endpoint = new URL(value);
  if (!endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Token Endpoint 不能包含凭证、query 或 hash");
  }
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
    throw new Error("非本机 Token Endpoint 必须使用 https://");
  }
  return endpoint.toString();
}

function cloneCredential(value) {
  return value ? { ...value } : null;
}
