import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { RelayError } from "./errors.js";

export const MUTATING_COMMANDS = new Set(["thread.create", "turn.start", "turn.steer", "turn.interrupt", "approval.respond", "userInput.respond"]);
const hash = value => createHash("sha256").update(value).digest("hex");

// Persist intent before dispatch. If the process dies before the response is
// durable, a retry reports uncertainty; it must never start the turn again.
export class CommandJournal {
  constructor(configDir) { this.directory = configDir ? path.join(configDir, "command-journal") : null; }
  file(config, message) {
    const scope = JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId || config.relay.deviceId, config.codex.connectionMode, config.codex.appServerEndpoint, config.codex.executable]);
    return path.join(this.directory, `${hash(`${scope}:${message.deviceId}:${message.requestId}`)}.json`);
  }
  async begin(config, message, fingerprint) {
    if (!this.directory || !MUTATING_COMMANDS.has(message.command.type)) return null;
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = this.file(config, message);
    const signature = hash(fingerprint);
    try {
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      if (saved.fingerprint !== signature) throw new RelayError("REQUEST_ID_REUSED", "requestId 已被另一条命令使用");
      if (saved.response) return { file, response: saved.response };
      throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "该命令可能已被后端接受；请刷新任务核对结果，系统不会重复执行", { threadId: message.threadId || message.command.threadId, command: message.command.type });
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await this.#write(file, { fingerprint: signature, createdAt: Date.now(), command: message.command.type }, true); }
    catch (error) {
      if (error.code === "EEXIST") return this.begin(config, message, fingerprint);
      throw error;
    }
    return { file, fingerprint: signature };
  }
  async finish(entry, response) {
    if (!entry?.file || entry.response) return;
    await this.#write(entry.file, { fingerprint: entry.fingerprint, createdAt: Date.now(), response });
  }
  async #write(file, value, exclusive = false) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    try {
      if (exclusive) { await fs.link(temporary, file); await fs.unlink(temporary); }
      else await fs.rename(temporary, file);
      const directory = await fs.open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async prune() {
    if (!this.directory) return;
    const files = await fs.readdir(this.directory).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    // Incoming commands expire in five minutes; retain a full day of outcomes.
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json(?:\..*\.tmp)?$/.test(name)) continue;
      const file = path.join(this.directory, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 86400000) await fs.rm(file, { force: true });
    }
  }
}
