import fs from "node:fs/promises";
import path from "node:path";

export class SecretStore {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path.join(configDir, "secrets.json");
    this.cache = new Map();
  }

  async get(roomId) {
    if (process.env.CODEX_RELAY_TOKEN) return process.env.CODEX_RELAY_TOKEN;
    const account = roomId || "default";
    if (this.cache.has(account)) return this.cache.get(account);
    const values = await this.#readFallback();
    const token = values[account] || null;
    this.cache.set(account, token);
    return token;
  }

  async set(roomId, token) {
    const account = roomId || "default";
    if (!token) return this.delete(account);
    const values = await this.#readFallback();
    values[account] = token;
    await this.#writeFallback(values);
    this.cache.set(account, token);
    return { backend: "file" };
  }

  async delete(roomId) {
    const account = roomId || "default";
    const values = await this.#readFallback();
    delete values[account];
    await this.#writeFallback(values);
    this.cache.set(account, null);
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
    await fs.writeFile(this.fallbackFile, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(this.fallbackFile, 0o600);
  }
}
