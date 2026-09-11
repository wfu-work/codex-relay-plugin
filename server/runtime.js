import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ConnectorService } from "./connector-service.js";
import { ConfigStore } from "./config-store.js";
import { DashboardServer } from "./dashboard-server.js";
import { InstanceLock } from "./instance-lock.js";

let runtime;

// MCP processes are restarted independently by the desktop host. Only the
// first process owns Relay/App Server; later processes proxy to that owner.
export async function getRuntime() {
  if (runtime) return runtime;
  const configStore = new ConfigStore();
  const lock = new InstanceLock(configStore.configDir, "runtime.lock");
  try {
    await lock.acquire();
  } catch (error) {
    if (error.code !== "RELAY_INSTANCE_ALREADY_RUNNING") throw error;
    let info = await readRuntimeInfo(configStore.configDir);
    for (let attempt = 0; !info && attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      info = await readRuntimeInfo(configStore.configDir);
    }
    if (!info) throw error;
    const service = new RuntimeProxy(info);
    runtime = {
      service,
      dashboard: { url: () => info.url, status: () => ({ state: "running", ownerPid: info.pid }) },
      remote: true,
    };
    return runtime;
  }

  await retireLegacyConnector(configStore.configDir, lock);
  // Keep the process ownership lock separate from the connector connection
  // lock; disconnecting Relay must never release the runtime singleton.
  const service = new ConnectorService({ configDir: configStore.configDir });
  try {
    await service.start();
    const dashboard = new DashboardServer(service, service.logger);
    service.attachDashboard(dashboard);
    await dashboard.start();
    const info = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      generation: crypto.randomUUID(),
      version: process.env.CODEX_RELAY_PLUGIN_VERSION || "1.0.0",
      buildId: process.env.CODEX_RELAY_PLUGIN_BUILD_ID || process.env.CODEX_RELAY_PLUGIN_VERSION || "1.0.0",
      ...dashboard.connectionInfo(),
    };
    await writeRuntimeInfo(configStore.configDir, info);
    runtime = { service, dashboard, remote: false, configDir: configStore.configDir, runtimeInfo: info, runtimeLock: lock };
    return runtime;
  } catch (error) {
    await lock.release().catch(() => {});
    throw error;
  }
}

export async function stopRuntime() {
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  if (current.remote) return;
  try {
    await current.service.stop();
  } finally {
    if (current.runtimeLock) await current.runtimeLock.release().catch(() => {});
    if (current.configDir) await removeRuntimeInfo(current.configDir, current.runtimeInfo?.pid);
  }
}

async function readRuntimeInfo(configDir) {
  try {
    const info = JSON.parse(await fs.readFile(path.join(configDir, "runtime.json"), "utf8"));
    if (!Number.isInteger(info?.port) || info.port <= 0 || typeof info.accessKey !== "string" || !info.url) return null;
    try { process.kill(Number(info.pid), 0); } catch { return null; }
    return info;
  } catch {
    return null;
  }
}

async function writeRuntimeInfo(configDir, info) {
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  const file = path.join(configDir, "runtime.json");
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function removeRuntimeInfo(configDir, pid) {
  const file = path.join(configDir, "runtime.json");
  try {
    const current = JSON.parse(await fs.readFile(file, "utf8"));
    if (pid && Number(current.pid) !== Number(pid)) return;
  } catch {
    // The owner may have crashed after releasing the lock.
  }
  await fs.unlink(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function retireLegacyConnector(configDir, runtimeLock) {
  const file = path.join(configDir, "connector.lock");
  try {
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      return;
    }
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      try {
        await fs.access(file);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
    }
    const error = new Error("旧版 Codex Relay 进程未能在 3 秒内退出");
    error.code = "LEGACY_RUNTIME_STILL_RUNNING";
    throw error;
  } catch (error) {
    if (error.code === "ENOENT") return;
    await runtimeLock.release().catch(() => {});
    throw error;
  }
}

class RuntimeProxy {
  constructor(info) { this.info = info; }
  async status() { return this.#request("/api/status"); }
  async diagnostics() { return this.#request("/api/diagnostics"); }
  async connect() { return this.#request("/api/connection/connect", "POST"); }
  async disconnect() { return this.#request("/api/connection/disconnect", "POST"); }
  async testConnection() { return this.#request("/api/connection/test", "POST"); }
  async remoteControlStatus() { return this.#request("/api/remote-control"); }
  async remoteControlInstall() { return this.#request("/api/remote-control/install", "POST"); }
  async remoteControlStart() { return this.#request("/api/remote-control/start", "POST"); }
  async remoteControlStop() { return this.#request("/api/remote-control/stop", "POST"); }
  async remoteControlPair() { return this.#request("/api/remote-control/pair", "POST"); }
  async updateConfig(patch, credential) {
    return this.#request("/api/config", "PUT", { config: patch, credential });
  }

  async #request(endpoint, method = "GET", body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`http://127.0.0.1:${this.info.port}${endpoint}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.info.accessKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(value?.error?.message || `本地 Relay Agent 请求失败 (${response.status})`);
        error.code = value?.error?.code || "RUNTIME_PROXY_FAILED";
        throw error;
      }
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
}

export { RuntimeProxy, readRuntimeInfo };
