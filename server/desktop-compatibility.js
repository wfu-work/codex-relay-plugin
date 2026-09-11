import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AppServerClient } from "./app-server-client.js";
import { desktopToolDefinition, tomlValue, writePrivate, ownedRuntime } from "./shared-backend-manager.js";

import { configuredSharedManifest } from "./shared-installation.js";
import { officialNode, verifyOfficialRuntime } from "./official-runtime.js";
export { verifyOfficialRuntime } from "./official-runtime.js";

const exec = promisify(execFile);
const TTL = 10 * 60_000;
const REQUIRED = ["list_threads", "open_in_codex", "send_message_to_thread"];
const quiet = { info() {}, warn() {}, error() {} };
const messages = {
  passed: "隔离共享后端已加载真实桌面工具目录；正式切换与工具调用仍需单独验收",
  no_desktop: "未找到使用当前数据目录的唯一桌面实例，请正常打开 Codex 后重试",
  no_pipe: "桌面没有提供可验证的工具连接，请等待桌面启动完成后重试",
  invalid_signature: "官方运行时签名验证未通过，请检查或重新安装 Codex",
  handshake_failed: "官方运行时签名有效，但隔离共享后端无法加载桌面工具；当前外部启动方式不兼容",
  incomplete_catalog: "工具握手完成，但缺少所需桌面工具；不能据此启用共享模式",
  timeout: "桌面工具验收超时，可在桌面空闲时重试",
  changed: "验收期间桌面进程或安装文件发生变化，请重新验证",
  unsupported: "当前平台暂不支持这项桌面兼容性验收",
  failed: "无法完成桌面工具验收，请重新检查本机安装与桌面状态",
  shared_passed: "当前共享后端已返回桌面工具目录；具体工具调用需在任务中验证",
  shared_timeout: "当前共享后端的桌面工具查询超时；消息执行可用不代表浏览器等桌面工具已恢复",
  shared_failed: "当前共享后端未能加载桌面工具目录，请检查桌面工具连接",
  shared_unloaded: "当前共享后端没有已加载任务，暂无法检查任务中的桌面工具目录",
  shared_runtime_restart_required: "共享服务仍由系统 Node 启动，桌面工具的父进程签名链不符合要求。请修复共享服务运行时；退出桌面后将自动重启并验证，无需重新迁移。",
};

export async function desktopTarget(environment) {
  const processes = await environment.inspectProcesses();
  const desktops = processes.items.filter(p => p.kind === "desktop" && p.scope === "same");
  if (processes.state !== "ok" || desktops.length !== 1 || !desktops[0].appPath) return null;
  const desktop = desktops[0];
  const manifest = await configuredSharedManifest(environment);
  const run = environment.exec || exec;
  const { stdout } = await run("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
  const backends = stdout.split("\n").flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m || Number(m[2]) !== desktop.pid) return [];
    const direct = m[3].startsWith(`${desktop.appPath}/Contents/Resources/codex `);
    const proxy = manifest?.desktopApp === desktop.appPath &&
      m[3].includes(`${path.join(manifest.root, "shared-backend-cli.js")} proxy --manifest ${path.join(manifest.root, "manifest.json")} `);
    if (!direct && !proxy) return [];
    // Read only the pipe selector supplied to this desktop's backend. Raw
    // launch arguments may contain credentials and never leave this method.
    const pipe = m[3].match(/"CODEX_APP_TOOLS_PIPE_PATH"\s*=\s*"([^"\r\n]+)"/)?.[1];
    return pipe && path.isAbsolute(pipe) ? [{ pipe, backendPid: Number(m[1]), connection: proxy ? "shared_proxy" : "direct" }] : [];
  });
  const target = { ...desktop, ...(backends.length === 1 ? backends[0] : { pipe: null }) };
  const stat = target.pipe ? await fs.stat(target.pipe).catch(() => null) : null;
  if (!stat?.isSocket() || stat.uid !== process.getuid()) target.pipe = null;
  const runtime = manifest ? await ownedRuntime(manifest) : null;
  if (manifest) {
    target.endpoint = manifest.endpoint; target.runtimeIdentity = runtime?.identity || null;
    const backend = stdout.split("\n").map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).find(m => m && Number(m[1]) === runtime?.pid);
    const service = backend && stdout.split("\n").map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).find(m => m && m[1] === backend[2]);
    if (service?.[3].includes(`${path.join(manifest.root, "shared-backend-cli.js")} service --manifest ${path.join(manifest.root, "manifest.json")}`)) {
      target.servicePid = Number(service[1]);
      const command = (await run("/bin/ps", ["-p", service[1], "-o", "comm="], { timeout: 2000 })).stdout.trim();
      const resolved = await fs.realpath(command).catch(() => null);
      target.serviceRuntime = resolved && resolved === await fs.realpath(officialNode(manifest.desktopApp)).catch(() => null) ? "official" : "legacy";
    }
  }
  const identity = (await run("/bin/ps", ["-p", String(desktop.pid), "-o", "lstart=,comm="], { timeout: 2000 })).stdout.trim();
  const resources = path.join(desktop.appPath, "Contents/Resources");
  const hash = createHash("sha256").update(JSON.stringify([identity, target.pipe, target.backendPid, target.endpoint, target.runtimeIdentity, target.servicePid, target.serviceRuntime, environment.codexHome]));
  for (const file of ["codex", "cua_node/bin/node", "plugins/openai-bundled/plugins/codex-app-tools/server.mjs", "plugins/openai-bundled/plugins/codex-app-tools/desktop-mcp.json"]) {
    const s = await fs.stat(path.join(resources, file));
    hash.update(JSON.stringify([file, s.ino, s.size, s.mtimeMs, s.ctimeMs]));
  }
  target.fingerprint = hash.digest("hex");
  return target;
}

