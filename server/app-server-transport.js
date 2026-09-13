import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

/**
 * Transport for Codex App Server. In managed mode this starts a private
 * stdio server. In shared mode it starts Codex's official `app-server proxy`
 * and forwards bytes to the daemon Unix socket, so Relay and the desktop can
 * use one writer and one event stream.
 */
export class StdioAppServerTransport extends EventEmitter {
  child = null;
  lines = null;

  constructor(config) {
    super();
    this.config = config;
    this.mode = config.appServerTransport || "stdio";
  }

  get pid() { return this.child?.pid || null; }
  get writable() { return Boolean(this.child?.stdin?.writable); }

  async open() {
    const socket = this.config.appServerSocket?.replace(/^~(?=\/|$)/, os.homedir()) || "";
    if (this.mode === "unix" && !socket) {
      throw new Error("共享 App Server 未配置 Unix Socket 路径");
    }
    const args = this.mode === "unix"
      ? ["app-server", "proxy", "--sock", path.resolve(socket)]
      : ["app-server"];
    const child = spawn(this.config.executable || "codex", args, {
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
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  }

  send(message) {
    if (!this.writable) throw new Error("Codex App Server 连接不可写");
    this.child.stdin.write(`${message}\n`);
  }

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

/** Direct WebSocket client for the official Unix-socket App Server daemon. */
export class UnixAppServerTransport extends EventEmitter {
  socket = null;
  ws = null;
  config;

  constructor(config) {
    super();
    this.config = config;
  }

  get pid() { return null; }
  get writable() { return this.ws?.readyState === WebSocket.OPEN; }

  async open() {
    const socket = String(this.config.appServerSocket || "").replace(/^~(?=\/|$)/, os.homedir());
    if (!socket) throw new Error("共享 App Server 未配置 Unix Socket 路径");
    const ws = new WebSocket(`ws+unix://${socket}:/`, {
      perMessageDeflate: false,
      handshakeTimeout: 10_000,
    });
    this.ws = ws;
    ws.on("message", data => {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      for (const line of text.split(/\r?\n/)) if (line.trim()) this.emit("message", line);
    });
    ws.on("error", error => this.emit("closed", error));
    ws.on("close", (code, reason) => this.emit("closed", new Error(`App Server Socket 已关闭 (${code})${reason ? `：${reason}` : ""}`)));
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = error => { cleanup(); reject(error); };
      const cleanup = () => { ws.off("open", onOpen); ws.off("error", onError); };
      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }

  send(message) {
    if (!this.writable) throw new Error("共享 App Server 连接不可写");
    this.ws.send(message);
  }

  async close() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { ws.terminate(); resolve(); }, 2_000);
      ws.once("close", () => { clearTimeout(timer); resolve(); });
      ws.close();
    });
  }
}
