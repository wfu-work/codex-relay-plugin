import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigStore } from "./config-store.js";
import { readRuntimeInfo } from "./runtime.js";

const START_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 100;

/**
 * Ensure the long-lived relay-agent exists.  MCP transports are short-lived
 * and their stdin is closed during a Codex reload, so they must never own the
 * Relay/App Server process directly.
 */
export async function ensureAgent(options = {}) {
  const configStore = options.configStore || new ConfigStore();
  const configDir = configStore.configDir;
  let existing = await readRuntimeInfo(configDir);
  const expectedBuild = process.env.CODEX_RELAY_PLUGIN_BUILD_ID;
  // A runtime record created by a pre-agent build has no buildId; retire it
  // once a versioned production bundle starts so stale code cannot survive an
  // upgrade indefinitely.
  if (existing && expectedBuild && existing.buildId !== expectedBuild) {
    await retireAgent(existing.pid, configDir, options.timeoutMs);
    existing = null;
  }
  if (existing) return existing;

  const agentScript = options.agentScript || path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-cli.js");
  const child = spawn(process.execPath, [agentScript], {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, CODEX_RELAY_AGENT: "1" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + (options.timeoutMs ?? START_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const info = await readRuntimeInfo(configDir);
    if (info) return info;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // The caller can fall back to becoming the owner itself. Include the agent
  // pid for diagnostics without making startup failure fatal here.
  return null;
}

async function retireAgent(pid, configDir, timeoutMs) {
  if (Number.isInteger(Number(pid)) && Number(pid) > 0 && Number(pid) !== process.pid) {
    try { process.kill(Number(pid), "SIGTERM"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + Math.min(timeoutMs ?? START_TIMEOUT_MS, 5_000);
  while (Date.now() < deadline) {
    if (!(await readRuntimeInfo(configDir))) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (Number.isInteger(Number(pid)) && Number(pid) > 0) {
    try { process.kill(Number(pid), "SIGKILL"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
