import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PLUGIN_ROOT, redact } from "./utils.js";
import { RelayError } from "./errors.js";

const exec = promisify(execFile);
const CACHE_MS = 15_000;
const STALE_MS = 60_000;
const clean = value => typeof value === "string" ? redact(value).slice(0, 600) : null;
const samePath = (a, b) => typeof a === "string" && typeof b === "string" && path.resolve(a) === path.resolve(b);

export async function inspectExecutable(configured, options = {}) {
  const env = options.env || process.env;
  const run = options.exec || exec;
  const platform = options.platform || process.platform;
  const candidates = [];
  const add = value => { if (value && path.isAbsolute(value) && !candidates.includes(value)) candidates.push(value); };
  if (path.isAbsolute(configured || "")) add(configured);
  else if (configured && !/[\\/]/.test(configured)) for (const directory of (env.PATH || "").split(path.delimiter)) if (path.isAbsolute(directory)) add(path.join(directory, configured));
  const configuredCandidates = [...candidates];
  if (path.basename(env.CODEX_CLI_PATH || "") === "codex") add(env.CODEX_CLI_PATH);
  if (env.CODEX_ELECTRON_RESOURCES_PATH) add(path.join(env.CODEX_ELECTRON_RESOURCES_PATH, "codex"));
  if (platform === "darwin") { add("/Applications/ChatGPT.app/Contents/Resources/codex"); add("/Applications/Codex.app/Contents/Resources/codex"); }
  let candidate = null; let configuredValid = false;
  for (const file of candidates) {
    try {
      await fs.access(file, constants.X_OK);
      const { stdout } = await run(file, ["--version"], { timeout: 2500, maxBuffer: 4096, env });
      const version = stdout.trim();
      if (!/^codex-cli\s+[^\s]+$/.test(version)) continue;
      candidate = { path: file, version }; configuredValid = configuredCandidates.includes(file); break;
    } catch { /* try next candidate */ }
  }
  return {
    state: configuredValid ? "ok" : "error", configured: configured || "codex", resolved: configuredValid ? candidate?.path : null,
    version: configuredValid ? candidate?.version : null, candidate,
    needsRepair: Boolean(candidate && (!configuredValid || configured !== candidate.path)),
    message: configuredValid ? "Codex 程序验证通过" : candidate ? "当前命令不可用，已找到可用的 Codex 程序" : "未找到可用的 Codex 程序，请在高级设置中指定安装路径",
  };
}

function processConflicts(output, allowedPids = []) {
  return output.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || allowedPids.includes(Number(match[1]))) return [];
    const command = match[3];
    if (/^\/.*\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:$|\s+--)/.test(command)) return [{ pid: Number(match[1]), kind: "desktop" }];
    if (/(?:^|\/)codex\s+(?:.*?\s)?app-server(?:\s|$)/.test(command) && !/app-server\s+(?:proxy|daemon|generate-)/.test(command)) return [{ pid: Number(match[1]), kind: "backend" }];
    if (/\bnode\s+.*\/(?:agent-cli|mcp-server|dashboard-cli)\.js(?:\s|$)/.test(command)) return [{ pid: Number(match[1]), kind: "relay" }];
    return [];
  });
}