export async function probeDesktopTools(target, { checkpoint = async () => {}, timeoutMs = 15_000 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relay-desktop-check-"));
  const home = path.join(root, "home");
  await fs.mkdir(home, { mode: 0o700 });
  const manifest = { root, desktopApp: target.appPath };
  const endpoint = `unix://${path.join(root, "rpc.sock")}`;
  const deadline = Date.now() + timeoutMs;
  let child, client, killTimer;
  try {
    const tools = await desktopToolDefinition(manifest);
    tools.env.CODEX_APP_TOOLS_PIPE_PATH = target.pipe;
    // Fixed official runtime/pipe values must not be shadowed by inherited
    // environment variables. The desktop peer authorization remains enabled.
    tools.env_vars = tools.env_vars?.filter(key => !Object.hasOwn(tools.env, key));
    const env = { ...process.env, CODEX_HOME: home, RUST_LOG: "error" };
    for (const key of ["CODEX_CLI_PATH", "CODEX_APP_SERVER_WS_URL", "CODEX_APP_SERVER_FORCE_CLI", "ELECTRON_RUN_AS_NODE"]) delete env[key];
    child = spawn(path.join(target.appPath, "Contents/Resources/codex"), ["-c", "features.code_mode_host=true", "-c", `mcp_servers.codex_app=${tomlValue(tools)}`, "app-server", "--listen", endpoint], { env, cwd: home, stdio: "ignore" });
    let spawnError;
    child.once("error", error => { spawnError = error; });
    // Ensure a stuck protocol request cannot leave the temporary backend alive.
    killTimer = setTimeout(() => child.kill("SIGTERM"), timeoutMs + 1000);
    while (!(await fs.stat(path.join(root, "rpc.sock")).then(s => s.isSocket(), () => false))) {
      await checkpoint();
      if (spawnError || child.exitCode !== null || child.signalCode !== null) return { code: "failed" };
      if (Date.now() > deadline) return { code: "timeout" };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    client = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: endpoint, defaultWorkingDirectory: home } }) }, quiet);
    await client.start();
    const { thread } = await client.createThread({ cwd: home, approvalPolicy: "never", sandbox: "read-only" });
    while (Date.now() < deadline) {
      await checkpoint();
      const result = await client.request("mcpServerStatus/list", { threadId: thread.id, detail: "toolsAndAuthOnly" }, Math.max(100, Math.min(5000, deadline - Date.now())));
      const server = result.data?.find(server => server.name === "codex_app");
      if (server?.runtimeStatus === "failed") return { code: "handshake_failed" };
      const names = Object.keys(server?.tools || {});
      if (names.length) return { code: REQUIRED.every(name => names.includes(name)) ? "passed" : "incomplete_catalog", toolCount: names.length };
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return { code: "timeout" };
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    return { code: Date.now() >= deadline ? "timeout" : "failed" };
  } finally {
    clearTimeout(killTimer);
    await client?.stop().catch(() => {});
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { const timer = setTimeout(() => child.kill("SIGKILL"), 2000); child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM"); });
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

// Read a loaded task's MCP status on the already running service. Do not
// create a task, acquire a writer, reload MCP, or start an isolated backend.
export async function probeSharedDesktopTools(target, { checkpoint = async () => {}, timeoutMs = 20_000, createClient } = {}) {
  if (target.serviceRuntime === "legacy") return { code: "shared_runtime_restart_required" };
  if (!target.endpoint || !target.runtimeIdentity) return { code: "shared_failed" };
  const client = createClient ? createClient() : new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: target.endpoint } }) }, quiet, { initializeTimeoutMs: 3000 });
  const deadline = Date.now() + timeoutMs;
  const request = (method, params) => client.request(method, params, Math.max(100, deadline - Date.now()));
  try {
    await checkpoint();
    await client.start();
    const loaded = await request("thread/loaded/list", { limit: 1 });
    const threadId = loaded.data?.[0];
    if (typeof threadId !== "string") return { code: "shared_unloaded" };
    await checkpoint();
    let cursor, server;
    const cursors = new Set();
    do {
      await checkpoint();
      if (Date.now() >= deadline) return { code: "shared_timeout" };
      const response = await request("mcpServerStatus/list", { threadId, detail: "toolsAndAuthOnly", limit: 100, ...(cursor ? { cursor } : {}) });
      server = response.data?.find(item => item.name === "codex_app");
      cursor = response.nextCursor;
      if (cursor && cursors.has(cursor)) return { code: "shared_failed" };
      cursors.add(cursor);
    } while (!server && cursor);
    const names = Object.keys(server?.tools || {});
    return { code: server?.runtimeStatus === "failed" ? "shared_failed" : REQUIRED.every(name => names.includes(name)) ? "shared_passed" : "incomplete_catalog", toolCount: names.length };
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    return { code: error.code === "APP_SERVER_TIMEOUT" || Date.now() >= deadline ? "shared_timeout" : "shared_failed" };
  } finally { await client.stop().catch(() => {}); }
}

