import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { SharedAppServerTransport, parseAppServerEndpoint } from "./app-server-transport.js";
import { redact } from "./utils.js";

const exec = promisify(execFile);
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_STANDALONE = path.join(os.homedir(), ".codex", "packages", "standalone", "current", "codex");
const CONTROL_SOCKET = path.join(os.homedir(), ".codex", "app-server-control", "app-server-control.sock");

const bounded = value => redact(String(value || "")).replace(/[\0\r\n]+/g, " ").slice(0, 600);
const ownSocket = async (file, uid = process.getuid?.()) => {
  const stat = await fs.stat(file).catch(() => null);
  return Boolean(stat?.isSocket() && (uid == null || stat.uid === uid));
};

export async function detectInstallerProxy({ env = process.env, home = os.homedir() } = {}) {
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    const value = String(env[key] || "").trim();
    if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  }
  const files = [
    path.join(home, "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"),
    path.join(home, ".config/clash/config.yaml"),
    path.join(home, ".config/clash-verge/config.yaml"),
  ];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    const port = text.match(/^\s*(?:mixed-port|http-port):\s*(\d+)\s*$/m)?.[1];
    if (port && Number(port) > 0 && Number(port) < 65536) return `http://127.0.0.1:${port}`;
  }
  return null;
}

export async function detectCodexAuth({ home = os.homedir() } = {}) {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(home, ".codex", "auth.json"), "utf8"));
    if (typeof saved?.OPENAI_API_KEY === "string" && saved.OPENAI_API_KEY) return "api_key";
    if (typeof saved?.tokens?.access_token === "string" && saved.tokens.access_token) return "chatgpt";
    if (typeof saved?.access_token === "string" && saved.access_token) return "chatgpt";
  } catch { /* an absent or malformed auth file is reported as unknown */ }
  return "unknown";
}

export function remoteControlPaths(home = os.homedir()) {
  const codexHome = home || os.homedir();
  return {
    executable: path.join(codexHome, ".codex", "packages", "standalone", "current", "codex"),
    controlSocket: path.join(codexHome, ".codex", "app-server-control", "app-server-control.sock"),
  };
}

export function extractRemoteControlResult(stdout, stderr = "") {
  const text = String(stdout || "").trim();
  let json = null;
  for (const line of text.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") { json = parsed; break; }
    } catch { /* human-readable CLI output is supported too */ }
  }
  const code = text.match(/(?:pairing\s+code|code)\s*[:=]\s*([A-Z0-9][A-Z0-9-]{3,63})/i)?.[1] || null;
  const url = json?.websocket_url || json?.webSocketUrl || json?.url || null;
  return {
    state: json?.status || json?.state || (text ? "reported" : "unknown"),
    pairingCode: code,
    endpoint: typeof url === "string" && /^wss?:\/\//.test(url) ? url : null,
    message: bounded(json?.message || text || stderr),
  };
}

export async function inspectRemoteControl({ home = os.homedir(), executable, socketPath, platform = process.platform, run = exec } = {}) {
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  let version = null;
  let installed = false;
  if (platform === "darwin" || platform === "linux") {
    try {
      await fs.access(binary, fs.constants.X_OK);
      const result = await run(binary, ["--version"], { timeout: 4000, maxBuffer: 4096 });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (/codex(?:-cli)?\s+\S+/i.test(output)) { installed = true; version = bounded(output); }
    } catch { /* absence is represented explicitly below */ }
  }
  const running = await ownSocket(control);
  const authMode = await detectCodexAuth({ home });
  const official = {
    state: installed ? authMode === "api_key" ? "auth_required" : running ? "running" : "available" : "unavailable",
    installed,
    version,
    authMode,
    executable: installed ? binary : null,
    controlEndpoint: running ? `unix://${control}` : null,
    attachable: false,
    reason: installed
      ? authMode === "api_key" ? "当前使用 API Key；官方 Remote Control 只接受 ChatGPT 账号授权"
        : running ? "官方 Remote Control 已启动；控制 Socket 仅供官方客户端使用" : "已找到官方 standalone 安装，可从控制台启动 Remote Control"
      : "未找到官方 standalone 安装；当前 Homebrew/桌面内置 CLI 不能代替 Remote Control daemon",
  };
  const bridge = {
    state: running ? "ready" : "blocked",
    endpoint: null,
    attachable: false,
    reason: running ? "官方控制 Socket 不是第三方 App Server 端点，需官方授权或桌面桥接代理" : "等待官方 Remote Control 或桌面宿主提供已授权的本地端点",
  };
  return { checkedAt: new Date().toISOString(), official, bridge, paths: { controlSocket: control } };
}

