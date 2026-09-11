import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { InstanceLock } from "./instance-lock.js";
import { RelayError } from "./errors.js";
import { readJson, writePrivate, checkCompatibility } from "./shared-backend-manager.js";
import { inspectPreparation, preparationFingerprint } from "./migration-preflight.js";
import { prepareSharedBackend } from "./shared-backend-prepare.js";
import { configuredSharedManifest, sharedInstallation } from "./shared-installation.js";
import { desktopTarget, readDesktopCompatibility, verifyDesktopCompatibility } from "./desktop-compatibility.js";
import { officialNode, verifyOfficialRuntime } from "./official-runtime.js";
import { repairSharedRuntime } from "./shared-runtime-repair.js";

const exec = promisify(execFile);
const ACTIVE = new Set(["queued", "checking", "packaging", "restarting"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const iso = () => new Date().toISOString();
const exists = file => fs.access(file).then(() => true, () => false);
const STARTUP_TOOL_STATES = new Set(["no_desktop", "no_pipe", "shared_unloaded", "shared_failed", "shared_timeout"]);

// Desktop creates its pipe before every task's MCP catalog is ready. A failed
// first read after restart is not final; retry only transient startup results.
export async function verifyDesktopAfterRepair(environment, { verify = verifyDesktopCompatibility, checkpoint = async () => {}, delay = () => new Promise(resolve => setTimeout(resolve, 500)), onProgress = async () => {} } = {}) {
  const deadline = Date.now() + 60_000;
  let proof;
  for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
    await checkpoint();
    proof = await verify(environment, { checkpoint, timeoutMs: Math.min(20_000, deadline - Date.now()) });
    if (proof.state === "passed" || !STARTUP_TOOL_STATES.has(proof.code) || attempt === 2) return proof;
    await onProgress("桌面已重新打开，工具目录仍在初始化，正在复查…");
    await delay();
  }
  return proof;
}
const identity = async pid => exec("/bin/ps", ["-p", String(pid), "-o", "lstart=,comm="], { timeout: 2000, maxBuffer: 4096 }).then(result => result.stdout.trim(), () => "");
const jobPath = (root, id) => {
  if (!UUID.test(id || "")) throw new RelayError("INVALID_JOB", "准备任务编号无效");
  return path.join(root, "jobs", `${id}.json`);
};
const publicJob = record => record ? Object.fromEntries(["id", "operation", "phase", "step", "createdAt", "updatedAt", "finishedAt", "report", "artifact", "error", "cancelRequested"].filter(key => record[key] !== undefined).map(key => [key, record[key]])) : null;

export class MigrationPreparation {
  constructor(environment, options = {}) {
    this.environment = environment;
    this.root = path.join(environment.service.configStore.configDir, "migration");
    this.compatibilityCache = null;
    this.launch = options.launch || (async (record) => {
      let node = process.execPath;
      if (["verify-desktop", "repair-runtime"].includes(record.operation)) {
        const app = (await configuredSharedManifest(environment))?.desktopApp || (await desktopTarget(environment))?.appPath;
        if (app) { await verifyOfficialRuntime(app); node = officialNode(app); }
      }
      const child = spawn(node, [path.join(environment.pluginRoot, "server/migration-cli.js"), "--config-dir", record.context.configDir, "--job-id", record.id], { detached: true, stdio: "ignore", env: { ...process.env, CODEX_RELAY_CONFIG_DIR: record.context.configDir } });
      await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
      child.unref();
    });
  }

  async latest() {
    const latest = await readJson(path.join(this.root, "latest.json"), null);
    if (!latest) return null;
    const record = await readJson(jobPath(this.root, latest.id), null);
    if (record && ACTIVE.has(record.phase)) {
      const elapsed = Date.now() - Date.parse(record.updatedAt);
      const ownerAlive = record.owner?.pid && record.owner.identity && await identity(record.owner.pid) === record.owner.identity;
      if ((!record.owner && elapsed > 10_000) || (record.owner && !ownerAlive)) {
        const destination = this.context(record.id).packageRoot;
        const prefix = `${path.basename(destination)}.preparing-`;
        const entries = await fs.readdir(path.dirname(destination)).catch(error => { if (error.code === "ENOENT") return []; throw error; });
        for (const name of entries.filter(name => name.startsWith(prefix) && /^[a-f0-9]{8}$/.test(name.slice(prefix.length)))) {
          await fs.rm(path.join(path.dirname(destination), name), { recursive: true, force: true });
        }
        record.phase = "interrupted";
        record.error = "准备进程已退出，可重新检查或生成；现有连接未被切换";
        record.updatedAt = record.finishedAt = iso();
        await writePrivate(jobPath(this.root, record.id), JSON.stringify(record));
      }
    }
    if (record) record.cancelRequested = ACTIVE.has(record.phase) && await exists(`${jobPath(this.root, record.id)}.cancel`);
    return record;
  }

  async status() {
    const record = await this.latest();
    const saved = await readJson(path.join(this.root, "prepared.json"), null);
    const installation = await sharedInstallation(this.environment);
    let prepared = null;
    if (saved) {
      const context = this.context(saved.id);
      // The artifact points only to a job-owned path, never one from an HTTP body.
      const present = await exists(path.join(context.packageRoot, "manifest.json"));
      const manifest = present ? await readJson(path.join(context.packageRoot, "manifest.json"), null).catch(() => null) : null;
      const current = present && await preparationFingerprint(context).then(value => value === saved.fingerprint, () => false)
        && manifest && await this.compatible(manifest);
      prepared = { ...saved.artifact, state: present ? current ? "prepared" : "stale" : "missing" };
    }
    if (installation) prepared = installation;
    const job = publicJob(record);
    // Old jobs remain available as history; they do not describe today's mode.
    if (job) job.historical = Boolean(installation && (!["verify-desktop", "repair-runtime"].includes(record.operation) || (record.report?.scope !== "current_shared_backend_tool_catalog" && !ACTIVE.has(job.phase))));
    if (["verify-desktop", "repair-runtime"].includes(job?.operation) && !job.historical && !ACTIVE.has(job.phase)) {
      const proof = await readDesktopCompatibility(this.environment);
      job.stale = !proof || proof.state === "stale" || proof.checkedAt !== job.report?.checkedAt;
    }
    return { job, prepared, installation };
  }

  async compatible(manifest) {
    const key = JSON.stringify([manifest.root, manifest.binary, manifest.binaryHash]);
    if (this.compatibilityCache?.key === key && Date.now() - this.compatibilityCache.time < 15_000) return this.compatibilityCache.value;
    const value = await checkCompatibility(manifest).then(() => true, () => false);
    this.compatibilityCache = { key, value, time: Date.now() };
    return value;
  }

  context(id) {
    if (!UUID.test(id || "")) throw new RelayError("INVALID_JOB", "准备任务编号无效");
    return { configDir: this.environment.service.configStore.configDir, pluginRoot: this.environment.pluginRoot, codexHome: this.environment.codexHome, sharedRoot: this.environment.sharedRoot, packageRoot: path.join(this.root, "packages", id.slice(0, 8)) };
  }

  async start(operation, requestId) {
    if (!["check", "prepare", "verify-desktop", "repair-runtime"].includes(operation) || !UUID.test(requestId || "")) throw new RelayError("INVALID_JOB", "准备任务参数无效");
    if (operation === "repair-runtime" && !(await configuredSharedManifest(this.environment))) throw new RelayError("INVALID_JOB", "当前没有可修复的共享安装");
    const lock = new InstanceLock(this.root, "submission.lock");
    try { await lock.acquire(); } catch { throw new RelayError("MIGRATION_BUSY", "已有准备请求正在提交，请稍后重试"); }
    try {
      const existing = await readJson(jobPath(this.root, requestId), null);
      if (existing) {
        if (existing.operation !== operation) throw new RelayError("INVALID_JOB", "该请求编号已用于其他操作");
        return publicJob(existing);
      }
      if (ACTIVE.has((await this.latest())?.phase)) throw new RelayError("MIGRATION_BUSY", "已有准备任务正在执行，请等待或取消后重试");
      const record = { id: requestId, operation, phase: "queued", step: "等待检查", createdAt: iso(), updatedAt: iso(), context: this.context(requestId) };
      await writePrivate(jobPath(this.root, requestId), JSON.stringify(record));
      await writePrivate(path.join(this.root, "latest.json"), JSON.stringify({ id: requestId }));
      try { await this.launch(record); }
      catch {
        record.phase = "failed"; record.error = "准备进程未能启动，请更新插件后重试"; record.updatedAt = record.finishedAt = iso();
        await writePrivate(jobPath(this.root, requestId), JSON.stringify(record));
      }
      return publicJob(record);
    } finally { await lock.release(); }
  }

  async cancel(id) {
    const record = await this.latest();
    if (!record || record.id !== id) throw new RelayError("INVALID_JOB", "准备任务已变化，请刷新状态");
    if (record.phase === "restarting") throw new RelayError("MIGRATION_BUSY", "已开始重启，请等待恢复和验证完成");
    if (ACTIVE.has(record.phase)) await writePrivate(`${jobPath(this.root, id)}.cancel`, "cancel\n");
    return { ...publicJob(record), cancelRequested: ACTIVE.has(record.phase) };
  }
}

export async function runPreparationJob(configDir, id, { createEnvironment, inspect = inspectPreparation, prepare = prepareSharedBackend, fingerprint = preparationFingerprint, verify = checkCompatibility, verifyDesktop = verifyDesktopCompatibility, repairRuntime = repairSharedRuntime } = {}) {
  const root = path.join(configDir, "migration");
  const file = jobPath(root, id);
  const lock = new InstanceLock(root, "worker.lock");
  await lock.acquire();
  let record;
  let timer;
  let writes = Promise.resolve();
  const save = () => {
    record.updatedAt = iso();
    const text = JSON.stringify(record);
    writes = writes.then(() => writePrivate(file, text));
    return writes;
  };
  const checkpoint = async () => {
    if (await exists(`${file}.cancel`)) throw new RelayError("PREPARATION_CANCELLED", "已取消准备，当前连接保持不变");
  };
  try {
    record = await readJson(file);
    if (record.phase !== "queued" || record.context.configDir !== configDir) { record = null; return; }
    record.owner = { pid: process.pid, identity: await identity(process.pid) };
    record.phase = "checking"; record.step = "检查迁移条件";
    await save();
    timer = setInterval(() => { void save().catch(() => {}); }, 2000);
    await checkpoint();
    const environment = await createEnvironment(record.context);
    if (record.operation === "repair-runtime") {
      await repairRuntime(environment, { checkpoint, onProgress: async (step, progress) => { record.step = step; if (progress?.committing) record.phase = "restarting"; await save(); } });
      record.step = "共享服务已重启，等待桌面工具连接";
      await save();
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const target = await desktopTarget(environment);
        if (target?.pipe && target.serviceRuntime === "official") break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (["verify-desktop", "repair-runtime"].includes(record.operation)) {
      record.step = "验证官方运行时签名与真实桌面工具目录";
      await save();
      const proof = record.operation === "repair-runtime"
        ? await verifyDesktopAfterRepair(environment, { verify: verifyDesktop, checkpoint, onProgress: async step => { record.step = step; await save(); } })
        : await verifyDesktop(environment, { checkpoint });
      await checkpoint();
      record.report = { scope: proof.scope, code: proof.code, checkedAt: proof.checkedAt, readyToPrepare: false, readyToActivate: false, checks: [
        { id: "signature", title: "官方运行时签名", state: proof.runtime?.verified ? "passed" : proof.code === "invalid_signature" ? "blocked" : "unchecked", detail: proof.runtime?.verified ? "官方运行时签名有效" : proof.code === "invalid_signature" ? "运行时签名验证失败，请检查官方安装" : "尚未执行签名检查，不代表签名无效", scope: "diagnostic" },
        { id: "desktop_tools", title: "真实桌面工具目录", state: proof.state, detail: proof.message, scope: "diagnostic" },
      ] };
      record.phase = proof.state === "passed" ? "complete" : "blocked";
      record.step = proof.state === "passed" ? "工具目录检查通过；具体工具调用需在任务中验证" : "桌面工具检查存在待处理项；不代表消息执行失败";
      return;
    }
    const result = await inspect(record.context, { environment, checkpoint, onProgress: async report => { record.report = report; record.step = report.checks.at(-1)?.title || record.step; await save(); } });
    record.report = result.report;
    await checkpoint();
    if (!result.report.readyToPrepare) {
      record.phase = "blocked"; record.step = "请先解决准备条件";
    } else if (record.operation === "check") {
      record.phase = "complete"; record.step = "检查完成，仍有正式切换阻塞";
    } else {
      if (!result.manifest || !result.fingerprint) throw new Error("Preparation inputs missing");
      record.phase = "packaging"; record.step = "生成迁移准备包";
      await save();
      await fs.mkdir(path.dirname(record.context.packageRoot), { recursive: true, mode: 0o700 });
      const assertUnchanged = async () => {
        await checkpoint();
        if (await fingerprint(record.context) !== result.fingerprint) throw new RelayError("PREPARATION_CHANGED", "准备期间配置或插件已变化，请重新检查");
      };
      await assertUnchanged();
      record.artifact = await prepare(result.manifest, record.context.pluginRoot, { checkpoint, verify: async manifest => { await assertUnchanged(); await verify(manifest); } });
      // Publication is the commit point. Cancellation received afterwards
      // cannot turn a complete package into a partially deleted directory.
      await writePrivate(path.join(root, "prepared.json"), JSON.stringify({ id, fingerprint: result.fingerprint, artifact: record.artifact }));
      record.phase = "complete"; record.step = "准备包已生成，尚未切换";
    }
  } catch (error) {
    if (!record) throw error;
    record.phase = error.code === "PREPARATION_CANCELLED" ? "cancelled" : "failed";
    record.error = ["PREPARATION_CANCELLED", "PREPARATION_CHANGED"].includes(error.code) ? error.message : record.operation === "repair-runtime" ? "共享运行时修复未完成，请检查当前服务状态后重试；现有历史和连接配置已保留" : "迁移准备失败，可重新检查后重试；当前连接未被切换";
    record.step = record.phase === "cancelled" ? "准备已取消" : "准备未完成";
  } finally {
    clearInterval(timer);
    try { if (record) { record.finishedAt = iso(); await save(); } }
    finally { await lock.release(); }
  }
}

export { ACTIVE as ACTIVE_PREPARATION_PHASES };
