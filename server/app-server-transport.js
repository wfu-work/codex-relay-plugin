import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";

/**
 * The Relay always owns its own local Codex App Server. Keeping the transport
 * private makes the process lifecycle explicit and avoids attaching to a
 * desktop-owned socket that may disappear when the desktop is restarted.
 */
export class StdioAppServerTransport extends EventEmitter {
  child = null;
  lines = null;

  constructor(config) {
    super();
    this.config = config;
  }

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