export class EnvironmentService {
  constructor(service, options = {}) {
    this.service = service; this.platform = options.platform || process.platform; this.env = options.env || process.env;
    this.exec = options.exec || exec; this.pluginRoot = options.pluginRoot || PLUGIN_ROOT; this.codexHome = this.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    this.cache = null; this.pending = null; this.repairing = false; this.remoteControl = options.remoteControl || service.remoteControl || null;
  }
  async inspect(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && Date.now() - this.cache.time < CACHE_MS) return this.cache.value;
    this.pending = this.collect();
    try { const value = await this.pending; this.cache = { time: Date.now(), value }; return value; } finally { this.pending = null; }
  }
  async collect() {
    const config = this.service.configStore.get(); const configDir = this.service.configStore.configDir; const checkedAt = new Date().toISOString();
    const [executable, processes, installed, remoteControl] = await Promise.all([
      inspectExecutable(config.codex.executable, { env: this.env, platform: this.platform, exec: this.exec }), this.inspectProcesses(),
      fs.readFile(path.join(this.pluginRoot, ".codex-plugin/plugin.json"), "utf8").then(JSON.parse).catch(() => null),
      this.remoteControl?.inspect ? Promise.resolve().then(() => this.remoteControl.inspect()).catch(error => ({ checkedAt, official: { state: "error", installed: false, reason: clean(error.message) }, bridge: { state: "blocked", attachable: false, endpoint: null, reason: "Remote Control 状态检查失败" } })) : Promise.resolve(null),
    ]);
    const status = await this.service.status(); const runningVersion = process.env.CODEX_RELAY_PLUGIN_VERSION || "development"; const runningBuild = process.env.CODEX_RELAY_PLUGIN_BUILD_ID || null;
    const diskBundle = runningBuild ? await fs.readFile(path.join(this.pluginRoot, "server/agent-cli.js"), "utf8").catch(() => null) : null;
    const needsRestart = runningBuild && diskBundle !== null ? !diskBundle.includes(JSON.stringify(runningBuild)) : installed?.version && runningVersion !== "development" ? installed.version !== runningVersion : null;
    const owned = processes.items.filter(p => p.scope === "same" && (p.kind === "backend" || p.kind === "relay"));
    const repairAllowed = ["stopped", "error"].includes(status.appServer?.state) && executable.needsRepair;
    return {
      checkedAt, staleAfterMs: STALE_MS, platform: this.platform,
      plugin: { installedVersion: installed?.version || null, runningVersion, needsRestart, pid: process.pid, startedAt: status.connector?.startedAt, root: this.pluginRoot },
      desktop: { version: null, running: processes.state === "ok" ? processes.items.some(p => p.kind === "desktop" && p.scope === "same") : null },
      executable, processes,
      backend: { mode: "managed", state: status.appServer?.state || "unknown", pid: status.appServer?.pid ?? null, ownsProcess: status.appServer?.ownsProcess ?? null, endpoint: null, error: clean(status.appServer?.lastError) },
      desktopBackend: { state: "unavailable", pid: null, transport: null, endpoint: null, attachable: false, reason: "桌面版 App Server 不由 Relay 插件管理" },
      remoteControl: remoteControl || { checkedAt, official: { state: "unavailable", installed: false, reason: "未检查" }, bridge: { state: "blocked", endpoint: null, attachable: false, reason: "未检查" } },
      relay: { state: status.relay?.state || "unknown", lastHeartbeat: status.relay?.lastHeartbeat || null, reconnectAttempt: status.relay?.reconnectAttempt || 0 },
      sharing: { state: "managed", label: "插件托管已启用", message: "Codex App Server 由插件在本机管理，Relay 负责认证、外网桥接和协议转发。" },
      desktopTools: { state: "unchecked", label: "当前连接未验证", message: "桌面工具由 Codex App Server 本地配置管理。" },
      paths: { configDir, codexHome: this.codexHome },
      actions: { repair: { enabled: Boolean(repairAllowed), candidate: executable.candidate?.path || null, reason: !executable.candidate ? "尚未找到可用程序，请先安装 Codex 或在高级设置中指定路径" : !executable.needsRepair ? "当前已使用验证过的完整路径，无需修复" : !repairAllowed ? "后端正在使用中，请在停止执行后通过高级设置修改路径" : "验证候选路径后保存；自动连接已开启时会尝试恢复连接" } },
    };
  }
  async inspectProcesses() {
    if (this.platform === "win32") return { state: "unsupported", items: [], message: "当前平台暂不支持进程占用检查" };
    try {
      const { stdout } = await this.exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
      const items = await Promise.all(processConflicts(stdout).map(async item => {
        const line = stdout.split("\n").find(line => Number(line.trim().split(/\s+/)[0]) === item.pid) || ""; const command = line.trim().replace(/^\d+\s+\d+\s+/, "");
        const application = item.kind === "desktop" ? "Codex 桌面" : item.kind === "relay" ? "Relay 插件" : "Codex App Server";
        const details = await this.exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="], { timeout: 2000, maxBuffer: 1024 * 1024 }).then(r => r.stdout, () => "");
        const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME"; const selected = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`))?.[1];
        const defaultDir = path.join(os.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex"); const target = item.kind === "relay" ? this.service.configStore.configDir : this.codexHome;
        return { ...item, application, scope: !details ? "unknown" : samePath(selected || defaultDir, target) ? "same" : "other", taskState: "unknown" };
      }));
      return { state: "ok", items, message: "仅检查进程和数据目录，不会自动结束这些进程。" };
    } catch { return { state: "error", items: [], message: "进程检查失败，不能据此判断没有占用" }; }
  }
  async repairExecutable(expected = {}) {
    if (this.repairing) throw new RelayError("ENVIRONMENT_BUSY", "正在修复执行路径，请稍候"); this.repairing = true;
    try {
      const current = await this.inspect(true); if (!current.actions.repair.enabled) throw new RelayError("REPAIR_NOT_AVAILABLE", current.actions.repair.reason);
      if (expected.configured !== current.executable.configured || expected.candidate !== current.actions.repair.candidate) throw new RelayError("ENVIRONMENT_CHANGED", "环境已变化，请重新检查后再修复");
      const backend = this.service.appServer.status(); if (!["stopped", "error"].includes(backend.state) || this.service.configStore.get().codex.executable !== expected.configured) throw new RelayError("ENVIRONMENT_CHANGED", "后端或配置已变化，请重新检查");
      let connectionError = null; try { await this.service.updateConfig({ codex: { executable: current.actions.repair.candidate } }); } catch (error) { if (this.service.configStore.get().codex.executable !== current.actions.repair.candidate) throw error; connectionError = "路径已保存，但连接尚未恢复；请查看后端与 Relay 状态"; }
      this.cache = null; return { saved: true, executable: current.actions.repair.candidate, connectionError, environment: await this.inspect(true) };
    } finally { this.repairing = false; }
  }
}
