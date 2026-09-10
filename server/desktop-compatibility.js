import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AppServerClient } from "./app-server-client.js";
import { desktopToolDefinition, tomlValue, writePrivate } from "./shared-backend-manager.js";

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
};

export async function desktopTarget(environment) {
  const processes = await environment.inspectProcesses();
  const desktops = processes.items.filter(p => p.kind === "desktop" && p.scope === "same");
  if (processes.state !== "ok" || desktops.length !== 1 || !desktops[0].appPath) return null;
  const desktop = desktops[0];
  const { stdout } = await exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
  const backends = stdout.split("\n").flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m || Number(m[2]) !== desktop.pid || !m[3].startsWith(`${desktop.appPath}/Contents/Resources/codex `)) return [];
    // Read only the pipe selector supplied to this desktop's backend. Raw
    // launch arguments may contain credentials and never leave this method.
    const pipe = m[3].match(/"CODEX_APP_TOOLS_PIPE_PATH"\s*=\s*"([^"\r\n]+)"/)?.[1];
    return pipe && path.isAbsolute(pipe) ? [{ pipe, backendPid: Number(m[1]) }] : [];
  });
  if (backends.length !== 1) return { ...desktop, pipe: null };
  const target = { ...desktop, ...backends[0] };
  const stat = await fs.stat(target.pipe).catch(() => null);
  if (!stat?.isSocket() || stat.uid !== process.getuid()) return { ...target, pipe: null };
  const identity = (await exec("/bin/ps", ["-p", String(desktop.pid), "-o", "lstart=,comm="], { timeout: 2000 })).stdout.trim();
  const resources = path.join(desktop.appPath, "Contents/Resources");
  const hash = createHash("sha256").update(JSON.stringify([identity, target.pipe, environment.codexHome]));
  for (const file of ["codex", "cua_node/bin/node", "plugins/openai-bundled/plugins/codex-app-tools/server.mjs", "plugins/openai-bundled/plugins/codex-app-tools/desktop-mcp.json"]) {
    const s = await fs.stat(path.join(resources, file));
    hash.update(JSON.stringify([file, s.ino, s.size, s.mtimeMs, s.ctimeMs]));
  }
  target.fingerprint = hash.digest("hex");
  return target;
}

export async function verifyOfficialRuntime(app) {
  const runtime = path.join(app, "Contents/Resources/cua_node/bin/node");
  await exec("/usr/bin/codesign", ["--verify", "--strict", runtime], { timeout: 5000, maxBuffer: 4096 });
  const result = await exec("/usr/bin/codesign", ["-dv", "--verbose=2", runtime], { timeout: 5000, maxBuffer: 4096 });
  if (!/^TeamIdentifier=2DC432GLL2$/m.test(result.stderr) || !/^Identifier=node$/m.test(result.stderr)) throw new Error("Unexpected runtime signing identity");
  return { verified: true, teamId: "2DC432GLL2", identifier: "node" };
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
      const result = await client.request("mcpServerStatus/list", { threadId: thread.id }, Math.max(100, Math.min(5000, deadline - Date.now())));
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

export async function verifyDesktopCompatibility(environment, options = {}) {
  const discover = options.discover || desktopTarget;
  const checkedAt = new Date().toISOString();
  let target, runtime = null, code = "failed", toolCount = 0;
  try {
    if ((options.platform || process.platform) !== "darwin") code = "unsupported";
    else {
      target = await discover(environment);
      if (!target) code = "no_desktop";
      else if (!target.pipe) code = "no_pipe";
      else {
        try { runtime = await (options.verifyRuntime || verifyOfficialRuntime)(target.appPath); }
        catch { code = "invalid_signature"; }
        if (runtime) {
          const result = await (options.probe || probeDesktopTools)(target, options);
          code = Object.hasOwn(messages, result.code) ? result.code : "failed";
          toolCount = Number.isSafeInteger(result.toolCount) ? result.toolCount : 0;
          if ((await discover(environment))?.fingerprint !== target.fingerprint) code = "changed";
        }
      }
    }
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    code = "failed";
  }
  const result = { checkedAt, expiresAt: new Date(Date.now() + TTL).toISOString(), code, state: code === "passed" ? "passed" : "blocked", message: messages[code], runtime, toolCount, desktopPid: target?.pid || null, fingerprint: target?.fingerprint || null, scope: "isolated_shared_backend_tool_catalog", modelRequests: 0 };
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
    return { checkedAt: saved.checkedAt, code: saved.code, state: stale ? "stale" : saved.code === "passed" ? "passed" : "blocked", message: stale ? "桌面进程、安装版本已变化或验收已过期，请重新验证" : messages[saved.code], signatureVerified: saved.runtime?.verified === true, toolCount: saved.toolCount || 0, desktopPid: saved.desktopPid || null };
  } catch { return null; }
}
