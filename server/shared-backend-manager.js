import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { InstanceLock } from "./instance-lock.js";
import { SharedAppServerTransport } from "./app-server-transport.js";
import { DESKTOP_PIPE_KEY } from "./desktop-proxy.js";

const exec = promisify(execFile);
const ENV_KEYS = ["CODEX_CLI_PATH", "CODEX_APP_SERVER_FORCE_CLI", "CODEX_APP_SERVER_WS_URL", "CODEX_HOME"];
export const COMPATIBILITY = { desktopVersion: "26.901.51231", cliVersion: "codex-cli 0.153.4" };
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const escapeXml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function plist(value) {
  const encode = item => Array.isArray(item) ? `<array>${item.map(encode).join("")}</array>`
    : typeof item === "object" ? `<dict>${Object.entries(item).map(([key, val]) => `<key>${escapeXml(key)}</key>${encode(val)}`).join("")}</dict>`
      : typeof item === "boolean" ? `<${item}/>` : typeof item === "number" ? `<integer>${item}</integer>` : `<string>${escapeXml(item)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${encode(value)}</plist>\n`;
}
export async function writePrivate(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, value, { mode: 0o600 });
  await fs.rename(temporary, file);
}
export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}
export const digest = async file => createHash("sha256").update(await fs.readFile(file)).digest("hex");
export async function checkCompatibility(manifest) {
  const [{ stdout: desktop }, { stdout: cli }, binaryHash] = await Promise.all([
    exec("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(manifest.desktopApp, "Contents/Info.plist")], { timeout: 5000, maxBuffer: 4096 }),
    exec(manifest.binary, ["--version"], { timeout: 5000, maxBuffer: 4096 }), digest(manifest.binary),
  ]);
  if (desktop.trim() !== manifest.desktopVersion || cli.trim() !== manifest.cliVersion || binaryHash !== manifest.binaryHash) {
    throw new Error("桌面或 CLI 已更新，共享启动已暂停；请重新验证兼容版本后生成启动包");
  }
}
export function processConflicts(output, allowedPids = []) {
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
export async function assertStopped(allowedPids = [], manifest, kinds = ["desktop", "backend", "relay"]) {
  const { stdout } = await exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { maxBuffer: 8 * 1024 * 1024 });
  const candidates = processConflicts(stdout, allowedPids).filter(item => kinds.includes(item.kind));
  const conflicts = [];
  for (const item of candidates) {
    if (manifest) {
      // Inspect only the home/config selector, never print process environments.
      const { stdout: details } = await exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="]).catch(() => ({ stdout: "" }));
      if (!details) continue;
      const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
      const match = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`));
      const home = match?.[1] || path.join(os.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
      const target = item.kind === "relay" ? path.dirname(manifest.relayConfig) : manifest.codexHome;
      if (path.resolve(home) !== path.resolve(target)) continue;
    }
    conflicts.push(item);
  }
  if (conflicts.length) throw new Error(`请先退出桌面并停止旧 Relay/后端，再执行切换。仍在运行：${conflicts.map(x => `${x.kind} PID ${x.pid}`).join("、")}`);
}
async function identity(pid) {
  try { return (await exec("/bin/ps", ["-p", String(pid), "-o", "lstart=,comm="])).stdout.trim(); }
  catch { return ""; }
}
export async function ownedRuntime(manifest) {
  const runtime = await readJson(path.join(manifest.root, "runtime.json"), null);
  if (!runtime || runtime.endpoint !== manifest.endpoint || !runtime.pid || !runtime.identity) return null;
  return await identity(runtime.pid) === runtime.identity ? runtime : null;
}
export async function probeEndpoint(endpoint) {
  const connection = new SharedAppServerTransport(endpoint, { connectTimeoutMs: 1000 });
  connection.on("closed", () => {});
  try { await connection.open(); return true; } catch { return false; } finally { await connection.close(); }
}
export async function backendStatus(manifest) {
  const runtime = await ownedRuntime(manifest);
  return { ready: Boolean(runtime && await probeEndpoint(manifest.endpoint)), pid: runtime?.pid ?? null, endpoint: manifest.endpoint, codexHome: manifest.codexHome };
}
export async function waitReady(manifest, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const status = await backendStatus(manifest);
    if (status.ready) return status;
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < deadline);
  throw new Error("共享后端未就绪；已停止启动桌面，避免创建另一个执行后端");
}
export function expectedEnvironment(manifest) {
  return { CODEX_CLI_PATH: path.join(manifest.root, "codex-proxy"), CODEX_APP_SERVER_FORCE_CLI: "1", CODEX_APP_SERVER_WS_URL: "", CODEX_HOME: manifest.codexHome };
}
async function environment() {
  return Object.fromEntries(await Promise.all(ENV_KEYS.map(async key => {
    const result = await exec("/bin/launchctl", ["getenv", key]).catch(() => ({ stdout: "" }));
    return [key, result.stdout.replace(/\n$/, "")];
  })));
}
async function setEnvironment(values) {
  for (const [key, value] of Object.entries(values)) await exec("/bin/launchctl", value ? ["setenv", key, value] : ["unsetenv", key]);
}
export function serviceDefinition(manifest) {
  return {
    Label: manifest.label,
    ProgramArguments: [manifest.node, path.join(manifest.root, "shared-backend-cli.js"), "service", "--manifest", path.join(manifest.root, "manifest.json")],
    RunAtLoad: true, KeepAlive: { SuccessfulExit: false }, ThrottleInterval: 15,
    ProcessType: "Interactive", Umask: 63,
    StandardOutPath: path.join(manifest.root, "service.log"), StandardErrorPath: path.join(manifest.root, "service.log"),
  };
}
export async function runService(manifest) {
  const lock = new InstanceLock(manifest.root, "service.lock");
  await lock.acquire();
  let child;
  let stopping = false;
  let timer;
  const stop = () => {
    stopping = true;
    if (child?.pid) { child.kill("SIGTERM"); timer ??= setTimeout(() => child.kill("SIGKILL"), 5000); }
  };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  try {
    await checkCompatibility(manifest);
    await assertStopped([], manifest, ["backend"]);
    if (await probeEndpoint(manifest.endpoint)) throw new Error("共享 Socket 已被占用，拒绝接管未知后端");
    // A stale socket can remain after a crash. Only unlink our own socket entry.
    const socketPath = manifest.endpoint.slice(7);
    const stat = await fs.lstat(socketPath).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat) {
      if (!stat.isSocket()) throw new Error("Socket 路径被普通文件占用");
      await fs.unlink(socketPath);
    }
    if (manifest.originalIcon) await setEnvironment(expectedEnvironment(manifest));
    if (stopping) return;
    // LaunchAgents lack the interactive shell environment Desktop normally
    // imports. Load it in memory so provider/MCP env vars survive the switch.
    // Do not write this environment to the manifest, diagnostics, or logs.
    const shellEnv = await readLoginEnvironment(manifest.shell);
    const env = { ...process.env, ...shellEnv, CODEX_HOME: manifest.codexHome, PATH: shellEnv.PATH || manifest.path, RUST_LOG: "error" };
    for (const key of [...ENV_KEYS.filter(key => key !== "CODEX_HOME"), "ELECTRON_RUN_AS_NODE"]) delete env[key];
    const tools = await desktopToolDefinition(manifest);
    child = spawn(manifest.binary, ["-c", "features.code_mode_host=true", "-c", `mcp_servers.codex_app=${tomlValue(tools)}`, "app-server", "--analytics-default-enabled", "--listen", manifest.endpoint], { cwd: manifest.codexHome, env, stdio: "ignore" });
    const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
    // Attach rejection handling immediately; a failed spawn must release the lock.
    exited.catch(() => {});
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    await writePrivate(path.join(manifest.root, "runtime.json"), JSON.stringify({ pid: child.pid, identity: await identity(child.pid), endpoint: manifest.endpoint }));
    const result = await exited;
    if (!stopping) throw new Error(`共享后端退出 (${result.code ?? result.signal})`);
  } finally {
    clearTimeout(timer);
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.once("exit", () => { clearTimeout(killTimer); resolve(); }); child.kill("SIGTERM");
      });
    }
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    await fs.rm(path.join(manifest.root, "runtime.json"), { force: true });
    await lock.release();
  }
}

export async function backupData(manifest, target) {
  await fs.mkdir(target, { recursive: false, mode: 0o700 });
  // Caches and binaries are reproducible. Preserve user history, settings,
  // credentials and databases; never overwrite these when rolling back mode.
  const entries = await fs.readdir(manifest.codexHome);
  const selected = entries.filter(name => ["sessions", "archived_sessions", "history.jsonl", "auth.json", "sqlite", "memories", "automations", "skills", "AGENTS.md", ".codex-global-state.json", ".codex-global-state.json.backup"].includes(name) || /\.toml$|\.(?:sqlite|db)(?:-wal|-shm)?$/.test(name));
  for (const name of selected) await fs.cp(path.join(manifest.codexHome, name), path.join(target, "codex", name), { recursive: true, mode: constants.COPYFILE_FICLONE, preserveTimestamps: true });
  await fs.cp(manifest.relayConfig, path.join(target, "relay-config.json"), { mode: constants.COPYFILE_FICLONE });
  if (manifest.desktopProfile) await fs.cp(manifest.desktopProfile, path.join(target, "desktop-profile"), { recursive: true, mode: constants.COPYFILE_FICLONE, preserveTimestamps: true, filter: source => !["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache"].includes(path.basename(source)) });
  await writePrivate(path.join(target, "inventory.json"), JSON.stringify({ createdAt: new Date().toISOString(), codexHome: manifest.codexHome, files: selected }, null, 2));
}
export function patchRelay(config, endpoint) {
  return { ...config, codex: { ...config.codex, connectionMode: "shared", appServerEndpoint: endpoint } };
}
export function restoreRelay(config, previousCodex) {
  const codex = { ...config.codex };
  for (const key of ["connectionMode", "appServerEndpoint"]) {
    if (Object.hasOwn(previousCodex, key)) codex[key] = previousCodex[key]; else delete codex[key];
  }
  return { ...config, codex };
}
async function bootout(manifest) {
  const target = `gui/${process.getuid()}/${manifest.label}`;
  const exists = await exec("/bin/launchctl", ["print", target]).then(() => true, () => false);
  if (exists) await exec("/bin/launchctl", ["bootout", target]);
  const deadline = Date.now() + 8000;
  while (await ownedRuntime(manifest)) {
    if (Date.now() > deadline) throw new Error("共享进程尚未停止，暂不恢复独立后端配置");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
export async function activate(manifest) {
  if (manifest.activationBlocked) throw new Error("此准备包尚未通过桌面工具兼容性验证，不能启用共享后端。请先解决控制台中的切换阻塞");
  const activationFile = path.join(manifest.root, "activation.json");
  if (await readJson(activationFile, null)) throw new Error("已有切换记录；请先检查状态或执行 rollback");
  await checkCompatibility(manifest);
  await assertStopped([], manifest);
  const config = await readJson(manifest.relayConfig);
  if (!config.codex) throw new Error("未找到现有 Relay 配置，拒绝覆盖为默认配置");
  const agentBundle = await fs.readFile(path.join(manifest.root, "plugin/server/agent-cli.js"), "utf8");
  if (!agentBundle.includes("appServerEndpoint") || !agentBundle.includes("SharedAppServerTransport")) throw new Error("已安装 Relay 尚不支持共享后端，请先更新插件");
  const priorPlist = await fs.readFile(manifest.launchAgent).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
  if (priorPlist) throw new Error("LaunchAgent 文件已存在，拒绝覆盖；请先检查已有安装");
  const backup = path.join(manifest.root, "backups", new Date().toISOString().replaceAll(":", "-"));
  await fs.mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
  await backupData(manifest, backup);
  await fs.cp(manifest.pluginRoot, path.join(backup, "plugin"), { recursive: true, mode: constants.COPYFILE_FICLONE });
  const record = { backup, previousCodex: config.codex, environment: await environment(), phase: "prepared", previousAgentHash: await digest(manifest.relayAgent), installedAgentHash: await digest(path.join(manifest.root, "plugin/server/agent-cli.js")) };
  await writePrivate(activationFile, JSON.stringify(record));
  try {
    // Recheck after backup, before changing runtime configuration.
    await assertStopped([], manifest);
    await replacePlugin(manifest, path.join(manifest.root, "plugin"));
    const currentConfig = await readJson(manifest.relayConfig);
    if (JSON.stringify(currentConfig.codex) !== JSON.stringify(config.codex)) throw new Error("切换期间后端配置发生变化，请检查后重试");
    await writePrivate(manifest.relayConfig, `${JSON.stringify(patchRelay(currentConfig, manifest.endpoint), null, 2)}\n`);
    await writePrivate(manifest.launchAgent, plist(serviceDefinition(manifest)));
    await exec("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, manifest.launchAgent]);
    await waitReady(manifest);
    record.phase = "active";
    await writePrivate(activationFile, JSON.stringify(record));
  } catch (error) {
    await rollback(manifest, { failedActivation: true });
    throw error;
  }
  return { active: true, backup, ...(await backendStatus(manifest)) };
}
export async function rollback(manifest, { failedActivation = false } = {}) {
  const activationFile = path.join(manifest.root, "activation.json");
  const record = await readJson(activationFile, null);
  if (!record) throw new Error("没有可回滚的共享模式切换记录");
  const runtime = await ownedRuntime(manifest);
  // Never terminate a desktop/Relay task as a side effect of rollback.
  await assertStopped(runtime ? [runtime.pid] : [], manifest);
  const config = await readJson(manifest.relayConfig);
  const relayPatched = config.codex?.connectionMode === "shared" && config.codex?.appServerEndpoint === manifest.endpoint;
  if (!failedActivation && !relayPatched) throw new Error("Relay 连接配置已经被另行修改，请检查后再回滚");
  const currentEnvironment = await environment();
  const expected = expectedEnvironment(manifest);
  for (const key of ENV_KEYS) {
    if (manifest.originalIcon && currentEnvironment[key] !== expected[key] && currentEnvironment[key] !== record.environment[key]) throw new Error("GUI 启动环境已被另行修改，请检查后再回滚");
  }
  await bootout(manifest);
  await fs.rm(manifest.launchAgent, { force: true });
  if (manifest.originalIcon) await setEnvironment(record.environment);
  if (relayPatched) await writePrivate(manifest.relayConfig, `${JSON.stringify(restoreRelay(config, record.previousCodex), null, 2)}\n`);
  // A later plugin upgrade is kept. Restore our own installed build only.
  if (await digest(manifest.relayAgent) === record.installedAgentHash) await replacePlugin(manifest, path.join(record.backup, "plugin"));
  await fs.rename(activationFile, path.join(record.backup, "activation-rolled-back.json"));
  return { rolledBack: true, backup: record.backup };
}
export async function openDesktop(manifest) {
  await checkCompatibility(manifest);
  await waitReady(manifest);
  const runtime = await ownedRuntime(manifest);
  await assertStopped(runtime ? [runtime.pid] : [], manifest, ["backend"]);
  const env = { ...process.env, ...expectedEnvironment(manifest), CODEX_HOME: manifest.codexHome };
  delete env.CODEX_APP_SERVER_WS_URL;
  // `open --env` supplies environment to LaunchServices, even from Finder.
  await exec("/usr/bin/open", ["-a", manifest.desktopApp, "--env", `CODEX_CLI_PATH=${env.CODEX_CLI_PATH}`, "--env", "CODEX_APP_SERVER_FORCE_CLI=1", "--env", "CODEX_APP_SERVER_WS_URL=", "--env", `CODEX_HOME=${manifest.codexHome}`], { env });
}

export function defaultManifest(root, options = {}) {
  const desktopApp = options.desktopApp || "/Applications/ChatGPT.app";
  const manifest = {
    version: 1, root: path.resolve(root), node: process.execPath, desktopApp,
    binary: path.join(desktopApp, "Contents/Resources/codex"), ...COMPATIBILITY,
    codexHome: path.resolve(options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
    relayConfig: path.resolve(options.relayConfig || path.join(os.homedir(), ".codex-relay-plugin/config.json")),
    relayAgent: options.relayAgent, pluginRoot: options.relayAgent ? path.dirname(path.dirname(path.resolve(options.relayAgent))) : null, originalIcon: options.originalIcon ?? false,
    desktopProfile: options.desktopProfile || null,
    path: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    shell: os.userInfo().shell || "/bin/zsh",
    label: "com.recodex.shared-backend", launchAgent: path.join(os.homedir(), "Library/LaunchAgents/com.recodex.shared-backend.plist"),
  };
  manifest.endpoint = `unix://${path.join(manifest.root, "rpc.sock")}`;
  if (Buffer.byteLength(manifest.endpoint.slice(7)) > 100) throw new Error("安装目录过长，macOS Unix Socket 路径需不超过 100 字节");
  return manifest;
}

async function replacePlugin(manifest, source) {
  const temporary = `${manifest.pluginRoot}.recodex-new`;
  const previous = `${manifest.pluginRoot}.recodex-previous`;
  // Refuse leftovers from an interrupted replacement; preserve evidence.
  for (const file of [temporary, previous]) {
    if (await fs.lstat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) throw new Error("插件目录存在未完成的切换记录，请先恢复该目录");
  }
  await fs.cp(source, temporary, { recursive: true, mode: constants.COPYFILE_FICLONE });
  await fs.rename(manifest.pluginRoot, previous);
  try { await fs.rename(temporary, manifest.pluginRoot); }
  catch (error) { await fs.rename(previous, manifest.pluginRoot); throw error; }
  await fs.rm(previous, { recursive: true });
}

export function tomlValue(value) {
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${tomlValue(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function desktopToolDefinition(manifest) {
  const plugin = path.join(manifest.desktopApp, "Contents/Resources/plugins/openai-bundled/plugins/codex-app-tools");
  const definition = (await readJson(path.join(plugin, "desktop-mcp.json"))).mcpServers.codex_app;
  return { ...definition, command: path.resolve(plugin, definition.command), cwd: plugin, enabled: true, omit_tools_from: ["deferred"], env: {
    ...definition.env, [DESKTOP_PIPE_KEY]: path.join(manifest.root, "desktop-tools.sock"), CODEX_MCP_NODE_PATH: path.join(manifest.desktopApp, "Contents/Resources/cua_node/bin/node"),
  } };
}

async function readLoginEnvironment(shell) {
  const marker = "RECODEX_ENV_BEGIN\0";
  const { stdout } = await exec(shell || "/bin/zsh", ["-ilc", "printf 'RECODEX_ENV_BEGIN\\0'; exec /usr/bin/env -0"], { timeout: 5000, maxBuffer: 1024 * 1024 });
  const index = stdout.indexOf(marker);
  if (index < 0) throw new Error("无法加载登录 Shell 环境，已停止启动共享后端");
  return Object.fromEntries(stdout.slice(index + marker.length).split("\0").flatMap(entry => {
    const equal = entry.indexOf("=");
    return equal > 0 && /^[A-Za-z_][A-Za-z_0-9]*$/.test(entry.slice(0, equal)) ? [[entry.slice(0, equal), entry.slice(equal + 1)]] : [];
  }));
}
