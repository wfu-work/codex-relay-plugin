import { EventEmitter } from "node:events";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import WebSocket from "ws";

/**
 * Parse and validate the endpoint used by a shared App Server.  Unix sockets
 * are the preferred local transport; localhost WebSockets are accepted for
 * development and for desktop hosts that expose a loopback endpoint.
 */
export function parseAppServerEndpoint(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("请填写共享 App Server 地址");
  }
  const endpoint = value.trim();
  if (endpoint.startsWith("unix://")) {
    const socketPath = endpoint.slice("unix://".length)
      || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "app-server-control", "app-server-control.sock");
    if (!path.isAbsolute(socketPath) || /[\0\r\n?#]/.test(socketPath)) {
      throw new Error("共享 Socket 必须使用绝对路径");
    }
    return { kind: "unix", endpoint, socketPath };
  }
  let url;
  try { url = new URL(endpoint); } catch {
    throw new Error("共享后端地址必须使用 ws://、wss:// 或 unix://");
  }
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("共享后端地址必须使用 ws://、wss:// 或 unix://");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("共享 App Server 仅支持本机地址；远程访问请使用 Relay");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("共享后端地址不能包含凭据、query 或 hash");
  }
  return { kind: "websocket", endpoint: url.toString() };
}

/** The plugin owns exactly one local Codex App Server process. */
export class StdioAppServerTransport extends EventEmitter {
  child = null;
  lines = null;
  constructor(config) { super(); this.config = config; }
  get pid() { return this.child?.pid || null; }
  get writable() { return Boolean(this.child?.stdin?.writable); }
  async open() {
    const child = spawn(this.config.executable || "codex", ["app-server"], {
      cwd: this.config.defaultWorkingDirectory || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.child = child;
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on("line", line => this.emit("message", line));
    child.stderr.on("data", chunk => this.emit("log", chunk.toString().trim()));
    child.stdin.on("error", error => this.emit("closed", error));
    child.on("error", error => this.emit("closed", error));
    child.once("exit", (code, signal) => this.emit("closed", new Error(`App Server 已退出 (${code ?? signal})`)));
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  }
  send(message) { this.child.stdin.write(`${message}\n`); }
  async close() {
    this.lines?.close();
    const child = this.child;
    this.child = null;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill("SIGTERM");
    });
  }
}

/** A client transport for the single App Server owned by the desktop host. */
export class SharedAppServerTransport extends EventEmitter {
  socket = null;
  heartbeat = null;

  constructor(endpoint, { connectTimeoutMs = 10_000, heartbeatMs = 20_000 } = {}) {
    super();
    this.address = parseAppServerEndpoint(endpoint);
    this.connectTimeoutMs = connectTimeoutMs;
    this.heartbeatMs = heartbeatMs;
  }

  get pid() { return null; }
  get writable() { return this.socket?.readyState === WebSocket.OPEN; }

  async open() {
    const { kind, endpoint, socketPath } = this.address;
    const socket = new WebSocket(kind === "unix" ? "ws://localhost/rpc" : endpoint, {
      ...(kind === "unix" ? { createConnection: () => net.createConnection(socketPath) } : {}),
      handshakeTimeout: this.connectTimeoutMs,
      perMessageDeflate: false,
      followRedirects: false,
    });
    this.socket = socket;
    let alive = true;
    socket.on("pong", () => { alive = true; });
    socket.on("message", data => {
      alive = true;
      this.emit("message", data.toString());
    });
    socket.on("error", error => this.emit("closed", error));
    socket.on("close", code => {
      clearInterval(this.heartbeat);
      this.emit("closed", new Error(`共享 App Server 连接已关闭 (${code})`));
    });
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = error => { cleanup(); reject(error); };
      const onClose = () => onError(new Error("共享 App Server 在初始化前断开"));
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
    this.heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      if (this.writable) socket.ping();
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  send(message) {
    if (!this.writable) throw new Error("共享 App Server 连接不可写");
    this.socket.send(message, error => { if (error) this.emit("closed", error); });
  }

  async close() {
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 250);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
    });
  }
}
