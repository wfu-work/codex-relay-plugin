import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { rolloutItem } from "./rollout-items.js";
import { RolloutUsage } from "./rollout-usage.js";

const UUID = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
const JOURNAL = new RegExp(`^rollout-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-(${UUID})(?:_${UUID})?\\.jsonl$`, "i");
const MAX_READ_BYTES = 32 * 1024 * 1024;
const MAX_LINE_BYTES = 4 * 1024 * 1024;

/** Read-only projection for tasks owned by another Codex process.
 * A retried Desktop task can have several rollout files with the same id.
 * Its App Server index may still point at the first, failed attempt.
 */
export class RolloutSnapshots {
  #root;
  #index = new Map();
  #indexedAt = 0;
  #indexing;
  #records = new Map();
  #pending = new Map();

  constructor({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), indexIntervalMs = 2000 } = {}) {
    this.#root = path.join(codexHome, "sessions");
    this.indexIntervalMs = indexIntervalMs;
  }

  clear() { this.#records.clear(); }

  async read(thread) {
    if (!thread?.id || !thread.path || !thread.cwd) return null;
    const existing = this.#pending.get(thread.id);
    if (existing) return existing;
    const pending = this.#read(thread).catch(() => null).finally(() => this.#pending.delete(thread.id));
    this.#pending.set(thread.id, pending);
    return pending;
  }

  async #refreshIndex() {
    if (this.#indexing) return this.#indexing;
    if (Date.now() - this.#indexedAt < this.indexIntervalMs) return;
    this.#indexing = (async () => {
      const entries = await fs.readdir(this.#root, { recursive: true, withFileTypes: true });
      const index = new Map();
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = entry.name.match(JOURNAL);
        if (!match) continue;
        const file = path.join(entry.parentPath, entry.name);
        const files = index.get(match[1]) || [];
        files.push(file);
        index.set(match[1], files);
      }
      for (const files of index.values()) files.sort().reverse();
      this.#index = index;
      this.#indexedAt = Date.now();
    })().finally(() => { this.#indexing = null; });
    return this.#indexing;
  }

  async #read(thread) {
    const root = await fs.realpath(this.#root);
    const original = await fs.realpath(thread.path);
    if (!inside(root, original)) return null;
    await this.#refreshIndex();
    // Validate identity and workspace even though the file name matched.
    // Never follow a symlink or a replacement journal outside Codex history.
    for (const candidate of this.#index.get(thread.id) || [original]) {
      const file = await fs.realpath(candidate);
      if (!inside(root, file)) continue;
      const handle = await fs.open(file, "r");
      try {
        const stat = await handle.stat();
        let record = this.#records.get(thread.id);
        const reusable = record?.file === file && record.cwd === path.resolve(thread.cwd) &&
          record.ino === stat.ino && stat.size >= record.offset;
        if (!reusable) {
          const head = Buffer.alloc(Math.min(MAX_LINE_BYTES, stat.size));
          const { bytesRead } = await handle.read(head, 0, head.length, 0);
          const end = head.indexOf(10);
          if (end < 0 || end >= bytesRead) continue;
          const meta = JSON.parse(head.subarray(0, end).toString("utf8"));
          if (meta.type !== "session_meta" || meta.payload?.id !== thread.id ||
              path.resolve(meta.payload?.cwd || "") !== path.resolve(thread.cwd)) continue;
          // Very large histories remain served by App Server. Do not claim a
          // complete replacement if we cannot read the new attempt in full.
          if (stat.size > MAX_READ_BYTES) return null;
          record = { file, cwd: path.resolve(thread.cwd), ino: stat.ino, offset: 0, remainder: Buffer.alloc(0), turns: [], current: null,
            itemCount: 0, updatedAt: meta.timestamp, complete: true, usage: new RolloutUsage() };
        }
        const notifications = [];
        if (stat.size - record.offset > MAX_READ_BYTES) return null;
        while (record.offset < stat.size) {
          const chunk = Buffer.alloc(Math.min(256 * 1024, stat.size - record.offset));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, record.offset);
          if (!bytesRead) break;
          record.offset += bytesRead;
          let buffer = Buffer.concat([record.remainder, chunk.subarray(0, bytesRead)]);
          let end;
          while ((end = buffer.indexOf(10)) >= 0) {
            const line = buffer.subarray(0, end);
            buffer = buffer.subarray(end + 1);
            if (line.length > MAX_LINE_BYTES) { record.complete = false; continue; }
            if (!line.length) continue;
            let row;
            try { row = JSON.parse(line.toString("utf8")); } catch { record.complete = false; continue; }
            projectRow(record, row, notifications, thread.id);
          }
          if (buffer.length > MAX_LINE_BYTES) return null;
          record.remainder = buffer;
        }
        this.#records.delete(thread.id);
        this.#records.set(thread.id, record);
        while (this.#records.size > 8) this.#records.delete(this.#records.keys().next().value);
        if (!record.current || !record.complete) return null;
        return { file, turns: structuredClone(record.turns), currentTurn: structuredClone(record.current),
          updatedAt: record.updatedAt, notifications: reusable ? notifications : [], replaced: file !== original };
      } finally { await handle.close(); }
    }
    return null;
  }
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function projectRow(record, row, notifications, threadId) {
  if (row.type !== "event_msg") return;
  const event = row.payload;
  if (!event || (event.thread_id && event.thread_id !== threadId)) return;
  if (event.type === "task_started" && event.turn_id) {
    const turn = { id: event.turn_id, status: "inProgress", startedAt: event.started_at ?? Date.parse(row.timestamp) / 1000,
      completedAt: null, durationMs: null, items: [] };
    record.turns.push(turn);
    record.current = turn;
    record.usage.start(turn);
    if (record.turns.length > 12) {
      record.itemCount -= record.turns.shift().items.length;
    }
    notifications.push(["turn/started", { threadId, turn: { ...turn, items: [] } }]);
  } else if (event.type === "token_count") {
    const turn = event.turn_id ? record.turns.find((turn) => turn.id === event.turn_id) : record.current;
    if (event.turn_id && !turn) return;
    // Unscoped counters cannot be attributed while two turns overlap.
    if (!event.turn_id && record.turns.filter((turn) => turn.status === "inProgress").length > 1) return;
    if (record.usage.update(turn, event.info) && turn) {
      notifications.push(["thread/tokenUsage/updated", {
        threadId, turnId: turn.id, tokenUsage: turn.tokenUsage,
        ...(turn.turnUsage ? { turnUsage: turn.turnUsage } : {}),
      }]);
    }
  } else if (event.type === "item_completed" || event.type === "item_started" || event.type === "item_updated") {
    const turn = record.turns.find((turn) => turn.id === event.turn_id);
    const item = rolloutItem(event.item);
    if (!turn || !item) return;
    const index = turn.items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) turn.items[index] = item;
    else { turn.items.push(item); record.itemCount += 1; }
    while (record.itemCount > 500) {
      record.turns.find((entry) => entry.items.length)?.items.shift();
      record.itemCount -= 1;
    }
    const method = event.type.replace("item_", "item/");
    notifications.push([method, { threadId, turnId: turn.id, item }]);
  } else if (event.type === "task_complete" || event.type === "turn_aborted") {
    const turn = event.turn_id ? record.turns.find((turn) => turn.id === event.turn_id) : record.current;
    if (!turn) return;
    turn.status = event.type === "turn_aborted" ? "interrupted" : event.error ? "failed" : "completed";
    turn.completedAt = event.completed_at ?? Date.parse(row.timestamp) / 1000;
    turn.durationMs = event.duration_ms ?? Math.max(0, (turn.completedAt - turn.startedAt) * 1000);
    if (event.error) turn.error = { message: String(event.error.message || "任务执行失败") };
    notifications.push(["turn/completed", { threadId, turn: { ...turn, items: [] } }]);
  }
  record.updatedAt = row.timestamp || record.updatedAt;
}

export function applyRolloutSnapshot(thread, snapshot, { includeTurns = false } = {}) {
  if (!snapshot) return thread;
  const turn = snapshot.currentTurn;
  const currentTurn = { ...turn, items: [] };
  const updatedAt = Date.parse(snapshot.updatedAt) / 1000;
  return { ...thread, path: snapshot.file,
    status: { type: turn.status === "inProgress" ? "active" : "idle", activeFlags: [] },
    currentTurn, updatedAt: Number.isFinite(updatedAt) ? updatedAt : thread.updatedAt,
    ...(includeTurns ? { turns: snapshot.turns } : {}),
  };
}
