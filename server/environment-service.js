import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PLUGIN_ROOT, redact } from "./utils.js";
import { RelayError } from "./errors.js";
import { processConflicts } from "./shared-backend-manager.js";
import { readDesktopCompatibility } from "./desktop-compatibility.js";

const exec = promisify(execFile);
const CACHE_MS = 15_000;
const STALE_MS = 60_000;
const clean = value => typeof value === "string" ? redact(value).slice(0, 600) : null;
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
async function json(file) {
  try {
    if ((await fs.stat(file)).size > 256 * 1024) throw new Error("Record too large");
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
const samePath = (a, b) => typeof a === "string" && typeof b === "string" && path.resolve(a) === path.resolve(b);

export async function inspectExecutable(configured, options = {}) {
  const env = options.env || process.env;
  const run = options.exec || exec;
  const platform = options.platform || process.platform;
  const candidates = [];
  const add = value => { if (value && path.isAbsolute(value) && !candidates.includes(value)) candidates.push(value); };
  if (path.isAbsolute(configured || "")) add(configured);
  else if (configured && !/[\\/]/.test(configured)) {
    for (const directory of (env.PATH || "").split(path.delimiter)) {
      if (path.isAbsolute(directory)) add(path.join(directory, configured));
    }
  }
  const configuredCandidates = [...candidates];
  if (path.basename(env.CODEX_CLI_PATH || "") === "codex") add(env.CODEX_CLI_PATH);
  if (env.CODEX_ELECTRON_RESOURCES_PATH) add(path.join(env.CODEX_ELECTRON_RESOURCES_PATH, "codex"));
  if (platform === "darwin") {
    add("/Applications/ChatGPT.app/Contents/Resources/codex");
    add("/Applications/Codex.app/Contents/Resources/codex");
  }
  let candidate = null;
  let configuredValid = false;
  for (const file of candidates) {
    try {
      await fs.access(file, constants.X_OK);
      const { stdout } = await run(file, ["--version"], { timeout: 2500, maxBuffer: 4096, env });
      const version = stdout.trim();
      if (!/^codex-cli\s+[^\s]+$/.test(version)) continue;
      candidate = { path: file, version };
      configuredValid = configuredCandidates.includes(file);
      break;
    } catch { /* A failed candidate does not establish a valid Codex installation. */ }
  }
  return {
    state: configuredValid ? "ok" : "error", configured: configured || "codex", resolved: configuredValid ? candidate?.path : null,
    version: configuredValid ? candidate?.version : null, candidate,
    needsRepair: Boolean(candidate && (!configuredValid || configured !== candidate.path)),
    message: configuredValid ? "Codex 程序验证通过" : candidate ? "当前命令不可用，已找到可用的 Codex 程序" : "未找到可用的 Codex 程序，请在高级设置中指定安装路径",
  };
}

// Historical results are evidence of a previous attempt, never proof that
// the current Desktop connection or a newly started backend is healthy.
export function migrationView(manifest, result, activation, configDir, codexHome) {
  if (!manifest) return { state: "not_prepared", label: "尚未准备迁移", last: null };
  if (!samePath(manifest.relayConfig, path.join(configDir, "config.json")) || !samePath(manifest.codexHome, codexHome)) {
    return { state: "different_environment", label: "启动包属于其他环境", last: null };
  }
  const last = result ? {
    phase: clean(result.phase), failedPhase: clean(result.failedPhase), success: result.success === true,
    updatedAt: date(result.updatedAt || result.completedAt || result.startedAt), error: clean(result.error),
    recovery: clean(result.recovery), backup: clean(result.backup),
    checks: { concurrentResume: result.checks?.concurrentResume === true, desktopTools: result.checks?.desktopTools === true },
  } : null;
  return {
    state: activation?.phase === "active" ? "active" : last?.phase === "failed" ? "failed" : "prepared",
    label: activation?.phase === "active" ? "已有共享模式启用记录" : last?.phase === "failed" ? "上次迁移未完成" : "已准备启动包",
    last,
  };
}

export class EnvironmentService {
  constructor(service, options = {}) {
    this.service = service;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exec = options.exec || exec;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.sharedRoot = options.sharedRoot || this.env.CODEX_RELAY_SHARED_ROOT || path.join(os.homedir(), "Library/Application Support/Recodex Shared Backend");
    this.codexHome = this.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    this.cache = null;
    this.pending = null;
    this.repairing = false;
  }

  async inspect(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && Date.now() - this.cache.time < CACHE_MS) return this.cache.value;
    this.pending = this.collect();
    try {
      const value = await this.pending;
      this.cache = { time: Date.now(), value };
      return value;
    } finally { this.pending = null; }
  }

  async collect() {
    const config = this.service.configStore.get();
    const configDir = this.service.configStore.configDir;
    const checkedAt = new Date().toISOString();
    const [executable, processes, migration, installed] = await Promise.all([
      inspectExecutable(config.codex.executable, { env: this.env, platform: this.platform, exec: this.exec }),
      this.inspectProcesses(), this.inspectMigration(),
      json(path.join(this.pluginRoot, ".codex-plugin/plugin.json")).catch(() => null),
    ]);
    const status = await this.service.status();
    const shared = status.appServer?.connectionMode === "shared";
    const backendReady = status.appServer?.state === "ready";
    let desktopVersion = null;
    if (this.platform === "darwin") {
      const app = processes.items.find(item => item.kind === "desktop")?.appPath;
      if (app) desktopVersion = await this.exec("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(app, "Contents/Info.plist")], { timeout: 2000, maxBuffer: 4096 }).then(r => clean(r.stdout.trim()), () => null);
    }
    const lastToolFailure = migration.last?.failedPhase === "verifying_shared_runtime" && /工具|签名|signing|pipe/i.test(migration.last.error || "");
    const runningVersion = process.env.CODEX_RELAY_PLUGIN_VERSION || "development";
    const runningBuild = process.env.CODEX_RELAY_PLUGIN_BUILD_ID || null;
    // Match the on-disk bundle's marker, so rebuilding the same version can
    // still be reported as requiring a process restart.
    const diskBundle = runningBuild ? await fs.readFile(path.join(this.pluginRoot, "server/agent-cli.js"), "utf8").catch(() => null) : null;
    const needsRestart = runningBuild && diskBundle !== null ? !diskBundle.includes(JSON.stringify(runningBuild)) : installed?.version && runningVersion !== "development" ? installed.version !== runningVersion : null;
    const owned = processes.items.filter(p => p.scope === "same" && p.kind === "backend");
    const repairAllowed = !shared && ["stopped", "error"].includes(status.appServer?.state) && executable.needsRepair;
    const desktopCompatibility = await readDesktopCompatibility(this);
    return {
      checkedAt, staleAfterMs: STALE_MS, platform: this.platform,
      plugin: { installedVersion: installed?.version || null, runningVersion, needsRestart, pid: process.pid, startedAt: status.connector?.startedAt, root: this.pluginRoot },
      desktop: { version: desktopVersion, running: processes.state === "ok" ? processes.items.some(p => p.kind === "desktop" && p.scope === "same") : null },
      executable, processes, migration,
      backend: { mode: status.appServer?.connectionMode || config.codex.connectionMode || "managed", state: status.appServer?.state || "unknown", pid: status.appServer?.pid ?? null, ownsProcess: status.appServer?.ownsProcess ?? null, endpoint: status.appServer?.endpoint || null, error: clean(status.appServer?.lastError) },
      relay: { state: status.relay?.state || "unknown", lastHeartbeat: status.relay?.lastHeartbeat || null, reconnectAttempt: status.relay?.reconnectAttempt || 0 },
      sharing: {
        state: shared ? "unverified" : "not_enabled",
        label: shared ? backendReady ? "插件已接入共享后端，桌面共用待验证" : "共享后端尚未就绪" : "桌面共用未启用",
        message: shared ? "还需验证桌面连接与工具调用，才能确认两端共用成功。" : "插件使用独立后端；桌面占用的任务可能无法从 Flutter 继续发送。",
      },
      desktopTools: desktopCompatibility ? { ...desktopCompatibility, label: desktopCompatibility.state === "passed" ? "工具目录验收通过" : desktopCompatibility.state === "stale" ? "需要重新验收" : "兼容性验收未通过" } : { state: "unchecked", label: "当前连接未验证", message: lastToolFailure ? "上次迁移的桌面工具验收失败；可在迁移向导中重新验收。" : "可在迁移向导中运行真实桌面工具验收。" },
      paths: { configDir, codexHome: this.codexHome, sharedRoot: this.sharedRoot },
      actions: {
        repair: { enabled: Boolean(repairAllowed), candidate: executable.candidate?.path || null, reason: shared ? "共享模式由共享服务管理执行程序" : !executable.candidate ? "尚未找到可用程序，请先安装 Codex 或在高级设置中指定路径" : !executable.needsRepair ? "当前已使用验证过的完整路径，无需修复" : !repairAllowed ? "后端正在使用中，请在停止执行后通过高级设置修改路径" : "验证候选路径后保存；自动连接已开启时会尝试恢复连接" },
        migrate: { enabled: false, blockers: [
          ...(this.platform !== "darwin" ? ["自动迁移首版仅支持 macOS"] : []),
          ...(desktopCompatibility ? [desktopCompatibility.message] : lastToolFailure ? ["上次桌面工具兼容性验证失败，需要先解决"] : ["桌面工具兼容性尚未通过本机验证"]),
          ...(processes.state !== "ok" ? ["无法确认冲突进程"] : owned.length > 1 ? [`检测到 ${owned.length} 个执行后端，需要确认任务状态并处理占用`] : []),
          "可先通过迁移向导检查条件并生成准备包；正式切换尚未开放",
        ] },
      },
    };
  }

  async inspectMigration() {
    try {
      const [manifest, result, activation] = await Promise.all(["manifest.json", "migration-result.json", "activation.json"].map(file => json(path.join(this.sharedRoot, file))));
      return migrationView(manifest, result, activation, this.service.configStore.configDir, this.codexHome);
    } catch { return { state: "unreadable", label: "迁移记录无法读取", last: null }; }
  }

  async inspectProcesses() {
    if (this.platform === "win32") return { state: "unsupported", items: [], message: "当前平台暂不支持进程占用检查" };
    try {
      const { stdout } = await this.exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
      const items = await Promise.all(processConflicts(stdout).map(async item => {
        const line = stdout.split("\n").find(line => Number(line.trim().split(/\s+/)[0]) === item.pid) || "";
        const command = line.trim().replace(/^\d+\s+\d+\s+/, "");
        const appPath = item.kind === "desktop" ? command.match(/^(\/[^\n]+?\.app)\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:\s|$)/)?.[1] : null;
        const application = item.kind === "desktop" ? "Codex 桌面" : item.kind === "relay" ? "Relay 插件" : /\.vscode\//.test(line) ? "VS Code" : /\.plugin-appserver\//.test(line) ? "浏览器扩展" : "Codex 后端";
        // Environment contents stay in memory. Only compare directory selectors.
        const details = await this.exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="], { timeout: 2000, maxBuffer: 1024 * 1024 }).then(r => r.stdout, () => "");
        const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
        const selected = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`))?.[1];
        const defaultDir = path.join(os.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
        const target = item.kind === "relay" ? this.service.configStore.configDir : this.codexHome;
        return { ...item, application, ...(appPath ? { appPath } : {}), scope: !details ? "unknown" : samePath(selected || defaultDir, target) ? "same" : "other", taskState: "unknown" };
      }));
      return { state: "ok", items, message: "仅检查进程和数据目录，未判断任务是否正在执行；不会自动结束这些进程。" };
    } catch { return { state: "error", items: [], message: "进程检查失败，不能据此判断没有占用" }; }
  }

  async repairExecutable(expected = {}) {
    if (this.repairing) throw new RelayError("ENVIRONMENT_BUSY", "正在修复执行路径，请稍候");
    this.repairing = true;
    try {
      const current = await this.inspect(true);
      if (!current.actions.repair.enabled) throw new RelayError("REPAIR_NOT_AVAILABLE", current.actions.repair.reason);
      if (expected.configured !== current.executable.configured || expected.candidate !== current.actions.repair.candidate) throw new RelayError("ENVIRONMENT_CHANGED", "环境已变化，请重新检查后再修复");
      // Recheck just before changing configuration. Do not interrupt a running backend.
      const backend = this.service.appServer.status();
      if (!["stopped", "error"].includes(backend.state) || this.service.configStore.get().codex.executable !== expected.configured || this.service.configStore.get().codex.connectionMode === "shared") throw new RelayError("ENVIRONMENT_CHANGED", "后端或配置已变化，请重新检查");
      let connectionError = null;
      try { await this.service.updateConfig({ codex: { executable: current.actions.repair.candidate } }); }
      catch (error) {
        if (this.service.configStore.get().codex.executable !== current.actions.repair.candidate) throw error;
        connectionError = "路径已保存，但连接尚未恢复；请查看后端与 Relay 状态";
      }
      this.cache = null;
      return { saved: true, executable: current.actions.repair.candidate, connectionError, environment: await this.inspect(true) };
    } finally { this.repairing = false; }
  }
}
