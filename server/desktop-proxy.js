import readline from "node:readline";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { parse } from "smol-toml";
import { SharedAppServerTransport } from "./app-server-transport.js";

const THREAD_CONFIG_METHODS = new Set(["thread/start", "thread/resume", "thread/fork"]);
export const DESKTOP_PIPE_KEY = "CODEX_APP_TOOLS_PIPE_PATH";

export async function bindDesktopPipe(root, config) {
  const tools = config["mcp_servers.codex_app"];
  const pipe = tools?.env?.[DESKTOP_PIPE_KEY];
  if (!tools?.enabled || !pipe) throw new Error("桌面未提供工具连接配置，请检查桌面版本及插件安装");
  if (!path.isAbsolute(pipe)) throw new Error("桌面工具 Socket 必须为绝对路径");
  const stat = await fs.stat(pipe);
  if (!stat.isSocket() || stat.uid !== process.getuid()) throw new Error("桌面工具 Socket 无效或不属于当前用户");
  const stable = path.join(root, "desktop-tools.sock");
  // A second live desktop must not redirect tools used by the first desktop.
  const old = await fs.readlink(stable).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (old && old !== pipe && await new Promise(resolve => {
    const socket = net.createConnection(old);
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(500, () => finish(true));
  })) throw new Error("已有桌面实例连接共享工具，请先退出该实例");
  const temporary = `${stable}.${process.pid}`;
  await fs.symlink(pipe, temporary);
  try { await fs.rename(temporary, stable); } finally { await fs.rm(temporary, { force: true }); }
  return { ...config, "mcp_servers.codex_app": { ...tools, env: { ...tools.env, [DESKTOP_PIPE_KEY]: stable } } };
}

export async function refreshDesktopTools(endpoint) {
  // A task created while Desktop was closed may have failed its initial MCP
  // handshake. Refresh the configured servers after the host pipe is back.
  const transport = new SharedAppServerTransport(endpoint);
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("桌面工具连接恢复超时")), 10000);
      transport.on("closed", reject);
      transport.on("message", raw => {
        const message = JSON.parse(raw);
        if (message.id !== "desktop-init" && message.id !== "desktop-reload") return;
        if (message.error) { reject(new Error("共享后端无法恢复桌面工具配置")); return; }
        if (message.id === "desktop-init") {
          transport.send(JSON.stringify({ method: "initialized", params: {} }));
          transport.send(JSON.stringify({ id: "desktop-reload", method: "config/mcpServer/reload", params: {} }));
        } else resolve();
      });
      transport.open().then(() => transport.send(JSON.stringify({ id: "desktop-init", method: "initialize", params: { clientInfo: { name: "recodex_desktop_recovery", version: "1.0" }, capabilities: { experimentalApi: true } } })), reject);
    });
  } finally { clearTimeout(timer); await transport.close(); }
}

// Desktop still takes its local stdio path, including host MCP and artifact
// configuration. Only transport ownership moves to the shared service.
export function desktopInvocation(args) {
  const config = {};
  let appServer = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "app-server") { appServer = true; continue; }
    if (arg === "--analytics-default-enabled") continue; // Set on the shared service, as on Desktop.
    if (["-c", "--config", "--enable", "--disable"].includes(arg) || arg.startsWith("--config=")) {
      const value = arg.startsWith("--config=") ? arg.slice(9) : args[++i];
      if (!value) throw new Error("Codex 启动配置缺少值");
      if (arg === "--enable" || arg === "--disable") {
        config[`features.${value}`] = arg === "--enable";
      } else {
        const equal = value.indexOf("=");
        if (equal < 1) throw new Error("Codex 启动配置格式不正确");
        const key = value.slice(0, equal).trim();
        const raw = value.slice(equal + 1).trim();
        try { config[key] = parse(`value = ${raw}`).value; }
        catch { config[key] = raw; } // Same TOML/string fallback as Codex -c.
      }
      continue;
    }
    if (["--version", "-V", "--help", "-h", "generate-ts", "generate-json-schema"].includes(arg)) return null;
    if (appServer && ["proxy", "daemon"].includes(arg)) throw new Error("共享启动代理不管理其他 daemon；请使用共享服务的管理入口");
    if (arg === "--stdio") continue;
    // Never silently ignore a future desktop launch flag or spawn a second writer.
    if (appServer || args.includes("app-server")) throw new Error("不支持的桌面 App Server 启动参数；请检查版本兼容性");
    return null;
  }
  return appServer ? config : null;
}

export function withDesktopConfig(message, config) {
  if (!THREAD_CONFIG_METHODS.has(message.method) || !message.params) return message;
  return { ...message, params: { ...message.params, config: { ...config, ...message.params.config } } };
}

export async function proxyDesktop({ endpoint, config, input = process.stdin, output = process.stdout, onConnected = () => {} }) {
  const transport = new SharedAppServerTransport(endpoint);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  // Start buffering before the asynchronous socket handshake; Desktop writes
  // initialize immediately after spawning its stdio child.
  const incoming = lines[Symbol.asyncIterator]();
  const limit = 16 * 1024 * 1024;
  let intentional = false;
  let fail;
  const failed = new Promise((_, reject) => { fail = reject; });
  // Install handlers before open; no RPCs, credentials or prompts are logged.
  transport.on("closed", error => { if (!intentional) fail(error); });
  output.on("error", fail);
  transport.on("message", raw => {
    if (output.writableLength + Buffer.byteLength(raw) > limit) {
      fail(new Error("桌面输出阻塞，共享连接已关闭；请重新打开任务以补齐历史"));
    } else output.write(`${raw}\n`);
  });
  const pump = async () => {
    await transport.open();
    onConnected();
    for await (const raw of incoming) {
      if (!raw.trim()) continue;
      if (Buffer.byteLength(raw) > limit) throw new Error("桌面请求超过传输限制");
      const encoded = JSON.stringify(withDesktopConfig(JSON.parse(raw), config));
      await new Promise((resolve, reject) => transport.socket.send(encoded, error => error ? reject(error) : resolve()));
    }
  };
  try { await Promise.race([pump(), failed]); }
  finally {
    intentional = true;
    lines.close();
    input.pause();
    output.off("error", fail);
    await transport.close();
  }
}