export async function runRemoteControl(command, { home = os.homedir(), executable, socketPath, run = exec, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  if (!["start", "stop", "pair"].includes(command)) throw new Error("不支持的 Remote Control 操作");
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  if (await detectCodexAuth({ home }) === "api_key") {
    const error = new Error("官方 Remote Control 需要 ChatGPT 账号授权；当前 API Key 登录不能使用此功能");
    error.code = "REMOTE_CONTROL_AUTH_REQUIRED";
    throw error;
  }
  const exists = await fs.access(binary, fs.constants.X_OK).then(() => true, () => false);
  if (!exists) {
    const error = new Error("未找到官方 standalone Codex；请先使用官方安装器安装后重试");
    error.code = "REMOTE_CONTROL_UNAVAILABLE";
    throw error;
  }
  const env = { ...process.env, TERM: "xterm", CODEX_HOME: home };
  try {
    const result = await run(binary, ["remote-control", command, "--json"], { env, timeout: timeoutMs, maxBuffer: 128 * 1024 });
    const parsed = extractRemoteControlResult(result.stdout, result.stderr);
    const state = await inspectRemoteControl({ home, executable: binary, socketPath: control, run });
    return { operation: command, ...parsed, official: state.official, bridge: state.bridge };
  } catch (error) {
    const detail = bounded(error.stderr || error.stdout || error.message);
    const authRequired = /ChatGPT authentication|API key auth is not supported|requires ChatGPT authentication/i.test(detail);
    const wrapped = new Error(authRequired ? "官方 Remote Control 需要 ChatGPT 账号授权；当前 API Key 登录不能使用此功能" : detail || `官方 Remote Control ${command} 失败`);
    wrapped.code = authRequired ? "REMOTE_CONTROL_AUTH_REQUIRED" : error.code === "ETIMEDOUT" ? "REMOTE_CONTROL_TIMEOUT" : "REMOTE_CONTROL_FAILED";
    throw wrapped;
  }
}

export async function installOfficialStandalone({ home = os.homedir(), installerUrl = "https://chatgpt.com/codex/install.sh", fetchImpl = fetch, curlImpl = exec, spawnImpl = spawn, proxy, timeoutMs = 120_000 } = {}) {
  if (!/^https:\/\/chatgpt\.com\/codex\/install\.sh$/.test(installerUrl)) {
    const error = new Error("官方安装地址无效");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  const target = remoteControlPaths(home).executable;
  if (await fs.access(target, fs.constants.X_OK).then(() => true, () => false)) {
    return { installed: true, alreadyPresent: true, executable: target };
  }
  const proxyUrl = proxy === undefined ? await detectInstallerProxy({ home }) : proxy;
  let script = "";
  let finalUrl = installerUrl;
  if (proxyUrl && curlImpl) {
    try {
      const args = ["-fsSL", "--proto", "=https", "--connect-timeout", "10", "--max-time", "20", "--proxy", proxyUrl, "-w", "\n__CODEX_INSTALL_URL__%{url_effective}", installerUrl];
      const result = await curlImpl("/usr/bin/curl", args, { timeout: 30_000, maxBuffer: 3 * 1024 * 1024 });
      const marker = "\n__CODEX_INSTALL_URL__";
      const index = String(result.stdout || "").lastIndexOf(marker);
      script = index >= 0 ? String(result.stdout).slice(0, index) : String(result.stdout || "");
      finalUrl = index >= 0 ? String(result.stdout).slice(index + marker.length).trim() : installerUrl;
    } catch (error) {
      const wrapped = new Error(`无法通过本机代理下载官方安装脚本：${bounded(error.stderr || error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    }
  } else {
    let response;
    const downloadController = new AbortController();
    const downloadTimer = setTimeout(() => downloadController.abort(), Math.min(timeoutMs, 20_000));
    try { response = await fetchImpl(installerUrl, { redirect: "follow", signal: downloadController.signal }); }
    catch (error) {
      const wrapped = new Error(error.name === "AbortError" ? "无法下载官方安装脚本：网络连接超时，请检查网络后重试" : `无法下载官方安装脚本：${bounded(error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    } finally { clearTimeout(downloadTimer); }
    if (!response.ok) {
      const error = new Error(`官方安装脚本下载失败（HTTP ${response.status}）`);
      error.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw error;
    }
    script = await response.text();
    finalUrl = response.url || installerUrl;
  }
  let final;
  try { final = new URL(finalUrl); } catch { final = null; }
  if (!final || !["chatgpt.com", "www.chatgpt.com", "openai.com", "www.openai.com", "releases.openai.com"].includes(final.hostname)) {
    const error = new Error("官方安装脚本重定向到了不受信任的地址");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  if (!script || script.length > 2 * 1024 * 1024 || !/codex/i.test(script)) {
    const error = new Error("官方安装脚本内容无效");
    error.code = "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID";
    throw error;
  }
  const env = { ...process.env, HOME: home, CI: "1", TERM: "dumb", CODEX_NON_INTERACTIVE: "true", ...(proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, ALL_PROXY: proxyUrl } : {}) };
  const child = spawnImpl("/bin/sh", ["-s"], { cwd: home, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const append = chunk => { output = `${output}${chunk}`.slice(-8_000); };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  try {
    child.stdin.end(script);
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0) {
      const error = new Error(`官方 standalone 安装失败：${bounded(output)}`);
      error.code = result.signal ? "REMOTE_CONTROL_INSTALL_TIMEOUT" : "REMOTE_CONTROL_INSTALL_FAILED";
      throw error;
    }
  } finally { clearTimeout(timer); }
  if (!(await fs.access(target, fs.constants.X_OK).then(() => true, () => false))) {
    const error = new Error("安装脚本已完成，但未找到 standalone Codex 可执行文件");
    error.code = "REMOTE_CONTROL_INSTALL_INCOMPLETE";
    throw error;
  }
  return { installed: true, alreadyPresent: false, executable: target };
}

export class DesktopBridge {
  constructor(endpoint, { transportFactory = value => new SharedAppServerTransport(value) } = {}) {
    this.endpoint = parseAppServerEndpoint(endpoint).endpoint;
    this.transportFactory = transportFactory;
    this.transport = null;
    this.state = "stopped";
  }

  async inspect() {
    const address = parseAppServerEndpoint(this.endpoint);
    if (address.kind === "unix" && !(await ownSocket(address.socketPath))) {
      return { state: "blocked", endpoint: this.endpoint, attachable: false, reason: "桥接 Socket 不存在、不是 Socket 或不属于当前用户" };
    }
    return { state: "available", endpoint: this.endpoint, attachable: true, reason: "端点通过本机地址和所有权检查；连接时仍需 App Server initialize 授权" };
  }

  async connect() {
    const check = await this.inspect();
    if (!check.attachable) { const error = new Error(check.reason); error.code = "DESKTOP_BRIDGE_UNAVAILABLE"; throw error; }
    this.transport = this.transportFactory(this.endpoint);
    this.transport.on("closed", () => { if (this.state === "ready") this.state = "error"; });
    await this.transport.open();
    this.state = "ready";
    return { ...check, state: this.state };
  }

  async close() {
    await this.transport?.close();
    this.transport = null;
    this.state = "stopped";
  }
}

export const defaultRemoteControlSocket = CONTROL_SOCKET;
