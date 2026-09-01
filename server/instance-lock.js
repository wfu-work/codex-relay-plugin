import fs from "node:fs/promises";
import path from "node:path";

const LOCK_WRITE_GRACE_MS = 5_000;

export class InstanceLock {
  #file = null;
  #handle = null;
  #acquirePromise = null;

  constructor(configDir, name = "connector.lock") {
    this.#file = path.join(configDir, name);
  }

  async acquire() {
    if (this.#handle) return;
    if (this.#acquirePromise) return this.#acquirePromise;
    this.#acquirePromise = this.#acquire();
    try {
      await this.#acquirePromise;
    } finally {
      this.#acquirePromise = null;
    }
  }

  async #acquire() {
    await fs.mkdir(path.dirname(this.#file), { recursive: true, mode: 0o700 });
    for (;;) {
      try {
        this.#handle = await fs.open(this.#file, "wx", 0o600);
        await this.#handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
        return;
      } catch (error) {
        if (this.#handle) {
          await this.#handle.close().catch(() => {});
          this.#handle = null;
        }
        if (error.code !== "EEXIST") throw error;
        if (await this.#removeIfStale()) continue;
        const active = new Error("同一配置目录已有 Codex Relay Connector 在运行");
        active.code = "RELAY_INSTANCE_ALREADY_RUNNING";
        throw active;
      }
    }
  }

  async release() {
    const handle = this.#handle;
    if (!handle) return;
    this.#handle = null;
    await handle.close().catch(() => {});
    await fs.unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async #removeIfStale() {
    let record;
    try {
      record = JSON.parse(await fs.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return true;
      // A process can die between exclusive creation and writing its PID. Keep
      // a fresh partial lock protected during that tiny window, then recover it
      // as stale on a later startup.
      try {
        const stat = await fs.stat(this.#file);
        if (Date.now() - stat.mtimeMs < LOCK_WRITE_GRACE_MS) return false;
      } catch (statError) {
        if (statError.code === "ENOENT") return true;
        return false;
      }
      await fs.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      await fs.unlink(this.#file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
      await fs.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
  }
}
