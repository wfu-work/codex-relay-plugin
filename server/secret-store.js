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
    const key = spaceId || "default";
    // An environment token is an intentional token override, but it must not
    // hide the proof-bound Endpoint Grant persisted for the same Space. Keep
    // the grant/expiry metadata so a rotated environment token can still be
    // renewed automatically.
    const environmentToken = process.env.CODEX_RELAY_TOKEN?.trim();
    if (environmentToken) {
      const persisted = await this.getPersistedCredential(key);
      const candidate = {
        ...(persisted || {}),
        connectToken: environmentToken,
      };
      // Expiry metadata belongs to the persisted token. If an environment
      // override replaces that token, discard the old expiry so the client
      // cannot mistake a stale override for a still-valid credential.
      if (persisted?.connectToken && persisted.connectToken !== environmentToken) {
        delete candidate.expiresAt;
      }
      const credential = validateCredential(candidate);
      return cloneCredential(credential);
    }
    return this.getPersistedCredential(key);
  }

  /**
   * Read the credential written to disk without applying the optional
   * CODEX_RELAY_TOKEN runtime override.  Refresh responses must use this view
   * when they need authoritative expiry metadata; otherwise an environment
   * token would mask the newly rotated token forever.
   */
  async getPersistedCredential(spaceId) {
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

  async update(spaceId, patch, expectedCredential) {
    const key = spaceId || "default";
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("Relay 凭证更新格式无效");
    }
    // Treat an empty partial update as a no-op.  Callers use partial patches
    // for dashboard saves, and an empty object must never delete an existing
    // credential by accident.
    if (Object.keys(patch).length === 0) return this.getPersistedCredential(key);
    return this.#enqueue(async () => {
      // Read and write inside the same queue entry.  A refresh response can
      // arrive after the user has replaced a pairing; checking the current
      // file immediately before writing prevents that stale response from
      // overwriting the newly selected Grant.
      const values = await this.#readFallback();
      const persisted = values[key] ? validateCredential(values[key]) : null;
      const current = persisted || {};
      if (expectedCredential && !matchesCredential(current, expectedCredential)) {
        return null;
      }

      const next = { ...current, ...patch };
      if (Object.hasOwn(patch, "connectToken") && (patch.connectToken === "" || patch.connectToken === null || patch.connectToken === undefined)) {
        delete next.connectToken;
        delete next.expiresAt;
      }
      if (Object.hasOwn(patch, "endpointGrant") && (patch.endpointGrant === "" || patch.endpointGrant === null || patch.endpointGrant === undefined)) {
        delete next.endpointGrant;
        delete next.grantExpiresAt;
      }
      if (
        Object.hasOwn(patch, "connectToken")
        && typeof patch.connectToken === "string"
        && patch.connectToken.trim()
        && patch.connectToken !== current.connectToken
        && !Object.hasOwn(patch, "expiresAt")
      ) {
        delete next.expiresAt;
      }
      if (
        Object.hasOwn(patch, "endpointGrant")
        && typeof patch.endpointGrant === "string"
        && patch.endpointGrant.trim()
        && patch.endpointGrant !== current.endpointGrant
        && !Object.hasOwn(patch, "grantExpiresAt")
      ) {
        delete next.grantExpiresAt;
      }
      for (const name of ["expiresAt", "grantExpiresAt", "tokenEndpoint"]) {
        if (next[name] === null || next[name] === "" || next[name] === undefined) {
          delete next[name];
        }
      }
      // A dashboard/API caller may explicitly send undefined optional fields.
      // Remove those properties before deciding whether the credential is
      // empty; otherwise an undefined tokenEndpoint would keep an otherwise
      // cleared entry alive and make validateCredential reject the update.
      for (const name of Object.keys(next)) {
        if (next[name] === undefined) delete next[name];
      }
      if (!Object.keys(next).length) {
        delete values[key];
        await this.#writeFallback(values);
        this.cache.set(key, null);
        return null;
      }
      const normalized = validateCredential(next);
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      // Return the value written to disk, not getCredential(), because an
      // environment override may intentionally mask that value on reads.
      return cloneCredential(normalized);
    });
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
  const connectToken = validateSecret(value.connectToken, "Connect Token", false);
  const endpointGrant = validateSecret(value.endpointGrant, "Endpoint Grant", false);
  if (!connectToken && !endpointGrant) throw new Error("Connect Token 或 Endpoint Grant 至少需要一个");
  const expiresAt = validateExpiry(value.expiresAt, "Connect Token");
  const grantExpiresAt = validateExpiry(value.grantExpiresAt, "Endpoint Grant");
  const tokenEndpoint = validateTokenEndpoint(value.tokenEndpoint);
  return {
    ...(connectToken === undefined ? {} : { connectToken }),
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

function matchesCredential(current, expected) {
  const candidate = typeof expected === "string" ? { connectToken: expected } : expected;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const expectedValue = candidate[field];
    // `null`/`undefined` explicitly means that the field was absent when the
    // caller read the credential. This lets refresh use compare-and-swap even
    // for a Grant-only pairing, where a concurrent refresh may add the first
    // Connect Token between the read and the write.
    if (expectedValue === null || expectedValue === undefined) {
      if (current?.[field] !== undefined) return false;
    } else if (current?.[field] !== expectedValue) {
      return false;
    }
  }
  return true;
}