export async function verifyDesktopCompatibility(environment, options = {}) {
  const discover = options.discover || desktopTarget;
  const checkedAt = new Date().toISOString();
  let target, runtime = null, code = "failed", toolCount = 0;
  try {
    if ((options.platform || process.platform) !== "darwin") code = "unsupported";
    else {
      target = await discover(environment);
      if (!target) code = "no_desktop";
      else {
        try { runtime = await (options.verifyRuntime || verifyOfficialRuntime)(target.appPath); }
        catch { code = "invalid_signature"; }
        if (runtime) {
          if (!target.pipe) code = "no_pipe";
          else {
            const shared = environment.service.configStore.get?.().codex?.connectionMode === "shared";
            const probe = options.probe || (shared ? probeSharedDesktopTools : probeDesktopTools);
            const result = await probe(target, options);
            code = Object.hasOwn(messages, result.code) ? result.code : "failed";
            toolCount = Number.isSafeInteger(result.toolCount) ? result.toolCount : 0;
          }
          if ((await discover(environment))?.fingerprint !== target.fingerprint) code = "changed";
        }
      }
    }
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    code = "failed";
  }
  const result = { checkedAt, expiresAt: new Date(Date.now() + TTL).toISOString(), code, state: ["passed", "shared_passed"].includes(code) ? "passed" : "blocked", message: messages[code], runtime, toolCount, desktopPid: target?.pid || null, fingerprint: target?.fingerprint || null, scope: environment.service.configStore.get?.().codex?.connectionMode === "shared" ? "current_shared_backend_tool_catalog" : "isolated_shared_backend_tool_catalog", modelRequests: 0 };
  await writePrivate(path.join(environment.service.configStore.configDir, "migration/desktop-compatibility.json"), JSON.stringify(result));
  return result;
}

export async function readDesktopCompatibility(environment, { discover = desktopTarget, now = Date.now() } = {}) {
  try {
    const file = path.join(environment.service.configStore.configDir, "migration/desktop-compatibility.json");
    if ((await fs.stat(file)).size > 32 * 1024) return null;
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Object.hasOwn(messages, saved.code) || !Number.isFinite(Date.parse(saved.checkedAt)) || !Number.isFinite(Date.parse(saved.expiresAt))) return null;
    const target = await discover(environment);
    const stale = now > Date.parse(saved.expiresAt) || !saved.fingerprint || saved.fingerprint !== target?.fingerprint;
    // Explicit fields only; never return process arguments or raw MCP output.
    return { checkedAt: saved.checkedAt, code: saved.code, state: stale ? "stale" : ["passed", "shared_passed"].includes(saved.code) ? "passed" : "blocked", message: stale ? "桌面进程、安装版本已变化或验收已过期，请重新验证" : messages[saved.code], signatureVerified: saved.runtime?.verified === true, signatureState: saved.runtime?.verified === true ? "passed" : saved.code === "invalid_signature" ? "blocked" : "unchecked", scope: saved.scope, toolCount: saved.toolCount || 0, desktopPid: saved.desktopPid || null };
  } catch { return null; }
}
