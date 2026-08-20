import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE = "codex-relay-plugin";

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
    try {
      if (process.platform === "darwin") {
        const { stdout } = await execFileAsync("security", [
          "find-generic-password",
          "-s",
          SERVICE,
          "-a",
          account,
          "-w",
        ]);
        const token = stdout.trim() || null;
        this.cache.set(account, token);
        return token;
      }
      if (process.platform === "linux") {
        const { stdout } = await execFileAsync("secret-tool", [
          "lookup",
          "service",
          SERVICE,
          "room",
          account,
        ]);
        const token = stdout.trim() || null;
        this.cache.set(account, token);
        return token;
      }
    } catch {
      // Fall through to the mode-0600 file for systems without a keychain CLI.
    }
    const values = await this.#readFallback();
    const token = values[account] || null;
    this.cache.set(account, token);
    return token;
  }

  async set(roomId, token) {
    const account = roomId || "default";
    if (!token) return this.delete(account);
    try {
      if (process.platform === "darwin") {
        await execFileAsync("security", [
          "add-generic-password",
          "-U",
          "-s",
          SERVICE,
          "-a",
          account,
          "-w",
          token,
        ]);
        this.cache.set(account, token);
        return { backend: "keychain" };
      }
    } catch (error) {
      this.logger?.warn("secret-store", "系统 Keychain 写入失败，使用权限受限的本地文件", {
        message: error.message,
      });
    }
    const values = await this.#readFallback();
    values[account] = token;
    await this.#writeFallback(values);
    this.cache.set(account, token);
    return { backend: "file" };
  }

  async delete(roomId) {
    const account = roomId || "default";
    try {
      if (process.platform === "darwin") {
        await execFileAsync("security", [
          "delete-generic-password",
          "-s",
          SERVICE,
          "-a",
          account,
        ]);
      }
    } catch {
      // Missing keychain items are equivalent to deletion.
    }
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
