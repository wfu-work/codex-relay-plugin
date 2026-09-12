#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// server/runtime.js
import crypto7 from "node:crypto";
import fs14 from "node:fs/promises";
import path15 from "node:path";

// server/connector-service.js
import { EventEmitter as EventEmitter5 } from "node:events";
import { randomUUID as randomUUID4 } from "node:crypto";

// server/app-server-client.js
import { EventEmitter as EventEmitter2 } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// server/errors.js
var RelayError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
};
function asRelayError(error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof RelayError) return error;
  return new RelayError(fallbackCode, error instanceof Error ? error.message : String(error));
}

// server/app-server-transport.js
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";
var StdioAppServerTransport = class extends EventEmitter {
  child = null;
  lines = null;
  constructor(config) {
    super();
    this.config = config;
  }
  get pid() {
    return this.child?.pid || null;
  }
  get writable() {
    return Boolean(this.child?.stdin?.writable);
  }
  async open() {
    const child = spawn(this.config.executable || "codex", ["app-server"], {
      cwd: this.config.defaultWorkingDirectory || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    this.child = child;
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.emit("message", line));
    child.stderr.on("data", (chunk) => this.emit("log", chunk.toString().trim()));
    child.stdin.on("error", (error) => this.emit("closed", error));
    child.on("error", (error) => this.emit("closed", error));
    child.once("exit", (code, signal) => this.emit("closed", new Error(`App Server \u5DF2\u9000\u51FA (${code ?? signal})`)));
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  }
  send(message) {
    if (!this.writable) throw new Error("Codex App Server \u8FDE\u63A5\u4E0D\u53EF\u5199");
    this.child.stdin.write(`${message}
`);
  }
  async close() {
    this.lines?.close();
    const child = this.child;
    this.child = null;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 3e3);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
};

// server/rollout-snapshot.js
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// server/rollout-items.js
function rolloutItem(item) {
  if (!item || typeof item.id !== "string") return null;
  const common = { id: item.id };
  switch (item.type) {
    case "UserMessage":
      return { ...common, type: "userMessage", content: (item.content || []).flatMap((part) => {
        if (part.type === "text") return [{ type: "text", text: text(part.text) }];
        if (part.type === "local_image") return [{ type: "localImage", path: part.path }];
        if (part.type === "image") return [{ type: "image", url: part.image_url }];
        return [];
      }) };
    case "AgentMessage":
      return {
        ...common,
        type: "agentMessage",
        phase: item.phase,
        text: text((item.content || []).filter((part) => part.type === "Text").map((part) => part.text).join(""))
      };
    case "Reasoning":
      return { ...common, type: "reasoning", summary: (item.summary_text || []).map(text), content: [] };
    case "CommandExecution":
      return {
        ...common,
        type: "commandExecution",
        command: text(Array.isArray(item.command) ? item.command.join(" ") : item.command),
        cwd: item.cwd,
        status: item.status,
        aggregatedOutput: text(item.aggregated_output),
        exitCode: item.exit_code,
        durationMs: duration(item.duration)
      };
    case "McpToolCall":
      return {
        ...common,
        type: "mcpToolCall",
        server: item.server,
        tool: item.tool,
        status: item.status,
        result: { content: (item.result?.content || []).filter((part) => part.type === "text").map((part) => ({ type: "text", text: text(part.text) })) },
        durationMs: duration(item.duration)
      };
    case "FileChange":
      return {
        ...common,
        type: "fileChange",
        status: item.status,
        changes: Object.entries(item.changes || {}).slice(0, 128).map(([path16, change]) => ({
          path: path16,
          kind: { type: change.type, move_path: change.move_path },
          diff: text(change.unified_diff)
        }))
      };
    default:
      return null;
  }
}
function text(value) {
  if (typeof value !== "string") return "";
  return value.length > 32768 ? `${value.slice(0, 32768)}
\u2026\uFF08\u5386\u53F2\u8F93\u51FA\u5DF2\u622A\u65AD\uFF09` : value;
}
function duration(value) {
  return value && Number.isFinite(value.secs) ? Math.round(value.secs * 1e3 + (value.nanos || 0) / 1e6) : null;
}

// server/rollout-usage.js
var FIELDS = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  totalTokens: "total_tokens",
  cachedInputTokens: "cached_input_tokens",
  reasoningOutputTokens: "reasoning_output_tokens"
};
var REQUIRED = ["inputTokens", "outputTokens", "totalTokens"];
function usage(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const [key, snake] of Object.entries(FIELDS)) {
    const count = value[snake] ?? value[key];
    if (count === void 0 && !REQUIRED.includes(key)) continue;
    if (count === void 0 && REQUIRED.includes(key)) continue;
    if (!Number.isSafeInteger(count) || count < 0) return null;
    result[key] = count;
  }
  if (!REQUIRED.some((key) => result[key] !== void 0)) return null;
  return result;
}
var RolloutUsage = class {
  #total = null;
  #turns = /* @__PURE__ */ new Map();
  start(turn, modelContextWindow) {
    this.#turns.set(turn.id, {
      baseline: this.#total,
      invalid: false,
      modelContextWindow: contextWindow(modelContextWindow)
    });
    while (this.#turns.size > 12) this.#turns.delete(this.#turns.keys().next().value);
  }
  update(turn, info, updatedAt) {
    const total = usage(info?.total_token_usage ?? info?.total ?? info);
    if (!total) return false;
    const last = usage(info?.last_token_usage ?? info?.last);
    if (!turn) {
      this.#total = total;
      return false;
    }
    const state = this.#turns.get(turn.id);
    if (!state) return false;
    const previous = JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    if (!state.baseline && !state.invalid && last && REQUIRED.every((key) => total[key] === last[key])) {
      state.baseline = Object.fromEntries(Object.keys(total).map((key) => [key, 0]));
    }
    if (this.#total && REQUIRED.some((key) => total[key] < this.#total[key])) {
      state.invalid = true;
    }
    this.#total = total;
    const limit = info?.model_context_window ?? info?.modelContextWindow;
    if (limit !== void 0 && limit !== null) state.modelContextWindow = contextWindow(limit);
    turn.tokenUsage = {
      total,
      ...last ? { last } : {},
      ...state.modelContextWindow ? { modelContextWindow: state.modelContextWindow } : {},
      ...turn.tokenUsage?.updatedAt ? { updatedAt: turn.tokenUsage.updatedAt } : {}
    };
    if (state.baseline && !state.invalid) {
      const delta = {};
      for (const [key, value] of Object.entries(total)) {
        const baseline = state.baseline[key];
        if (baseline !== void 0 && value >= baseline) delta[key] = value - baseline;
      }
      if (REQUIRED.every((key) => delta[key] !== void 0)) turn.turnUsage = delta;
      else state.invalid = true;
    }
    if (state.invalid) delete turn.turnUsage;
    const changed = previous !== JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    if (changed && typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))) {
      turn.tokenUsage.updatedAt = updatedAt;
    }
    return changed;
  }
};
function contextWindow(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// server/rollout-snapshot.js
var UUID = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
var JOURNAL = new RegExp(`^rollout-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-(${UUID})(?:_${UUID})?\\.jsonl$`, "i");
var MAX_READ_BYTES = 32 * 1024 * 1024;
var MAX_LINE_BYTES = 4 * 1024 * 1024;
var RolloutSnapshots = class {
  #root;
  #index = /* @__PURE__ */ new Map();
  #indexedAt = 0;
  #indexing;
  #records = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), indexIntervalMs = 2e3 } = {}) {
    this.#root = path.join(codexHome, "sessions");
    this.indexIntervalMs = indexIntervalMs;
  }
  clear() {
    this.#records.clear();
  }
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
      const index = /* @__PURE__ */ new Map();
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
    })().finally(() => {
      this.#indexing = null;
    });
    return this.#indexing;
  }
  async #read(thread) {
    const root = await fs.realpath(this.#root);
    const original = await fs.realpath(thread.path);
    if (!inside(root, original)) return null;
    await this.#refreshIndex();
    for (const candidate of this.#index.get(thread.id) || [original]) {
      const file = await fs.realpath(candidate);
      if (!inside(root, file)) continue;
      const handle = await fs.open(file, "r");
      try {
        const stat = await handle.stat();
        let record = this.#records.get(thread.id);
        const reusable = record?.file === file && record.cwd === path.resolve(thread.cwd) && record.ino === stat.ino && stat.size >= record.offset;
        if (!reusable) {
          const head = Buffer.alloc(Math.min(MAX_LINE_BYTES, stat.size));
          const { bytesRead } = await handle.read(head, 0, head.length, 0);
          const end = head.indexOf(10);
          if (end < 0 || end >= bytesRead) continue;
          const meta = JSON.parse(head.subarray(0, end).toString("utf8"));
          if (meta.type !== "session_meta" || meta.payload?.id !== thread.id || path.resolve(meta.payload?.cwd || "") !== path.resolve(thread.cwd)) continue;
          if (stat.size > MAX_READ_BYTES) return null;
          record = {
            file,
            cwd: path.resolve(thread.cwd),
            ino: stat.ino,
            offset: 0,
            remainder: Buffer.alloc(0),
            turns: [],
            current: null,
            itemCount: 0,
            updatedAt: meta.timestamp,
            complete: true,
            usage: new RolloutUsage()
          };
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
            if (line.length > MAX_LINE_BYTES) {
              record.complete = false;
              continue;
            }
            if (!line.length) continue;
            let row;
            try {
              row = JSON.parse(line.toString("utf8"));
            } catch {
              record.complete = false;
              continue;
            }
            projectRow(record, row, notifications, thread.id);
          }
          if (buffer.length > MAX_LINE_BYTES) return null;
          record.remainder = buffer;
        }
        this.#records.delete(thread.id);
        this.#records.set(thread.id, record);
        while (this.#records.size > 8) this.#records.delete(this.#records.keys().next().value);
        if (!record.current || !record.complete) return null;
        return {
          file,
          turns: structuredClone(record.turns),
          currentTurn: structuredClone(record.current),
          updatedAt: record.updatedAt,
          notifications: reusable ? notifications : [],
          replaced: file !== original
        };
      } finally {
        await handle.close();
      }
    }
    return null;
  }
};
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function projectRow(record, row, notifications, threadId) {
  if (row.type !== "event_msg") return;
  const event = row.payload;
  if (!event || event.thread_id && event.thread_id !== threadId) return;
  if (event.type === "task_started" && event.turn_id) {
    const turn = {
      id: event.turn_id,
      status: "inProgress",
      startedAt: event.started_at ?? Date.parse(row.timestamp) / 1e3,
      completedAt: null,
      durationMs: null,
      items: []
    };
    record.turns.push(turn);
    record.current = turn;
    record.usage.start(turn, event.model_context_window);
    if (record.turns.length > 12) {
      record.itemCount -= record.turns.shift().items.length;
    }
    notifications.push(["turn/started", { threadId, turn: { ...turn, items: [] } }]);
  } else if (event.type === "token_count") {
    const turn = event.turn_id ? record.turns.find((turn2) => turn2.id === event.turn_id) : record.current;
    if (event.turn_id && !turn) return;
    if (!event.turn_id && record.turns.filter((turn2) => turn2.status === "inProgress").length > 1) return;
    if (record.usage.update(turn, event.info, row.timestamp) && turn) {
      notifications.push(["thread/tokenUsage/updated", {
        threadId,
        turnId: turn.id,
        tokenUsage: turn.tokenUsage,
        ...turn.turnUsage ? { turnUsage: turn.turnUsage } : {}
      }]);
    }
  } else if (event.type === "item_completed" || event.type === "item_started" || event.type === "item_updated") {
    const turn = record.turns.find((turn2) => turn2.id === event.turn_id);
    const item = rolloutItem(event.item);
    if (!turn || !item) return;
    const index = turn.items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) turn.items[index] = item;
    else {
      turn.items.push(item);
      record.itemCount += 1;
    }
    while (record.itemCount > 500) {
      record.turns.find((entry) => entry.items.length)?.items.shift();
      record.itemCount -= 1;
    }
    const method = event.type.replace("item_", "item/");
    notifications.push([method, { threadId, turnId: turn.id, item }]);
  } else if (event.type === "task_complete" || event.type === "turn_aborted") {
    const activeTurns = record.turns.filter((turn2) => turn2.status === "inProgress");
    const turn = event.turn_id ? record.turns.find((candidate) => candidate.id === event.turn_id) : activeTurns.length === 1 ? activeTurns[0] : null;
    if (!turn) return;
    const finalUsageCandidates = [
      event.info,
      event.usage,
      event.tokenUsage,
      event.token_usage
    ];
    let usageUpdated = false;
    for (const candidate of finalUsageCandidates) {
      if (candidate && record.usage.update(turn, candidate, row.timestamp)) {
        usageUpdated = true;
        break;
      }
    }
    if (usageUpdated) {
      notifications.push(["thread/tokenUsage/updated", {
        threadId,
        turnId: turn.id,
        tokenUsage: turn.tokenUsage,
        ...turn.turnUsage ? { turnUsage: turn.turnUsage } : {}
      }]);
    }
    turn.status = event.type === "turn_aborted" ? "interrupted" : event.error ? "failed" : "completed";
    turn.completedAt = event.completed_at ?? Date.parse(row.timestamp) / 1e3;
    turn.durationMs = event.duration_ms ?? Math.max(0, (turn.completedAt - turn.startedAt) * 1e3);
    if (event.error) turn.error = { message: String(event.error.message || "\u4EFB\u52A1\u6267\u884C\u5931\u8D25") };
    notifications.push(["turn/completed", { threadId, turn: { ...turn, items: [] } }]);
  }
  record.updatedAt = row.timestamp || record.updatedAt;
}

// server/pending-interactions.js
import { randomUUID } from "node:crypto";
var APPROVALS = /* @__PURE__ */ new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval"]);
var INPUTS = /* @__PURE__ */ new Set(["tool/requestUserInput", "item/tool/requestUserInput"]);
var PendingInteractions = class {
  entries = /* @__PURE__ */ new Map();
  add(message) {
    const existing = [...this.entries.values()].find((entry2) => entry2.backendId === message.id && entry2.method === message.method);
    if (existing) return existing;
    const entry = { approvalId: randomUUID(), backendId: message.id, method: message.method, kind: APPROVALS.has(message.method) ? "approval" : INPUTS.has(message.method) ? "userInput" : "desktop", params: message.params || {}, createdAt: (/* @__PURE__ */ new Date()).toISOString(), responding: false };
    if (entry.kind === "desktop") entry.params = { threadId: entry.params.threadId, turnId: entry.params.turnId, itemId: entry.params.itemId };
    if (this.entries.size >= 512) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(entry.approvalId, entry);
    return entry;
  }
  get(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new RelayError("APPROVAL_EXPIRED", "\u8BF7\u6C42\u5DF2\u7ECF\u5904\u7406\u6216\u8FDE\u63A5\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u4EFB\u52A1");
    return entry;
  }
  resolve(requestId, threadId) {
    const resolved = [];
    for (const [id, entry] of this.entries) {
      if (entry.backendId === requestId && (!threadId || entry.params.threadId === threadId)) {
        this.entries.delete(id);
        resolved.push(entry);
      }
    }
    return resolved;
  }
  clearThread(threadId, turnId) {
    const removed = [];
    for (const [id, entry] of this.entries) if (entry.params.threadId === threadId && (!turnId || entry.params.turnId === turnId)) {
      this.entries.delete(id);
      removed.push(entry);
    }
    return removed;
  }
  clear() {
    const removed = [...this.entries.values()];
    this.entries.clear();
    return removed;
  }
  public(entry, config) {
    return { approvalId: entry.approvalId, method: entry.method, kind: entry.kind, params: entry.params, createdAt: entry.createdAt, responding: entry.responding, canRespond: entry.kind !== "desktop" && !config.readOnly && config.permissions?.respondToApprovals === true };
  }
  validateResponse(entry, payload, kind) {
    if (entry.responding) throw new RelayError("APPROVAL_PENDING", "\u56DE\u7B54\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u7B49\u5F85\u540E\u7AEF\u786E\u8BA4");
    if (entry.kind !== kind) throw new RelayError("INVALID_MESSAGE", "\u54CD\u5E94\u7C7B\u578B\u4E0E\u8BF7\u6C42\u4E0D\u5339\u914D");
    if (kind === "approval") {
      const allowed = entry.params.availableDecisions?.filter((value) => typeof value === "string") || ["accept", "acceptForSession", "decline", "cancel"];
      if (!allowed.includes(payload.decision)) throw new RelayError("INVALID_MESSAGE", "\u5F53\u524D\u8BF7\u6C42\u4E0D\u652F\u6301\u6B64\u5BA1\u6279\u51B3\u5B9A");
      return { decision: payload.decision };
    }
    const questions = entry.params.questions || [];
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).some((id) => !questions.some((question) => question.id === id))) throw new RelayError("INVALID_MESSAGE", "\u95EE\u9898\u56DE\u7B54\u683C\u5F0F\u65E0\u6548");
    for (const question of questions) {
      const answer = answers[question.id]?.answers;
      if (!Array.isArray(answer) || answer.length === 0 || answer.length > 20 || answer.some((text3) => typeof text3 !== "string" || !text3.trim() || text3.length > 2e4)) throw new RelayError("INVALID_MESSAGE", "\u8BF7\u5B8C\u6574\u586B\u5199\u6BCF\u4E2A\u95EE\u9898\u7684\u56DE\u7B54");
    }
    return { answers };
  }
};

// server/composer-settings.js
function composerSettings(value) {
  const source = value?.threadSettings && typeof value.threadSettings === "object" ? value.threadSettings : value?.settings && typeof value.settings === "object" ? value.settings : value;
  if (!source || typeof source !== "object") return null;
  const settings = {};
  if (typeof source.model === "string" && source.model.trim()) settings.model = source.model.trim();
  const effort = source.effort ?? source.reasoningEffort ?? source.reasoning_effort ?? source.reasoning;
  if (effort !== void 0) settings.effort = effort;
  for (const key of [
    "approvalPolicy",
    "approval_policy",
    "approvalsReviewer",
    "activePermissionProfile",
    "permissions",
    "permissionMode",
    "permission_mode"
  ]) {
    if (source[key] !== void 0) settings[key] = source[key];
  }
  if (source.sandboxPolicy !== void 0 || source.sandbox !== void 0) {
    settings.sandboxPolicy = source.sandboxPolicy ?? source.sandbox;
  }
  return Object.keys(settings).length ? settings : null;
}
function composerSettingsPatch(command, config) {
  const patch = {};
  for (const key of ["model", "effort"]) {
    if (!Object.hasOwn(command, key)) continue;
    if (typeof command[key] !== "string" || !command[key].trim() || command[key].length > 256) {
      throw new RelayError("INVALID_MESSAGE", `${key} \u5FC5\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
    }
    patch[key] = command[key].trim();
  }
  if (Object.hasOwn(command, "permissionMode")) {
    if (!config.permissions.respondToApprovals) {
      throw new RelayError("COMMAND_NOT_ALLOWED", "\u8FDC\u7A0B\u6743\u9650 respondToApprovals \u672A\u542F\u7528\uFF0C\u4E0D\u80FD\u4FEE\u6539\u4EFB\u52A1\u6743\u9650");
    }
    const modes = {
      "\u9ED8\u8BA4\u6743\u9650": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "user" },
      "\u81EA\u52A8\u5BA1\u67E5": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "auto_review" },
      "\u5B8C\u5168\u8BBF\u95EE\u6743\u9650": { permissions: ":danger-full-access", approvalPolicy: "never", approvalsReviewer: "user" },
      "\u53EA\u8BFB\u6743\u9650": { permissions: ":read-only", approvalPolicy: "on-request", approvalsReviewer: "user" }
    };
    if (!Object.hasOwn(modes, command.permissionMode)) throw new RelayError("INVALID_MESSAGE", "\u4E0D\u652F\u6301\u7684\u6743\u9650\u6A21\u5F0F");
    Object.assign(patch, modes[command.permissionMode]);
  }
  if (!Object.keys(patch).length) throw new RelayError("INVALID_MESSAGE", "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u4EFB\u52A1\u8BBE\u7F6E");
  return patch;
}

// server/desktop-project-pins.js
import fs2 from "node:fs/promises";
import os2 from "node:os";
import path2 from "node:path";
var DesktopProjectPins = class {
  #file;
  #codexHome;
  #positions = /* @__PURE__ */ new Map();
  #pathPositions = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path2.join(os2.homedir(), ".codex") } = {}) {
    this.#codexHome = path2.resolve(codexHome);
    this.#file = path2.join(this.#codexHome, ".codex-global-state.json");
  }
  async enrich(result) {
    if (!Array.isArray(result?.data)) return result;
    try {
      const state = JSON.parse(await fs2.readFile(this.#file, "utf8"));
      if (state && typeof state === "object" && !Array.isArray(state)) {
        const ids = state["pinned-project-ids"] ?? [];
        if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
          const positions = [...new Set(ids)].map((id, index) => [id, index]);
          const mappings = state["app-server-project-id-by-legacy-project-id-by-host"];
          const hostMapping = mappings?.[`local:${this.#codexHome}`];
          const resolved = positions.map(([legacyId, index]) => [
            typeof hostMapping?.[legacyId] === "string" ? hostMapping[legacyId] : legacyId,
            index
          ]);
          this.#positions = new Map([...positions, ...resolved]);
          const localProjects = state["local-projects"];
          this.#pathPositions = new Map(positions.flatMap(([legacyId, index]) => {
            const roots = localProjects?.[legacyId]?.rootPaths;
            return Array.isArray(roots) ? roots.filter((root) => typeof root === "string" && root.trim()).map((root) => [path2.resolve(root), index]) : [];
          }));
        }
      }
    } catch {
    }
    return {
      ...result,
      data: result.data.map((project) => {
        if (!project || typeof project !== "object" || Array.isArray(project)) return project;
        let pinnedPosition = this.#positions.get(project.id);
        if (pinnedPosition === void 0) {
          const roots = Array.isArray(project.roots) ? project.roots : [];
          const candidates = project.path ? [project.path, ...roots] : roots;
          for (const root of candidates) {
            const projectPath = typeof root === "string" ? root : root?.path;
            if (typeof projectPath !== "string" || !projectPath.trim()) continue;
            pinnedPosition = this.#pathPositions.get(path2.resolve(projectPath));
            if (pinnedPosition !== void 0) break;
          }
        }
        return { ...project, isPinned: pinnedPosition !== void 0, pinnedPosition: pinnedPosition ?? null };
      })
    };
  }
};

// server/app-server-client.js
var execFileAsync = promisify(execFile);
var AppServerClient = class _AppServerClient extends EventEmitter2 {
  #transport = null;
  #generation = 0;
  #wanted = false;
  #retryTimer = null;
  #retryAttempt = 0;
  #subscriptions = /* @__PURE__ */ new Set();
  #connectionConfig = null;
  #requests = /* @__PURE__ */ new Map();
  #interactions = new PendingInteractions();
  #interrupts = /* @__PURE__ */ new Map();
  #nextId = 1;
  #starting = null;
  #paginatedThreads = null;
  #threadListSortMode = null;
  // `thread/read` only reads persisted history; it does not subscribe this
  // App Server connection to subsequent turn/item notifications. Keep track
  // of threads resumed in this process so a remote client can receive live
  // updates for a task that was originally opened by another Codex client.
  #resumedThreads = /* @__PURE__ */ new Set();
  #resumingThreads = /* @__PURE__ */ new Map();
  #resumeRetryAt = /* @__PURE__ */ new Map();
  #threadSettings = /* @__PURE__ */ new Map();
  #settingsRevision = 0;
  // Codex keeps authoritative token_count rows in the local rollout journal.
  // App Server history does not always project those rows into thread/read,
  // especially for a thread owned by Desktop. Keep a read-only journal
  // projection so Relay can recover per-turn usage without taking the writer.
  #rollouts;
  #projectPins;
  static MAX_RESUMED_THREADS = 1e3;
  static APPROVAL_METHODS = /* @__PURE__ */ new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval"
  ]);
  constructor(configStore, logger, options = {}) {
    super();
    this.options = options;
    this.#projectPins = new DesktopProjectPins({ codexHome: options.codexHome });
    this.#rollouts = new RolloutSnapshots({ codexHome: options.codexHome });
    this.configStore = configStore;
    this.logger = logger;
    this.state = "stopped";
    this.version = null;
    this.lastError = null;
  }
  status() {
    const config = this.#connectionConfig || this.configStore.get().codex;
    const transport = this.#transport;
    return {
      state: this.state,
      version: this.version,
      pid: transport?.pid || null,
      connectionMode: "managed",
      transport: "stdio",
      ownsProcess: Boolean(transport?.pid),
      endpoint: null,
      reconnectAttempt: this.#retryAttempt,
      nextRetryAt: this.nextRetryAt || null,
      subscribedThreads: this.#resumedThreads.size,
      lastError: this.lastError,
      pendingRequests: this.#requests.size,
      pendingApprovals: this.#interactions.entries.size
    };
  }
  async checkAvailability() {
    const codex = this.configStore.get().codex;
    const executable = codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 1e4 });
    this.version = (stdout || stderr).trim();
    return { executable, version: this.version, connectionMode: "managed", transport: "stdio" };
  }
  async start() {
    this.#wanted = true;
    if (this.#starting) return this.#starting;
    if (this.state === "ready") return this.status();
    if (this.#retryTimer) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u6B63\u5728\u91CD\u8FDE\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    const generation = ++this.#generation;
    const pending = this.#startInternal(generation);
    this.#starting = pending;
    try {
      return await pending;
    } finally {
      if (this.#starting === pending) this.#starting = null;
    }
  }
  #resetConnectionState() {
    this.#paginatedThreads = null;
    this.#threadListSortMode = null;
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
    this.#threadSettings.clear();
  }
  async #startInternal(generation) {
    const config = this.configStore.get().codex;
    this.#connectionConfig = { ...config };
    this.state = "starting";
    this.lastError = null;
    this.version = null;
    this.#resetConnectionState();
    let transport;
    try {
      await this.checkAvailability();
      transport = new StdioAppServerTransport(config);
      if (generation !== this.#generation || !this.#wanted) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      this.#transport = transport;
      transport.on("message", (line) => {
        if (this.#transport === transport) this.#handleLine(line);
      });
      transport.on("log", (message) => {
        if (message) this.logger.info("app-server", message);
      });
      transport.on("closed", (error) => this.#handleExit(transport, error));
      this.logger.info("app-server", "\u6B63\u5728\u542F\u52A8 Codex App Server");
      await transport.open();
      if (generation !== this.#generation || this.#transport !== transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      const initialized = await this.request("initialize", {
        clientInfo: { name: "codex-relay-plugin", title: "Codex Relay Plugin", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      }, this.options.initializeTimeoutMs || 15e3);
      this.notify("initialized", {});
      this.version = this.version || initialized?.serverInfo?.version || initialized?.userAgent || null;
      for (const id of [...this.#subscriptions]) {
        if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server \u8FDE\u63A5\u6062\u590D\u5DF2\u53D6\u6D88");
        try {
          await this.resumeThread(id);
        } catch (error) {
          if (!transport.writable) throw error;
          this.#subscriptions.delete(id);
          this.logger.warn("app-server", "\u4EFB\u52A1\u8BA2\u9605\u6062\u590D\u5931\u8D25\uFF0C\u7B49\u5F85\u5BA2\u6237\u7AEF\u91CD\u65B0\u8BFB\u53D6", { threadId: id, message: error.message });
        }
      }
      if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      this.state = "ready";
      this.#retryAttempt = 0;
      this.nextRetryAt = null;
      this.lastError = null;
      this.emit("status", this.status());
      return this.status();
    } catch (error) {
      if (this.#transport === transport) this.#transport = null;
      await transport?.close();
      if (generation === this.#generation && this.#wanted) {
        this.lastError = error.message;
        this.state = "error";
        this.#scheduleReconnect();
        this.emit("status", this.status());
      }
      throw error;
    }
  }
  #scheduleReconnect() {
    if (!this.#wanted) return;
    this.state = "reconnecting";
    if (this.#retryTimer) return;
    const delay = Math.min(
      this.options.reconnectMaxMs || 3e4,
      (this.options.reconnectBaseMs || 500) * 2 ** Math.min(this.#retryAttempt++, 8) * (0.8 + Math.random() * 0.4)
    );
    this.nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.nextRetryAt = null;
      if (this.#starting) {
        this.#scheduleReconnect();
        return;
      }
      this.start().catch((error) => this.logger.warn("app-server", "App Server \u91CD\u8FDE\u5931\u8D25", { message: error.message }));
    }, delay);
    this.#retryTimer.unref();
  }
  #rejectRequests(error) {
    for (const pending of this.#requests.values()) pending.reject(error);
    this.#requests.clear();
    for (const entry of this.#interactions.clear()) this.emit("interactionResolved", { ...this.#interactions.public(entry, this.configStore.get()), reason: "connectionClosed" });
  }
  async stop() {
    this.#wanted = false;
    ++this.#generation;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#retryAttempt = 0;
    this.nextRetryAt = null;
    this.#subscriptions.clear();
    this.#rollouts.clear();
    this.#resetConnectionState();
    const transport = this.#transport;
    this.#transport = null;
    this.state = "stopped";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u505C\u6B62"));
    await transport?.close();
    await this.#starting?.catch(() => {
    });
    this.#connectionConfig = null;
    this.version = null;
    this.emit("status", this.status());
  }
  request(method, params = {}, timeoutMs = 3e4) {
    if (!this.#transport?.writable) {
      return Promise.reject(new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id);
        reject(new RelayError("APP_SERVER_TIMEOUT", `${method} \u8BF7\u6C42\u8D85\u65F6`));
      }, timeoutMs);
      this.#requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      try {
        this.#write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        const pending = this.#requests.get(id);
        this.#requests.delete(id);
        pending?.reject(error);
      }
    });
  }
  notify(method, params = {}) {
    this.#write({ jsonrpc: "2.0", method, params });
  }
  async listThreads(params = {}) {
    const limit = Math.min(Number(params.limit || 50), 100);
    const requestedSortKey = params.sortKey || "recency_at";
    const requestedSortDirection = params.sortDirection || "desc";
    const useDefaultSort = params.sortKey == null && params.sortDirection == null;
    let effectiveSortKey = requestedSortKey;
    let includeSortDirection = true;
    if (useDefaultSort && this.#threadListSortMode) {
      [effectiveSortKey, includeSortDirection] = this.#threadListSortMode;
    }
    const requestPage = (cursor2) => this.request("thread/list", {
      cursor: cursor2,
      limit,
      sortKey: effectiveSortKey,
      ...includeSortDirection ? { sortDirection: requestedSortDirection } : {},
      ...params.cwd ? { cwd: params.cwd } : {}
    });
    const requestFirstPage = async () => {
      if (useDefaultSort && this.#threadListSortMode) {
        return requestPage(null);
      }
      try {
        const result = await requestPage(null);
        if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
        return result;
      } catch (error) {
        if (requestedSortKey !== "recency_at" || !isUnsupportedThreadSort(error)) {
          throw error;
        }
        const fallbacks = [
          ["recency_at", false],
          ["updated_at", true],
          ["updated_at", false]
        ];
        let lastError = error;
        for (const [sortKey, withDirection] of fallbacks) {
          effectiveSortKey = sortKey;
          includeSortDirection = withDirection;
          try {
            const result = await requestPage(null);
            if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
            return result;
          } catch (fallbackError) {
            if (!isUnsupportedThreadSort(fallbackError)) throw fallbackError;
            lastError = fallbackError;
          }
        }
        throw lastError;
      }
    };
    const first = params.cursor != null ? await requestPage(params.cursor) : await requestFirstPage();
    if (params.cursor != null) return first;
    if (!first || !Array.isArray(first.data)) return first;
    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor ? first.nextCursor : null;
    const seenCursors = /* @__PURE__ */ new Set();
    for (let page = 1; cursor && page < 1e3; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) {
        cursor = null;
      } else {
        cursor = nextCursor;
      }
    }
    return {
      ...first,
      // Some App Server builds can repeat a historical thread at a page
      // boundary while the on-disk index is being updated. The thread id is
      // the thread id is the stable identity across paginated responses;
      // collapse duplicates
      // before exposing the catalog so clients do not render two rows for one
      // task during eventual convergence.
      data: sortThreadList(
        dedupeThreadList(data),
        requestedSortDirection,
        effectiveSortKey
      ),
      nextCursor: null
    };
  }
  listModels(params = {}) {
    return this.request("model/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 100), 100),
      includeHidden: params.includeHidden === true
    });
  }
  async listProjects(params = {}) {
    const limit = Math.min(Number(params.limit || 100), 100);
    const requestPage = (cursor2) => this.request("project/list", {
      cursor: cursor2,
      limit
    });
    if (params.cursor != null) return this.#projectPins.enrich(await requestPage(params.cursor));
    const first = await requestPage(null);
    if (!first || !Array.isArray(first.data)) return first;
    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor ? first.nextCursor : null;
    const seenCursors = /* @__PURE__ */ new Set();
    for (let page = 1; cursor && page < 1e3; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      cursor = !nextCursor || nextCursor === cursor ? null : nextCursor;
    }
    return this.#projectPins.enrich({
      ...first,
      data: sortProjectList(dedupeProjectList(data)),
      nextCursor: null
    });
  }
  async readThread(threadId) {
    return this.readThreadSnapshot(threadId);
  }
  /**
   * Read the persisted thread snapshot without trying to acquire the thread
   * writer or subscribe this connection to future notifications.
   *
   * The official desktop client owns some threads through its private stdio
   * App Server. Those threads are still readable from the persisted Codex
   * history, but `thread/resume` is rejected with an active-writer error.
   * Relay reads used for reconciliation must therefore be side-effect free;
   * starting a new turn remains responsible for resuming the thread when
   * necessary.
   */
  async readThreadSnapshot(threadId) {
    const id = normalizeThreadId(threadId);
    const result = this.#paginatedThreads === true ? await this.#readPaginatedThread(id) : await this.request("thread/read", { threadId: id, includeTurns: true }).catch(async (error) => {
      if (!isPaginatedThreadReadError(error)) throw error;
      this.#paginatedThreads = true;
      return this.#readPaginatedThread(id);
    });
    return this.#reconcileRolloutUsage(result);
  }
  // Unlike readThread(), this explicitly disables includeTurns. Codex still
  // returns the current thread status, but does not stream the full history.
  // The Relay client uses it as a cheap heartbeat for a selected task. The
  // explicit false also keeps older non-paginated servers from falling back
  // to their full-history default. Status reads never acquire a writer unless
  // a caller explicitly requests a local subscription.
  async readThreadStatus(threadId, { ensureResumed = false } = {}) {
    const id = normalizeThreadId(threadId);
    if (ensureResumed) await this.ensureThreadResumed(id);
    const result = await this.request("thread/read", { threadId: id, includeTurns: false });
    return this.#reconcileRolloutUsage(result);
  }
  async #reconcileRolloutUsage(result) {
    const thread = result?.thread || result;
    if (!thread || typeof thread !== "object") return result;
    const snapshot = await this.#rollouts.read(thread);
    if (!snapshot) return result;
    for (const [method, params] of snapshot.notifications || []) {
      if (method === "thread/tokenUsage/updated") this.emit("notification", method, params);
    }
    const sourceTurns = Array.isArray(snapshot.turns) ? snapshot.turns : [];
    const targetTurns = Array.isArray(thread.turns) ? thread.turns : [];
    const byId = new Map(targetTurns.map((turn) => [turn?.id, turn]));
    let changed = false;
    for (const source of sourceTurns) {
      if (!source?.id || !source.turnUsage && !source.tokenUsage) continue;
      const target = byId.get(source.id);
      if (!target) continue;
      if (!target.turnUsage && source.turnUsage) {
        target.turnUsage = source.turnUsage;
        changed = true;
      }
      if (!target.tokenUsage && source.tokenUsage) {
        target.tokenUsage = source.tokenUsage;
        changed = true;
      }
    }
    if (!changed) return result;
    const hydrated = { ...thread, turns: targetTurns };
    return result?.thread ? { ...result, thread: hydrated } : hydrated;
  }
  /** Metadata-only persisted read used by snapshot reconciliation. */
  readThreadStatusSnapshot(threadId) {
    return this.readThreadStatus(threadId, { ensureResumed: false });
  }
  /**
   * Ensure this App Server process is subscribed to a historical thread.
   *
   * Codex's `thread/read` endpoint is intentionally non-resuming: it returns
   * the stored snapshot but does not attach the connection to future
   * notifications. Resuming loads a writer in this App Server; it does not
   * subscribe to a different App Server's live output. Concurrent
   * status/read calls share one resume request, and the completed set avoids
   * issuing a resume on every two-second heartbeat.
   */
  ensureThreadResumed(threadId) {
    const id = normalizeThreadId(threadId);
    if (this.#resumedThreads.has(id)) return Promise.resolve();
    const retryAt = this.#resumeRetryAt.get(id) || 0;
    if (retryAt > Date.now()) return Promise.resolve();
    const existing = this.#resumingThreads.get(id);
    if (existing) return existing;
    const pending = this.resumeThread(id).then(() => {
      this.#rememberResumedThread(id);
      this.#resumeRetryAt.delete(id);
    }).catch((error) => {
      if (!isActiveWriterConflict(error)) throw error;
      this.#rememberResumeRetry(id, Date.now() + 6e4);
      this.logger.warn("app-server", "\u4EFB\u52A1\u6B63\u5728\u5176\u4ED6 Codex \u5BA2\u6237\u7AEF\u8FD0\u884C\uFF0C\u6682\u4EE5\u5FEB\u7167\u540C\u6B65", {
        threadId: id
      });
    }).finally(() => {
      if (this.#resumingThreads.get(id) === pending) {
        this.#resumingThreads.delete(id);
      }
    });
    this.#resumingThreads.set(id, pending);
    return pending;
  }
  // Call only after the command router has checked project access.
  async subscribeThread(_threadId) {
    return false;
  }
  #rememberResumedThread(id) {
    this.#subscriptions.delete(id);
    this.#subscriptions.add(id);
    while (this.#subscriptions.size > _AppServerClient.MAX_RESUMED_THREADS) {
      const retired = this.#subscriptions.values().next().value;
      this.#subscriptions.delete(retired);
      this.request("thread/unsubscribe", { threadId: retired }).catch(() => {
      });
    }
    this.#resumedThreads.delete(id);
    this.#resumedThreads.add(id);
    while (this.#resumedThreads.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumedThreads.delete(this.#resumedThreads.values().next().value);
    }
  }
  #rememberResumeRetry(id, retryAt) {
    this.#resumeRetryAt.delete(id);
    this.#resumeRetryAt.set(id, retryAt);
    while (this.#resumeRetryAt.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumeRetryAt.delete(this.#resumeRetryAt.keys().next().value);
    }
  }
  async #readPaginatedThread(threadId) {
    const metadata = await this.request("thread/read", { threadId });
    const turns = await this.#readAllThreadTurns(threadId);
    const metadataMap = isObject(metadata) ? metadata : {};
    const thread = isObject(metadataMap.thread) ? metadataMap.thread : metadataMap;
    const hydrated = { ...thread, turns };
    return isObject(metadataMap.thread) ? { ...metadataMap, thread: hydrated } : hydrated;
  }
  async #readAllThreadTurns(threadId) {
    const turns = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/turns/list", {
        threadId,
        cursor,
        limit: 100,
        sortDirection: "asc",
        itemsView: "full"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const turn of data) {
        if (!isObject(turn)) continue;
        const items = turn.itemsView === "full" && Array.isArray(turn.items) ? turn.items : await this.#readAllThreadItems(threadId, turn.id);
        turns.push({ ...turn, items });
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return turns;
  }
  async #readAllThreadItems(threadId, turnId) {
    if (typeof turnId !== "string" || !turnId) return [];
    const items = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/items/list", {
        threadId,
        turnId,
        cursor,
        limit: 100,
        sortDirection: "asc"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const entry of data) {
        if (isObject(entry?.item)) items.push(entry.item);
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return items;
  }
  async createThread({ cwd } = {}) {
    const result = await this.request("thread/start", { ...cwd ? { cwd } : {} });
    const id = result?.thread?.id || result?.id;
    if (id) {
      this.#rememberResumedThread(normalizeThreadId(id));
      this.#rememberThreadSettings(id, result);
    }
    return { ...result, ...this.threadSettings(id) ? { threadSettings: this.threadSettings(id) } : {} };
  }
  async resumeThread(threadId) {
    const id = normalizeThreadId(threadId);
    const transport = this.#transport;
    const previousSettings = this.#threadSettings.get(id);
    const result = await this.request("thread/resume", { threadId: id });
    if (transport !== this.#transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u4EFB\u52A1\u8BA2\u9605\u7684\u8FDE\u63A5\u5DF2\u8FC7\u671F");
    this.#rememberResumedThread(id);
    if (this.#threadSettings.get(id) === previousSettings) this.#rememberThreadSettings(id, result);
    return result;
  }
  threadSettings(threadId) {
    const value = this.#threadSettings.get(threadId);
    return value ? structuredClone(value) : null;
  }
  /** Refresh the process-local composer cache from an authoritative read. */
  rememberThreadSettings(threadId, value) {
    this.#rememberThreadSettings(threadId, value);
  }
  #rememberThreadSettings(threadId, value) {
    const settings = composerSettings(value);
    if (!settings || !threadId) return;
    const id = normalizeThreadId(threadId);
    if (!id) return;
    const previous = this.#threadSettings.get(id) || {};
    this.#threadSettings.delete(id);
    this.#threadSettings.set(id, {
      ...previous,
      ...settings,
      revision: ++this.#settingsRevision
    });
    while (this.#threadSettings.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#threadSettings.delete(this.#threadSettings.keys().next().value);
    }
  }
  async updateThreadSettings(threadId, patch) {
    const id = normalizeThreadId(threadId);
    await this.ensureThreadResumed(id);
    const previous = this.#threadSettings.get(id);
    await this.request("thread/settings/update", { threadId: id, ...patch });
    if (this.#threadSettings.get(id) === previous) await this.resumeThread(id);
    if (!this.threadSettings(id)) throw new RelayError("APP_SERVER_ERROR", "Codex \u672A\u8FD4\u56DE\u4EFB\u52A1\u8BBE\u7F6E\uFF0C\u8BF7\u5347\u7EA7 Codex \u540E\u91CD\u8BD5");
    return { threadId: id, threadSettings: this.threadSettings(id) };
  }
  async startTurn({ threadId, text: text3, cwd, model, effort, images = [] }) {
    const id = normalizeThreadId(threadId);
    const params = {
      threadId: id,
      input: [...text3 ? [{ type: "text", text: text3 }] : [], ...images],
      ...cwd ? { cwd } : {},
      ...model ? { model } : {},
      ...effort ? { effort } : {}
    };
    try {
      const result = await this.request("turn/start", params);
      this.#rememberResumedThread(id);
      return result;
    } catch (error) {
      if (!isThreadNotLoadedError(error)) throw error;
      await this.resumeThread(id);
      return this.request("turn/start", params);
    }
  }
  steerTurn({ threadId, turnId, text: text3 }) {
    return this.request("turn/steer", {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: "text", text: text3 }]
    });
  }
  async interruptTurn({ threadId, turnId }) {
    const key = JSON.stringify([threadId, turnId]);
    if (this.#interrupts.has(key)) return this.#interrupts.get(key);
    const generation = this.#generation;
    const execute = async () => {
      const deadline = Date.now() + (this.options.interruptRetryMs ?? 5e3);
      while (true) {
        if (generation !== this.#generation || !this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u505C\u6B62\u8BF7\u6C42\u672A\u786E\u8BA4\uFF0C\u8BF7\u6062\u590D\u8FDE\u63A5\u540E\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001");
        const recent = await this.request("thread/turns/list", { threadId, limit: 2, sortDirection: "desc", itemsView: "notLoaded" }).catch(async (error) => {
          if (!isActiveWriterConflict(error)) throw error;
          return { data: (await this.readThreadSnapshot(threadId)).thread?.turns || [] };
        });
        const turns = recent.data || [];
        const target = turns.find((turn) => turn.id === turnId);
        if (target && ["completed", "failed", "interrupted"].includes(target.status)) return { threadId, turnId, status: "alreadyFinished", turnStatus: target.status };
        if (turns.some((turn) => turn.id !== turnId && ["inProgress", "in_progress"].includes(turn.status))) throw new RelayError("TURN_CHANGED", "\u5F53\u524D\u8F6E\u6B21\u5DF2\u7ECF\u6539\u53D8\uFF0C\u672A\u4E2D\u65AD\u65B0\u7684\u4EFB\u52A1");
        if (!target) {
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "\u627E\u4E0D\u5230\u6307\u5B9A\u8F6E\u6B21\uFF0C\u672A\u4E2D\u65AD\u5176\u4ED6\u4EFB\u52A1\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
          await new Promise((resolve) => setTimeout(resolve, this.options.interruptPollMs ?? 100));
          continue;
        }
        try {
          await this.request("turn/interrupt", { threadId, turnId });
          return { threadId, turnId, status: "requested" };
        } catch (error) {
          if (error.code !== "APP_SERVER_ERROR" || !/no active turn to interrupt/i.test(error.message)) throw error;
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "\u5C1A\u672A\u786E\u8BA4\u4EFB\u52A1\u5F00\u59CB\u6267\u884C\uFF0C\u505C\u6B62\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
          await new Promise((resolve) => setTimeout(resolve, this.options.interruptPollMs ?? 100));
        }
      }
    };
    const pending = execute().finally(() => this.#interrupts.delete(key));
    this.#interrupts.set(key, pending);
    return pending;
  }
  pendingInteractions(threadId) {
    return [...this.#interactions.entries.values()].filter((entry) => entry.params.threadId === threadId).map((entry) => this.#interactions.public(entry, this.configStore.get()));
  }
  getInteraction(approvalId) {
    return this.#interactions.get(approvalId);
  }
  respondToApproval(approvalId, decision) {
    return this.#respondToInteraction(approvalId, { decision }, "approval");
  }
  respondToUserInput(approvalId, answers) {
    return this.#respondToInteraction(approvalId, { answers }, "userInput");
  }
  #respondToInteraction(approvalId, payload, kind) {
    const entry = this.#interactions.get(approvalId);
    const result = this.#interactions.validateResponse(entry, payload, kind);
    this.#write({ jsonrpc: "2.0", id: entry.backendId, result });
    entry.responding = true;
    this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
    return { approvalId, status: "submitted" };
  }
  #write(message) {
    if (!this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C");
    this.#transport.send(JSON.stringify(message));
  }
  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.warn("app-server", "\u5FFD\u7565\u975E JSON \u8F93\u51FA", { line });
      return;
    }
    if (message.id !== void 0 && !message.method) {
      const pending = this.#requests.get(message.id);
      if (!pending) return;
      this.#requests.delete(message.id);
      if (message.error) pending.reject(new RelayError("APP_SERVER_ERROR", message.error.message || "App Server \u8BF7\u6C42\u5931\u8D25", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== void 0 && message.method) {
      if (!_AppServerClient.APPROVAL_METHODS.has(message.method) && !["tool/requestUserInput", "item/tool/requestUserInput"].includes(message.method)) {
        this.logger.warn("app-server", "\u62D2\u7EDD\u4E0D\u53D7\u652F\u6301\u7684 App Server \u5BA2\u6237\u7AEF\u8BF7\u6C42", { method: message.method });
        this.#write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Client request not supported: ${message.method}` }
        });
        return;
      }
      if (!message.params?.threadId) return;
      const entry = this.#interactions.add(message);
      this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
      return;
    }
    let resolved = [];
    if (message.method === "serverRequest/resolved") resolved = this.#interactions.resolve(message.params?.requestId, message.params?.threadId);
    if (message.method === "turn/completed") resolved = this.#interactions.clearThread(message.params?.threadId, message.params?.turn?.id);
    if (message.method === "thread/closed" || message.method === "thread/deleted") {
      this.#resumedThreads.delete(message.params?.threadId);
      this.#subscriptions.delete(message.params?.threadId);
      resolved = this.#interactions.clearThread(message.params?.threadId);
    }
    for (const entry of resolved) this.emit("interactionResolved", this.#interactions.public(entry, this.configStore.get()));
    if (message.method === "thread/settings/updated") {
      this.#rememberThreadSettings(message.params?.threadId, message.params?.threadSettings);
      message.params = { threadId: message.params?.threadId, threadSettings: this.threadSettings(message.params?.threadId) };
    }
    if (message.method) this.emit("notification", message.method, message.params || {});
  }
  #handleExit(transport, error) {
    if (this.#transport !== transport) return;
    this.#transport = null;
    this.#resetConnectionState();
    this.lastError = error.message;
    this.state = "error";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u4E2D\u65AD\uFF1B\u672A\u786E\u8BA4\u7684\u547D\u4EE4\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1"));
    transport.close().catch(() => {
    });
    this.#scheduleReconnect();
    this.emit("status", this.status());
  }
};
function normalizeThreadId(threadId) {
  const id = typeof threadId === "string" ? threadId.trim() : String(threadId || "").trim();
  if (!id) throw new RelayError("INVALID_MESSAGE", "threadId \u4E0D\u80FD\u4E3A\u7A7A");
  return id;
}
function dedupeThreadList(threads) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  const indexes = /* @__PURE__ */ new Map();
  for (const thread of threads) {
    if (!isObject(thread)) {
      unique.push(thread);
      continue;
    }
    const rawId = thread.id ?? thread.threadId ?? thread.thread_id;
    const id = typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id) {
      unique.push(thread);
      continue;
    }
    if (seen.has(id)) {
      const index = indexes.get(id);
      const previous = index == null ? null : unique[index];
      if (previous && threadRecency(thread) > threadRecency(previous)) {
        unique[index] = thread;
      }
      continue;
    }
    seen.add(id);
    indexes.set(id, unique.length);
    unique.push(thread);
  }
  return unique;
}
function sortThreadList(threads, direction = "desc", sortKey = "recency_at") {
  const hasTimestamp = (thread) => [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at"
  ].some((key) => timestampValue(thread?.[key]) !== null);
  if (!threads.every(hasTimestamp)) return [...threads];
  const factor = direction === "asc" ? -1 : 1;
  const primaryKeys = sortKey === "updated_at" ? ["updatedAt", "updated_at", "createdAt", "created_at"] : ["recencyAt", "recency_at", "updatedAt", "updated_at", "createdAt", "created_at"];
  return [...threads].sort((left, right) => {
    const recency = threadTimestamp(right, primaryKeys) - threadTimestamp(left, primaryKeys);
    if (recency !== 0) return factor * recency;
    const updated = threadTimestamp(right, ["updatedAt", "updated_at"]) - threadTimestamp(left, ["updatedAt", "updated_at"]);
    if (updated !== 0) return factor * updated;
    const created = threadTimestamp(right, ["createdAt", "created_at"]) - threadTimestamp(left, ["createdAt", "created_at"]);
    if (created !== 0) return factor * created;
    const leftId = String(left?.id ?? left?.threadId ?? left?.thread_id ?? "");
    const rightId = String(right?.id ?? right?.threadId ?? right?.thread_id ?? "");
    return factor * rightId.localeCompare(leftId);
  });
}
function dedupeProjectList(projects) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const project of projects) {
    if (!isObject(project)) {
      unique.push(project);
      continue;
    }
    const id = String(project.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(project);
  }
  return unique;
}
function sortProjectList(projects) {
  if (!projects.every((project) => Number.isFinite(Number(project?.position)))) {
    return [...projects];
  }
  return [...projects].sort((left, right) => {
    const position = Number(left.position) - Number(right.position);
    if (position !== 0) return position;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}
function threadRecency(thread) {
  return threadTimestamp(thread, [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at"
  ]);
}
function threadTimestamp(thread, keys) {
  for (const key of keys) {
    const value = thread?.[key];
    const timestamp = timestampValue(value);
    if (timestamp !== null) return timestamp;
  }
  return 0;
}
function timestampValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) < 1e11 ? value * 1e3 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) < 1e11 ? numeric * 1e3 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function isUnsupportedThreadSort(error) {
  if (error?.code && error.code !== "APP_SERVER_ERROR") return false;
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("recency_at") || message.includes("sortdirection") || message.includes("sort direction") || message.includes("sort key") || message.includes("sort_key") || message.includes("unsupported sort") || message.includes("unknown sort");
}
function isActiveWriterConflict(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && /already has an active writer/i.test(error.message);
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}
function isThreadNotLoadedError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && /\bthread\s+not\s+found\b/i.test(error.message);
}

// server/command-router.js
import { createHash as createHash3 } from "node:crypto";

// server/utils.js
import crypto from "node:crypto";
import path3 from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = path3.resolve(path3.dirname(fileURLToPath(import.meta.url)), "..");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
function redact(value) {
  if (typeof value === "string") {
    return value.replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]").replace(/("?(?:token|connect[_-]?token|endpoint[_-]?grant|grant|secret|authorization|api[_-]?key|private[_-]?key|signature)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[REDACTED]");
  }
  return JSON.parse(redact(JSON.stringify(value)));
}
function normalizeRelayUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws:// \u6216 wss://");
  }
  if (!url.hostname) throw new Error("Relay \u5730\u5740\u7F3A\u5C11\u4E3B\u673A\u540D");
  if (url.username || url.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  if (url.search || url.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/v1/connect";
  if (url.pathname !== "/v1/connect") throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 /v1/connect");
  return url.toString();
}
function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "localhost"].includes(hostname);
}
function safeProjectPath(projectPath, allowedProjects) {
  if (!projectPath) return null;
  const candidate = path3.resolve(projectPath);
  if (!allowedProjects?.length) return candidate;
  const allowed = allowedProjects.some((root) => {
    const normalizedRoot = path3.resolve(root);
    const relative = path3.relative(normalizedRoot, candidate);
    return relative === "" || !relative.startsWith("..") && !path3.isAbsolute(relative);
  });
  return allowed ? candidate : null;
}
function filterThreadList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((thread) => Boolean(thread?.cwd && safeProjectPath(thread.cwd, allowedProjects)))
  };
}
function filterProjectList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((project) => {
      const roots = Array.isArray(project?.roots) ? project.roots : [];
      return roots.some((root) => {
        const projectPath = typeof root === "string" ? root : root?.path;
        return Boolean(projectPath && safeProjectPath(projectPath, allowedProjects));
      });
    })
  };
}

// server/config-store.js
import fs5 from "node:fs/promises";
import os3 from "node:os";
import path6 from "node:path";

// server/secret-store.js
import crypto2 from "node:crypto";
import fs3 from "node:fs/promises";
import path4 from "node:path";
var SecretStore = class {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path4.join(configDir, "secrets.json");
    this.cache = /* @__PURE__ */ new Map();
    this.writeQueue = Promise.resolve();
  }
  async get(spaceId) {
    const credential = await this.getCredential(spaceId);
    return credential?.connectToken || null;
  }
  async getCredential(spaceId) {
    const key = spaceId || "default";
    const environmentToken = process.env.CODEX_RELAY_TOKEN?.trim();
    if (environmentToken) {
      const persisted = await this.getPersistedCredential(key);
      const candidate = {
        ...persisted || {},
        connectToken: environmentToken
      };
      if (persisted?.connectToken && persisted.connectToken !== environmentToken) {
        delete candidate.expiresAt;
      }
      const credential = validateCredential(candidate);
      return cloneCredential(credential);
    }
    return this.getPersistedCredential(key);
  }
  /**
   * Read the credential written to disk without applying the optional
   * CODEX_RELAY_TOKEN runtime override.  Refresh responses must use this view
   * when they need authoritative expiry metadata; otherwise an environment
   * token would mask the newly rotated token forever.
   */
  async getPersistedCredential(spaceId) {
    const key = spaceId || "default";
    if (this.cache.has(key)) return cloneCredential(this.cache.get(key));
    const values = await this.#readFallback();
    const credential = values[key] ? validateCredential(values[key]) : null;
    this.cache.set(key, credential);
    return cloneCredential(credential);
  }
  async set(spaceId, credential) {
    const key = spaceId || "default";
    if (!credential) return this.delete(key);
    const normalized = validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return { backend: "file" };
    });
  }
  async update(spaceId, patch, expectedCredential) {
    const key = spaceId || "default";
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("Relay \u51ED\u8BC1\u66F4\u65B0\u683C\u5F0F\u65E0\u6548");
    }
    if (Object.keys(patch).length === 0) return this.getPersistedCredential(key);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      const persisted = values[key] ? validateCredential(values[key]) : null;
      const current = persisted || {};
      if (expectedCredential && !matchesCredential(current, expectedCredential)) {
        return null;
      }
      const next = { ...current, ...patch };
      if (Object.hasOwn(patch, "connectToken") && (patch.connectToken === "" || patch.connectToken === null || patch.connectToken === void 0)) {
        delete next.connectToken;
        delete next.expiresAt;
      }
      if (Object.hasOwn(patch, "endpointGrant") && (patch.endpointGrant === "" || patch.endpointGrant === null || patch.endpointGrant === void 0)) {
        delete next.endpointGrant;
        delete next.grantExpiresAt;
      }
      if (Object.hasOwn(patch, "connectToken") && typeof patch.connectToken === "string" && patch.connectToken.trim() && patch.connectToken !== current.connectToken && !Object.hasOwn(patch, "expiresAt")) {
        delete next.expiresAt;
      }
      if (Object.hasOwn(patch, "endpointGrant") && typeof patch.endpointGrant === "string" && patch.endpointGrant.trim() && patch.endpointGrant !== current.endpointGrant && !Object.hasOwn(patch, "grantExpiresAt")) {
        delete next.grantExpiresAt;
      }
      for (const name of ["expiresAt", "grantExpiresAt", "tokenEndpoint"]) {
        if (next[name] === null || next[name] === "" || next[name] === void 0) {
          delete next[name];
        }
      }
      for (const name of Object.keys(next)) {
        if (next[name] === void 0) delete next[name];
      }
      if (!Object.keys(next).length) {
        delete values[key];
        await this.#writeFallback(values);
        this.cache.set(key, null);
        return null;
      }
      const normalized = validateCredential(next);
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return cloneCredential(normalized);
    });
  }
  validate(credential) {
    return validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
  }
  async delete(spaceId) {
    const key = spaceId || "default";
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      delete values[key];
      await this.#writeFallback(values);
      this.cache.set(key, null);
    });
  }
  async #readFallback() {
    try {
      return JSON.parse(await fs3.readFile(this.fallbackFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async #writeFallback(values) {
    await fs3.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.fallbackFile}.${process.pid}.${crypto2.randomUUID()}.tmp`;
    await fs3.writeFile(temporary, `${JSON.stringify(values, null, 2)}
`, { mode: 384 });
    await fs3.rename(temporary, this.fallbackFile);
    await fs3.chmod(this.fallbackFile, 384);
  }
  #enqueue(operation) {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => void 0);
    return next;
  }
};
function validateCredential(value) {
  if (typeof value === "string") value = { connectToken: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Relay \u51ED\u8BC1\u683C\u5F0F\u65E0\u6548");
  }
  const connectToken = validateSecret(value.connectToken, "Connect Token", false);
  const endpointGrant = validateSecret(value.endpointGrant, "Endpoint Grant", false);
  if (!connectToken && !endpointGrant) throw new Error("Connect Token \u6216 Endpoint Grant \u81F3\u5C11\u9700\u8981\u4E00\u4E2A");
  const expiresAt = validateExpiry(value.expiresAt, "Connect Token");
  const grantExpiresAt = validateExpiry(value.grantExpiresAt, "Endpoint Grant");
  const tokenEndpoint = validateTokenEndpoint(value.tokenEndpoint);
  return {
    ...connectToken === void 0 ? {} : { connectToken },
    ...expiresAt === void 0 ? {} : { expiresAt },
    ...endpointGrant === void 0 ? {} : { endpointGrant },
    ...grantExpiresAt === void 0 ? {} : { grantExpiresAt },
    ...tokenEndpoint === void 0 ? {} : { tokenEndpoint }
  };
}
function validateSecret(value, label, required) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new Error(`${label} \u4E0D\u80FD\u4E3A\u7A7A`);
    return void 0;
  }
  const minimum = label === "Endpoint Grant" ? 16 : 1;
  if (typeof value !== "string" || value.length < minimum || value.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} \u683C\u5F0F\u65E0\u6548`);
  }
  return value;
}
function validateExpiry(value, label) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} \u8FC7\u671F\u65F6\u95F4\u65E0\u6548`);
  return value;
}
function validateTokenEndpoint(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Token Endpoint \u65E0\u6548");
  const endpoint = new URL(value);
  if (!endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Token Endpoint \u4E0D\u80FD\u5305\u542B\u51ED\u8BC1\u3001query \u6216 hash");
  }
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
    throw new Error("\u975E\u672C\u673A Token Endpoint \u5FC5\u987B\u4F7F\u7528 https://");
  }
  return endpoint.toString();
}
function cloneCredential(value) {
  return value ? { ...value } : null;
}
function matchesCredential(current, expected) {
  const candidate = typeof expected === "string" ? { connectToken: expected } : expected;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const expectedValue = candidate[field];
    if (expectedValue === null || expectedValue === void 0) {
      if (current?.[field] !== void 0) return false;
    } else if (current?.[field] !== expectedValue) {
      return false;
    }
  }
  return true;
}

// server/endpoint-identity-store.js
import crypto3 from "node:crypto";
import fs4 from "node:fs/promises";
import path5 from "node:path";
var EndpointIdentityStore = class {
  constructor(configDir) {
    this.configDir = configDir;
    this.file = path5.join(configDir, "endpoint-identity.json");
    this.identity = null;
  }
  async get() {
    if (this.identity) return { ...this.identity };
    try {
      this.identity = this.#validate(JSON.parse(await fs4.readFile(this.file, "utf8")));
      await fs4.chmod(this.file, 384);
      return { ...this.identity };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pair = crypto3.generateKeyPairSync("ed25519");
    const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
    const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const identity = {
      schemaVersion: 1,
      publicKey: Buffer.from(publicDer).subarray(-32).toString("base64url"),
      privateKey: Buffer.from(privateDer).toString("base64url")
    };
    await fs4.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.file}.${process.pid}.${crypto3.randomUUID()}.tmp`;
    await fs4.writeFile(temporary, `${JSON.stringify(identity, null, 2)}
`, { mode: 384 });
    await fs4.rename(temporary, this.file);
    await fs4.chmod(this.file, 384);
    this.identity = identity;
    return { ...identity };
  }
  #validate(value) {
    if (!value || value.schemaVersion !== 1) throw new Error("Endpoint identity schema is invalid");
    const publicBytes = Buffer.from(value.publicKey || "", "base64url");
    const privateBytes = Buffer.from(value.privateKey || "", "base64url");
    if (publicBytes.length !== 32 || publicBytes.toString("base64url") !== value.publicKey || privateBytes.length < 32 || privateBytes.toString("base64url") !== value.privateKey) {
      throw new Error("Endpoint identity key material is invalid");
    }
    return { schemaVersion: 1, publicKey: value.publicKey, privateKey: value.privateKey };
  }
};

// server/config-store.js
var DEFAULT_PERMISSIONS = Object.freeze({
  readThreads: true,
  sendMessages: true,
  createThreads: true,
  steerTurns: true,
  interruptTurns: true,
  respondToApprovals: false
});
function defaultConfig() {
  return {
    version: 1,
    relay: {
      url: "",
      spaceId: "",
      endpointId: "",
      deviceId: randomId("host"),
      deviceName: os3.hostname(),
      autoConnect: false,
      heartbeatSeconds: 20,
      reconnectMaxSeconds: 30
    },
    codex: {
      executable: "codex",
      autoStartAppServer: true,
      defaultWorkingDirectory: ""
    },
    permissions: { ...DEFAULT_PERMISSIONS },
    allowedProjects: [],
    readOnly: false
  };
}
var ConfigStore = class {
  constructor({ configDir, logger } = {}) {
    this.configDir = configDir || process.env.CODEX_RELAY_CONFIG_DIR || path6.join(os3.homedir(), ".codex-relay-plugin");
    this.configFile = path6.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.endpointIdentityStore = new EndpointIdentityStore(this.configDir);
    this.config = null;
  }
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs5.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const migrated = migrateSavedConfig(saved);
    this.config = mergeConfig(defaultConfig(), migrated);
    validateConfig(this.config);
    if (migrated !== saved) {
      await fs5.mkdir(this.configDir, { recursive: true, mode: 448 });
      await fs5.writeFile(this.configFile, `${JSON.stringify(this.config, null, 2)}
`, { mode: 384 });
      await fs5.chmod(this.configFile, 384);
    }
    return this.config;
  }
  get() {
    if (!this.config) throw new Error("\u914D\u7F6E\u5C1A\u672A\u52A0\u8F7D");
    return structuredClone(this.config);
  }
  preview(patch) {
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    return next;
  }
  async publicConfig({ includeToken = false } = {}) {
    const config = this.get();
    const credential = await this.secretStore.getCredential(relaySpaceId(config.relay));
    const identity = await this.endpointIdentityStore.get();
    const credentialConfigured = Boolean(credential?.connectToken || credential?.endpointGrant);
    return {
      ...config,
      relay: {
        ...config.relay,
        ...includeToken ? {
          token: credential?.connectToken || "",
          ...credential?.endpointGrant ? { endpointGrant: credential.endpointGrant } : {}
        } : {},
        tokenConfigured: Boolean(credential?.connectToken),
        credentialConfigured,
        tokenExpiresAt: credential?.expiresAt || null,
        endpointGrantConfigured: Boolean(credential?.endpointGrant),
        grantExpiresAt: credential?.grantExpiresAt || null,
        tokenEndpoint: credential?.tokenEndpoint || "",
        endpointPublicKey: identity.publicKey
      }
    };
  }
  async update(patch, credentialPatch) {
    const next = this.preview(patch);
    const nextSpace = relaySpaceId(next.relay);
    let credentialTouched = false;
    if (credentialPatch !== void 0) {
      credentialTouched = true;
      if (typeof credentialPatch === "string") credentialPatch = { connectToken: credentialPatch };
      if (!credentialPatch || typeof credentialPatch !== "object" || Array.isArray(credentialPatch)) {
        throw new Error("Relay Token \u51ED\u8BC1\u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      if (Object.hasOwn(credentialPatch, "token")) {
        throw new Error("Relay Token \u5FC5\u987B\u901A\u8FC7\u5B57\u7B26\u4E32\u6216 connectToken \u5B57\u6BB5\u63D0\u4F9B");
      }
      if (Object.keys(credentialPatch).length === 0) credentialTouched = false;
      const current = credentialTouched ? await this.secretStore.getPersistedCredential(nextSpace) || {} : {};
      const credential = { ...current };
      if (Object.hasOwn(credentialPatch, "connectToken")) {
        const nextToken = credentialPatch.connectToken;
        if (nextToken === null || nextToken === "" || nextToken === void 0) {
          delete credential.connectToken;
          delete credential.expiresAt;
        } else if (typeof nextToken === "string" && nextToken.trim()) {
          if (nextToken !== current.connectToken) delete credential.expiresAt;
          credential.connectToken = nextToken;
        } else {
          throw new Error("Connect Token \u683C\u5F0F\u65E0\u6548");
        }
      }
      if (Object.hasOwn(credentialPatch, "expiresAt")) {
        if (credentialPatch.expiresAt === null || credentialPatch.expiresAt === "" || credentialPatch.expiresAt === void 0) delete credential.expiresAt;
        else credential.expiresAt = credentialPatch.expiresAt;
      }
      for (const name of ["endpointGrant", "grantExpiresAt", "tokenEndpoint"]) {
        if (!Object.hasOwn(credentialPatch, name)) continue;
        const value = credentialPatch[name];
        if (value === "" || value === null || value === void 0) {
          delete credential[name];
        } else {
          if (name === "endpointGrant" && value !== current.endpointGrant && !Object.hasOwn(credentialPatch, "grantExpiresAt")) {
            delete credential.grantExpiresAt;
          }
          credential[name] = value;
        }
      }
      if (Object.keys(credential).length) this.secretStore.validate(credential);
    }
    await fs5.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.configFile}.tmp`;
    await fs5.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    await fs5.rename(temporary, this.configFile);
    await fs5.chmod(this.configFile, 384);
    this.config = next;
    if (credentialTouched) {
      await this.secretStore.update(nextSpace, credentialPatch);
    }
    this.logger?.info("config", "\u914D\u7F6E\u5DF2\u4FDD\u5B58", { relayUrl: next.relay.url, spaceId: nextSpace });
    return this.publicConfig();
  }
  async relayCredential(options = {}) {
    const spaceId = relaySpaceId(this.get().relay);
    if (options?.ignoreEnvironment === true) {
      return this.secretStore.getPersistedCredential(spaceId);
    }
    return this.secretStore.getCredential(spaceId);
  }
  async persistedRelayCredential() {
    return this.secretStore.getPersistedCredential(relaySpaceId(this.get().relay));
  }
  async token() {
    const credential = await this.relayCredential();
    return credential?.connectToken || null;
  }
  async updateRelayCredential(patch, expectedCredential) {
    const spaceId = relaySpaceId(this.get().relay);
    return this.secretStore.update(spaceId, patch, expectedCredential);
  }
  async endpointIdentity() {
    return this.endpointIdentityStore.get();
  }
};
function mergeConfig(base, patch) {
  const relayPatch = patch.relay || {};
  const spaceId = relayPatch.spaceId ?? base.relay.spaceId ?? "";
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...relayPatch, spaceId },
    codex: {
      executable: patch.codex?.executable ?? base.codex.executable,
      autoStartAppServer: patch.codex?.autoStartAppServer ?? base.codex.autoStartAppServer,
      defaultWorkingDirectory: patch.codex?.defaultWorkingDirectory ?? base.codex.defaultWorkingDirectory
    },
    permissions: { ...base.permissions, ...patch.permissions || {} },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects
  };
}
function relaySpaceId(relay) {
  return String(relay?.spaceId || "");
}
function relayEndpointId(relay) {
  return String(relay?.endpointId || "");
}
function migrateSavedConfig(saved) {
  if (!saved || typeof saved !== "object") return saved;
  let migrated = saved;
  if (saved.codex && typeof saved.codex === "object" && (Object.hasOwn(saved.codex, "connectionMode") || Object.hasOwn(saved.codex, "appServerEndpoint"))) {
    const { connectionMode: _connectionMode, appServerEndpoint: _appServerEndpoint, ...codex } = saved.codex;
    migrated = { ...migrated, codex };
  }
  if (!saved.relay || typeof saved.relay !== "object") return migrated;
  if (Object.hasOwn(saved.relay, "endpointId")) return migrated;
  const legacyDeviceId = typeof saved.relay.deviceId === "string" ? saved.relay.deviceId : "";
  const endpointId = legacyDeviceId && !legacyDeviceId.startsWith("host_") ? legacyDeviceId : "";
  return { ...migrated, relay: { ...migrated.relay, endpointId } };
}
function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("\u914D\u7F6E\u7248\u672C\u65E0\u6548");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay \u914D\u7F6E\u65E0\u6548");
  if (config.relay.url) {
    const normalizedRelayUrl = normalizeRelayUrl(config.relay.url);
    const relayUrl = new URL(normalizedRelayUrl);
    config.relay.url = normalizedRelayUrl;
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("\u975E\u672C\u673A Relay \u5FC5\u987B\u4F7F\u7528 wss:// \u52A0\u5BC6\u8FDE\u63A5");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
    if (relayUrl.search || relayUrl.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  }
  const spaceId = relaySpaceId(config.relay);
  if (spaceId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(spaceId)) {
    throw new Error("Space ID \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u5192\u53F7\u548C\u8FDE\u5B57\u7B26");
  }
  const endpointId = relayEndpointId(config.relay);
  if (typeof config.relay.endpointId !== "string") throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (endpointId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(endpointId)) throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.deviceId || "")) throw new Error("\u5185\u90E8\u4E3B\u673A\u8EAB\u4EFD ID \u65E0\u6548");
  const heartbeat = Number(config.relay.heartbeatSeconds);
  if (!Number.isFinite(heartbeat) || heartbeat < 5 || heartbeat > 300) {
    throw new Error("\u5FC3\u8DF3\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 300 \u79D2\u4E4B\u95F4");
  }
  const reconnectMax = Number(config.relay.reconnectMaxSeconds);
  if (!Number.isFinite(reconnectMax) || reconnectMax < 5 || reconnectMax > 600) {
    throw new Error("\u6700\u5927\u91CD\u8FDE\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 600 \u79D2\u4E4B\u95F4");
  }
  if (typeof config.relay.deviceName !== "string" || config.relay.deviceName.length > 128) {
    throw new Error("\u8BBE\u5907\u540D\u79F0\u65E0\u6548");
  }
  if (typeof config.relay.autoConnect !== "boolean") throw new Error("\u81EA\u52A8\u8FDE\u63A5\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.codex || typeof config.codex !== "object") throw new Error("Codex \u914D\u7F6E\u65E0\u6548");
  if (typeof config.codex.executable !== "string" || !config.codex.executable.trim()) throw new Error("Codex \u547D\u4EE4\u65E0\u6548");
  if (typeof config.codex.defaultWorkingDirectory !== "string") throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u65E0\u6548");
  if (config.codex.defaultWorkingDirectory && !path6.isAbsolute(config.codex.defaultWorkingDirectory)) {
    throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
  }
  if (typeof config.codex.autoStartAppServer !== "boolean") throw new Error("App Server \u81EA\u52A8\u542F\u52A8\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.permissions || typeof config.permissions !== "object") throw new Error("\u8FDC\u7A0B\u6743\u9650\u914D\u7F6E\u65E0\u6548");
  for (const name of Object.keys(DEFAULT_PERMISSIONS)) {
    if (typeof config.permissions[name] !== "boolean") throw new Error(`\u8FDC\u7A0B\u6743\u9650 ${name} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
  }
  if (typeof config.readOnly !== "boolean") throw new Error("\u53EA\u8BFB\u6A21\u5F0F\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!Array.isArray(config.allowedProjects)) throw new Error("\u9879\u76EE\u767D\u540D\u5355\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const project of config.allowedProjects) {
    if (typeof project !== "string" || !path6.isAbsolute(project)) throw new Error(`\u9879\u76EE\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${project}`);
  }
  return config;
}

// server/protocol.js
var PROTOCOL_VERSION = 1;
function validateRelayWelcome(message) {
  if (!message || typeof message !== "object" || message.type !== "connect.welcome") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u6D88\u606F\u65E0\u6548");
  }
  if (message.version !== PROTOCOL_VERSION) {
    throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "Relay \u8FD4\u56DE\u4E86\u4E0D\u517C\u5BB9\u7684\u534F\u8BAE\u7248\u672C");
  }
  if (!message.connectionId || typeof message.connectionId !== "string") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11 connectionId");
  }
  if (!message.sessionId || !message.spaceId || !message.endpointId) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11 sessionId\u3001spaceId \u6216 endpointId");
  }
  if (!Number.isSafeInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
  }
  return message;
}
var PRODUCT_FRAME_TYPES = /* @__PURE__ */ new Set(["codex.command", "codex.command.result", "codex.event", "host.snapshot"]);
function wrapRelayFrame(message, config) {
  if (!message || typeof message !== "object" || message.type === "stream.message") return message;
  if (!PRODUCT_FRAME_TYPES.has(message.type)) return message;
  return {
    version: PROTOCOL_VERSION,
    type: "stream.message",
    messageId: message.messageId || randomId("msg"),
    streamId: message.streamId || "codex",
    sequence: Number.isInteger(message.sequence) ? message.sequence : void 0,
    // Relay's directed-routing key is the authenticated Endpoint ID. The
    // legacy host deviceId remains product metadata, but must not be used as
    // the transport-level source/target identity.
    from: relayEndpointId(config.relay),
    ...message.targetDeviceId ? { to: message.targetDeviceId } : {},
    protocol: "codex.v1",
    encrypted: false,
    payload: message
  };
}
function unwrapRelayFrame(message) {
  if (!message || message.type !== "stream.message" || !message.payload || typeof message.payload !== "object") return message;
  const payload = { ...message.payload };
  if (message.from) payload.deviceId = message.from;
  if (message.to) payload.targetDeviceId = message.to;
  return payload;
}
var COMMAND_PERMISSIONS = Object.freeze({
  "host.get_status": "readThreads",
  "model.list": "readThreads",
  "project.list": "readThreads",
  "workspace.search": "readThreads",
  "skills.list": "readThreads",
  "thread.list": "readThreads",
  "thread.read": "readThreads",
  // A metadata-only status read keeps the mobile timeline in sync without
  // transferring the complete (potentially very large) thread history.
  "thread.status": "readThreads",
  "thread.create": "createThreads",
  "thread.resume": "readThreads",
  "thread.select": "readThreads",
  "thread.settings.update": "sendMessages",
  "turn.start": "sendMessages",
  "image.upload.begin": "sendMessages",
  "image.upload.append": "sendMessages",
  "image.upload.finish": "sendMessages",
  "image.upload.remove": "sendMessages",
  "turn.steer": "steerTurns",
  "turn.interrupt": "interruptTurns",
  "approval.respond": "respondToApprovals",
  "userInput.respond": "respondToApprovals",
  "sync.request": "readThreads",
  ping: null
});
function validateRelayCommand(message, config) {
  if (!message || typeof message !== "object") throw new RelayError("INVALID_MESSAGE", "\u547D\u4EE4\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  if (message.version !== PROTOCOL_VERSION) throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "\u4E0D\u652F\u6301\u7684\u534F\u8BAE\u7248\u672C");
  if (message.type !== "codex.command") throw new RelayError("INVALID_MESSAGE", "\u6D88\u606F\u7C7B\u578B\u5FC5\u987B\u662F codex.command");
  if (!message.requestId || typeof message.requestId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11 requestId");
  if (!message.deviceId || typeof message.deviceId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11\u53D1\u9001\u7AEF deviceId");
  if (message.targetDeviceId !== relayEndpointId(config.relay)) throw new RelayError("DEVICE_NOT_TARGETED", "\u547D\u4EE4\u672A\u53D1\u9001\u7ED9\u672C\u673A\u63A5\u5165\u7AEF");
  if (message.spaceId !== relaySpaceId(config.relay)) throw new RelayError("SPACE_NOT_JOINED", "\u547D\u4EE4 Space \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  const commandType = message.command?.type;
  if (!Object.hasOwn(COMMAND_PERMISSIONS, commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${commandType || "unknown"}`);
  }
  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1e3) {
    throw new RelayError("MESSAGE_EXPIRED", "\u547D\u4EE4\u65F6\u95F4\u6233\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  }
  const permission = COMMAND_PERMISSIONS[commandType];
  if (config.readOnly && !["host.get_status", "model.list", "project.list", "workspace.search", "skills.list", "thread.list", "thread.read", "thread.status", "thread.resume", "thread.select", "sync.request", "ping"].includes(commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", "\u63D2\u4EF6\u5F53\u524D\u5904\u4E8E\u53EA\u8BFB\u6A21\u5F0F");
  }
  if (permission && !config.permissions[permission]) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u8FDC\u7A0B\u6743\u9650 ${permission} \u672A\u542F\u7528`);
  }
  return message;
}
function eventEnvelope(config, buffer, event, context = {}) {
  return buffer.push({
    version: PROTOCOL_VERSION,
    type: "codex.event",
    eventId: randomId("evt"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    sequence: buffer.nextSequence(),
    timestamp: nowIso(),
    ...context.threadId ? { threadId: context.threadId } : {},
    ...context.turnId ? { turnId: context.turnId } : {},
    event
  });
}
function commandResult(config, requestId, result, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId,
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
    timestamp: nowIso(),
    success: true,
    result
  };
}
function commandError(config, requestId, error, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId: requestId || randomId("invalid"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
    timestamp: nowIso(),
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "\u672A\u77E5\u9519\u8BEF",
      ...error.details === void 0 ? {} : { details: error.details }
    }
  };
}
function normalizeCodexNotification(method, params = {}) {
  const map = {
    "thread/started": "thread.created",
    "thread/status/changed": "thread.updated",
    "thread/settings/updated": "thread.settings.updated",
    "thread/queue/changed": "thread.queue.changed",
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/diff/updated": "diff.updated",
    "thread/tokenUsage/updated": "usage.updated",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/started": "item.started",
    "item/updated": "item.updated",
    "item/completed": "item.completed",
    error: "error"
  };
  const type = map[method];
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params
  };
}
function extractContext(params = {}) {
  const thread = params.thread || {};
  const turn = params.turn || {};
  const item = params.item || {};
  return {
    threadId: params.threadId || thread.id || item.threadId,
    turnId: params.turnId || turn.id || item.turnId
  };
}

// server/command-journal.js
import fs6 from "node:fs/promises";
import path7 from "node:path";
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
var MUTATING_COMMANDS = /* @__PURE__ */ new Set(["thread.create", "thread.settings.update", "turn.start", "turn.steer", "turn.interrupt", "approval.respond", "userInput.respond"]);
var hash = (value) => createHash("sha256").update(value).digest("hex");
var CommandJournal = class {
  constructor(configDir) {
    this.directory = configDir ? path7.join(configDir, "command-journal") : null;
  }
  file(config, message) {
    const scope = JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId || config.relay.deviceId, config.codex.executable]);
    return path7.join(this.directory, `${hash(`${scope}:${message.deviceId}:${message.requestId}`)}.json`);
  }
  async begin(config, message, fingerprint) {
    if (!this.directory || !MUTATING_COMMANDS.has(message.command.type)) return null;
    await fs6.mkdir(this.directory, { recursive: true, mode: 448 });
    const file = this.file(config, message);
    const signature = hash(fingerprint);
    try {
      const saved = JSON.parse(await fs6.readFile(file, "utf8"));
      if (saved.fingerprint !== signature) throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
      if (saved.response) return { file, response: saved.response };
      throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u8BE5\u547D\u4EE4\u53EF\u80FD\u5DF2\u88AB\u540E\u7AEF\u63A5\u53D7\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\u6838\u5BF9\u7ED3\u679C\uFF0C\u7CFB\u7EDF\u4E0D\u4F1A\u91CD\u590D\u6267\u884C", { threadId: message.threadId || message.command.threadId, command: message.command.type });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await this.#write(file, { fingerprint: signature, createdAt: Date.now(), command: message.command.type }, true);
    } catch (error) {
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
    const temporary = `${file}.${randomUUID2()}.tmp`;
    const handle = await fs6.open(temporary, "wx", 384);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      if (exclusive) {
        await fs6.link(temporary, file);
        await fs6.unlink(temporary);
      } else await fs6.rename(temporary, file);
      const directory = await fs6.open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs6.rm(temporary, { force: true });
    }
  }
  async prune() {
    if (!this.directory) return;
    const files = await fs6.readdir(this.directory).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json(?:\..*\.tmp)?$/.test(name)) continue;
      const file = path7.join(this.directory, name);
      const stat = await fs6.stat(file).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 864e5) await fs6.rm(file, { force: true });
    }
  }
};

// server/image-uploads.js
import fs7 from "node:fs/promises";
import path8 from "node:path";
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
var IMAGE_INPUT_LIMITS = Object.freeze({ version: 1, maxImages: 4, maxBytes: 6 * 1024 * 1024, chunkBytes: 96 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] });
var TTL = 24 * 60 * 60 * 1e3;
var hash2 = (value) => createHash2("sha256").update(value).digest("hex");
var invalid = (message) => new RelayError("INVALID_IMAGE", message);
var imageName = (meta) => `image.${{ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[meta.mime]}`;
var ImageUploads = class {
  #tail = Promise.resolve();
  constructor(configDir) {
    this.directory = configDir ? path8.join(configDir, "image-uploads") : null;
  }
  run(action) {
    const result = this.#tail.catch(() => {
    }).then(action);
    this.#tail = result;
    return result;
  }
  owner(config, envelope) {
    return hash2(JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId, envelope.deviceId]));
  }
  folder(id) {
    if (!this.directory) throw new RelayError("IMAGE_UPLOAD_UNAVAILABLE", "\u56FE\u7247\u5B58\u50A8\u672A\u914D\u7F6E");
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw invalid("\u56FE\u7247\u6807\u8BC6\u65E0\u6548");
    return path8.join(this.directory, id);
  }
  async read(id, owner) {
    let meta;
    try {
      meta = JSON.parse(await fs7.readFile(path8.join(this.folder(id), "meta.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new RelayError("IMAGE_UPLOAD_EXPIRED", "\u56FE\u7247\u4E0A\u4F20\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u8BD5\u4E0A\u4F20");
    }
    if (meta.owner !== owner) throw new RelayError("IMAGE_ACCESS_DENIED", "\u56FE\u7247\u4E0D\u5C5E\u4E8E\u5F53\u524D\u63A5\u5165\u7AEF");
    return meta;
  }
  async save(id, meta) {
    const temporary = path8.join(this.folder(id), `${randomUUID3()}.tmp`);
    await fs7.writeFile(temporary, JSON.stringify(meta), { mode: 384 });
    await fs7.rename(temporary, path8.join(this.folder(id), "meta.json"));
  }
  begin(command, owner, context) {
    return this.run(async () => {
      const { uploadId: id, mime, size, sha256 } = command;
      const directory = this.folder(id);
      if (!IMAGE_INPUT_LIMITS.mimeTypes.includes(mime) || !Number.isSafeInteger(size) || size <= 0 || size > IMAGE_INPUT_LIMITS.maxBytes || !/^[a-f0-9]{64}$/.test(sha256 || "")) throw invalid("\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC7 6 MB \u7684 PNG\u3001JPEG \u6216 WebP \u56FE\u7247");
      await fs7.mkdir(this.directory, { recursive: true, mode: 448 });
      await this.prune();
      const definition = { owner, mime, size, sha256, cwd: context.cwd, threadId: context.threadId || null };
      try {
        const meta = await this.read(id, owner);
        if (Object.keys(definition).some((key) => meta[key] !== definition[key])) throw invalid("\u4E0A\u4F20\u6807\u8BC6\u5DF2\u7528\u4E8E\u5176\u4ED6\u56FE\u7247\u6216\u4EFB\u52A1");
        const stat = await fs7.stat(path8.join(directory, meta.ready ? imageName(meta) : "partial"));
        return { uploadId: id, offset: stat.size, ready: !!meta.ready };
      } catch (error) {
        if (error.code !== "IMAGE_UPLOAD_EXPIRED") throw error;
      }
      let pendingBytes = 0;
      let pendingCount = 0;
      for (const name of await fs7.readdir(this.directory)) {
        const meta = await fs7.readFile(path8.join(this.directory, name, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
        if (meta && !meta.retained) {
          pendingBytes += meta.size;
          pendingCount++;
        }
      }
      if (pendingCount >= 32 || pendingBytes + size > 96 * 1024 * 1024) throw new RelayError("IMAGE_UPLOAD_QUOTA", "\u5F85\u53D1\u9001\u56FE\u7247\u8FC7\u591A\uFF0C\u8BF7\u5148\u53D1\u9001\u6216\u5220\u9664\u5DF2\u6709\u9644\u4EF6");
      await fs7.mkdir(directory, { mode: 448 });
      await fs7.writeFile(path8.join(directory, "partial"), Buffer.alloc(0), { flag: "wx", mode: 384 });
      await this.save(id, { ...definition, createdAt: Date.now(), ready: false });
      return { uploadId: id, offset: 0, ready: false };
    });
  }
  append(command, owner) {
    return this.run(async () => {
      const { uploadId: id, offset, data } = command;
      const meta = await this.read(id, owner);
      if (!Number.isSafeInteger(offset) || offset < 0 || typeof data !== "string" || data.length > Math.ceil(IMAGE_INPUT_LIMITS.chunkBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw invalid("\u56FE\u7247\u5206\u5757\u65E0\u6548");
      const bytes = Buffer.from(data, "base64");
      if (!bytes.length || bytes.toString("base64") !== data || offset + bytes.length > meta.size) throw invalid("\u56FE\u7247\u5206\u5757\u5927\u5C0F\u65E0\u6548");
      const file = path8.join(this.folder(id), meta.ready ? imageName(meta) : "partial");
      const handle = await fs7.open(file, "r+");
      try {
        const stat = await handle.stat();
        if (offset < stat.size && offset + bytes.length <= stat.size) {
          const previous = Buffer.alloc(bytes.length);
          await handle.read(previous, 0, previous.length, offset);
          if (!previous.equals(bytes)) throw invalid("\u91CD\u590D\u56FE\u7247\u5206\u5757\u5185\u5BB9\u4E0D\u4E00\u81F4");
        } else {
          if (meta.ready || offset !== stat.size) throw invalid("\u56FE\u7247\u5206\u5757\u987A\u5E8F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u6062\u590D\u4E0A\u4F20");
          let written = 0;
          while (written < bytes.length) {
            const result = await handle.write(bytes, written, bytes.length - written, offset + written);
            written += result.bytesWritten;
          }
          await handle.sync();
        }
      } finally {
        await handle.close();
      }
      return { offset: (await fs7.stat(file)).size };
    });
  }
  finish(id, owner) {
    return this.run(async () => {
      const meta = await this.read(id, owner);
      const directory = this.folder(id);
      const source = path8.join(directory, meta.ready ? imageName(meta) : "partial");
      const bytes = await fs7.readFile(source);
      if (bytes.length !== meta.size || hash2(bytes) !== meta.sha256 || sniffImageMime(bytes) !== meta.mime) throw invalid("\u56FE\u7247\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6216\u4E0A\u4F20");
      if (!meta.ready) await fs7.copyFile(source, path8.join(directory, imageName(meta)));
      await this.save(id, { ...meta, ready: true });
      await fs7.rm(path8.join(directory, "partial"), { force: true });
      return { attachmentId: id };
    });
  }
  remove(id, owner) {
    return this.run(async () => {
      const meta = await this.read(id, owner);
      if (!meta.retained) await fs7.rm(this.folder(id), { recursive: true, force: true });
      return { removed: !meta.retained };
    });
  }
  resolve(ids, owner, context) {
    return this.run(async () => {
      if (!Array.isArray(ids) || !ids.length || ids.length > IMAGE_INPUT_LIMITS.maxImages || new Set(ids).size !== ids.length) throw invalid("\u6BCF\u6761\u6D88\u606F\u6700\u591A\u6DFB\u52A0 4 \u5F20\u56FE\u7247");
      const images = [];
      for (const id of ids) {
        const meta = await this.read(id, owner);
        if (!meta.ready || meta.cwd !== context.cwd || meta.threadId && meta.threadId !== context.threadId) throw invalid("\u56FE\u7247\u672A\u4E0A\u4F20\u5B8C\u6210\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4EFB\u52A1\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20");
        images.push({ id, meta });
      }
      for (const { id, meta } of images) await this.save(id, { ...meta, retained: true, threadId: context.threadId });
      return images.map(({ id, meta }) => ({ type: "localImage", path: path8.join(this.folder(id), imageName(meta)) }));
    });
  }
  async prune() {
    for (const name of await fs7.readdir(this.directory)) {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(name)) continue;
      const directory = this.folder(name);
      const meta = await fs7.readFile(path8.join(directory, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
      const stat = await fs7.stat(directory).catch(() => null);
      if (!meta?.retained && stat && Date.now() - (meta?.createdAt || stat.mtimeMs) > TTL) await fs7.rm(directory, { recursive: true, force: true });
    }
  }
};
function sniffImageMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

// server/workspace-tools.js
import fs8 from "node:fs/promises";
import os4 from "node:os";
import path9 from "node:path";
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "build",
  ".dart_tool",
  "dist",
  ".cache",
  ".next",
  "coverage"
]);
var MAX_DEPTH = 8;
var MAX_RESULTS = 100;
var MAX_SKILLS = 200;
var MAX_DESCRIPTION = 360;
function text2(value, fallback = "") {
  const result = typeof value === "string" ? value.trim() : "";
  return result || fallback;
}
function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}
function assertWorkspaceRoot(cwd, allowedProjects) {
  const root = safeProjectPath(text2(cwd), allowedProjects);
  if (!root) throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u5DE5\u4F5C\u533A\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
  return root;
}
function relativeReference(root, value) {
  const raw = text2(value).replaceAll("\\", path9.sep);
  if (!raw || path9.isAbsolute(raw)) throw new RelayError("INVALID_MESSAGE", "\u5DE5\u4F5C\u533A\u5F15\u7528\u5FC5\u987B\u662F\u76F8\u5BF9\u8DEF\u5F84");
  const resolved = path9.resolve(root, raw);
  const relative = path9.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path9.isAbsolute(relative)) {
    throw new RelayError("PROJECT_NOT_ALLOWED", "\u5DE5\u4F5C\u533A\u5F15\u7528\u8D85\u51FA\u5F53\u524D\u9879\u76EE\u8303\u56F4");
  }
  return { absolute: resolved, relative: relative.split(path9.sep).join("/") };
}
async function searchWorkspace({ cwd, query = "", kind = "all", limit, cursor, allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  const wantedKind = ["file", "directory", "all"].includes(kind) ? kind : "all";
  const needle = text2(query).toLowerCase().slice(0, 160);
  const pageSize = boundedInteger(limit, 40, MAX_RESULTS);
  const start = Number.isSafeInteger(Number(cursor)) && Number(cursor) >= 0 ? Number(cursor) : 0;
  const result = [];
  let visited = 0;
  async function visit(directory, depth) {
    if (depth > MAX_DEPTH || result.length >= pageSize + 1) return;
    let entries;
    try {
      entries = await fs8.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EACCES") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path9.join(directory, entry.name);
      const relative = path9.relative(root, absolute).split(path9.sep).join("/");
      const entryKind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
      if ((wantedKind === "all" || wantedKind === entryKind) && (!needle || relative.toLowerCase().includes(needle))) {
        if (visited >= start && result.length < pageSize + 1) {
          let size;
          if (entryKind === "file") {
            try {
              size = (await fs8.stat(absolute)).size;
            } catch {
            }
          }
          result.push({ path: relative, name: entry.name, kind: entryKind, ...size === void 0 ? {} : { size } });
        }
        visited += 1;
      }
      if (entry.isDirectory()) await visit(absolute, depth + 1);
      if (result.length >= pageSize + 1) return;
    }
  }
  await visit(root, 0);
  const hasMore = result.length > pageSize;
  const data = result.slice(0, pageSize);
  return { data, ...hasMore ? { nextCursor: String(start + data.length) } : {} };
}
function descriptionFromMarkdown(markdown) {
  const body = markdown.replace(/^---[\s\S]*?---\s*/u, "").trim();
  const paragraph = body.split(/\n\s*\n/u).map((item) => item.replace(/^#+\s*/u, "").replace(/\s+/gu, " ").trim()).find(Boolean);
  return (paragraph || "").slice(0, MAX_DESCRIPTION);
}
async function readSkillDirectory(parent, name, source) {
  const directory = path9.join(parent, name);
  let stat;
  try {
    stat = await fs8.stat(directory);
  } catch {
    return null;
  }
  if (!stat.isDirectory() || name.startsWith(".")) return null;
  try {
    const markdown = await fs8.readFile(path9.join(directory, "SKILL.md"), "utf8");
    return { name, description: descriptionFromMarkdown(markdown), source, path: directory };
  } catch {
    return null;
  }
}
async function listSkills({ cwd, allowedProjects, codexHome = process.env.CODEX_HOME || path9.join(os4.homedir(), ".codex") }) {
  const roots = [];
  if (cwd) {
    const workspace = assertWorkspaceRoot(cwd, allowedProjects);
    roots.push({ path: path9.join(workspace, ".codex", "skills"), source: "workspace" });
  }
  roots.push({ path: path9.join(codexHome, "skills"), source: "global" });
  const skills = /* @__PURE__ */ new Map();
  for (const root of roots) {
    let entries;
    try {
      entries = await fs8.readdir(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkillDirectory(root.path, entry.name, root.source);
      if (skill && !skills.has(skill.name)) skills.set(skill.name, skill);
    }
  }
  return { data: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_SKILLS) };
}
async function resolveWorkspaceReferences({ cwd, references = [], allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  if (!Array.isArray(references) || references.length > 20) throw new RelayError("INVALID_MESSAGE", "\u5DE5\u4F5C\u533A\u5F15\u7528\u6570\u91CF\u65E0\u6548");
  const resolved = [];
  for (const value of references) {
    const ref = relativeReference(root, value?.path ?? value);
    try {
      await fs8.access(ref.absolute);
    } catch {
      throw new RelayError("WORKSPACE_REFERENCE_NOT_FOUND", `\u627E\u4E0D\u5230\u5DE5\u4F5C\u533A\u5F15\u7528\uFF1A${ref.relative}`);
    }
    resolved.push(ref);
  }
  return resolved;
}
async function resolveSkills({ cwd, skills = [], allowedProjects, codexHome }) {
  if (!Array.isArray(skills) || skills.length > 20) throw new RelayError("INVALID_MESSAGE", "\u6280\u80FD\u9009\u62E9\u6570\u91CF\u65E0\u6548");
  const listed = await listSkills({ cwd, allowedProjects, codexHome });
  const byName = new Map(listed.data.map((skill) => [skill.name, skill]));
  return skills.map((value) => {
    const name = text2(value?.name ?? value);
    const skill = byName.get(name);
    if (!skill) throw new RelayError("SKILL_NOT_FOUND", `\u627E\u4E0D\u5230\u6280\u80FD\uFF1A${name}`);
    return skill;
  });
}
function buildTurnContext(references, skills) {
  const lines = [];
  if (references.length) lines.push("\u5DE5\u4F5C\u533A\u5F15\u7528\uFF1A", ...references.map((item) => `- ${item.relative}`));
  if (skills.length) lines.push("\u542F\u7528\u6280\u80FD\uFF1A", ...skills.map((item) => `- ${item.name}`));
  return lines.length ? `${lines.join("\n")}

` : "";
}

// server/command-router.js
var MAX_THREAD_READ_BYTES = 15e5;
var MAX_THREAD_READ_TURNS = 12;
var MAX_THREAD_ITEM_STRING_BYTES = 8192;
var MAX_THREAD_ARRAY_ITEMS = 128;
var CommandRouter = class {
  #completed = /* @__PURE__ */ new Map();
  #inflight = /* @__PURE__ */ new Map();
  #readRequests = /* @__PURE__ */ new Map();
  #threadReadTails = /* @__PURE__ */ new Map();
  #settingsWriteTails = /* @__PURE__ */ new Map();
  #nextSnapshotRevision = 0;
  #selectedThreadId = null;
  constructor({ configStore, appServer, service, logger }) {
    this.configStore = configStore;
    this.appServer = appServer;
    this.service = service;
    this.logger = logger;
    this.journal = new CommandJournal(configStore.configDir);
    this.images = new ImageUploads(configStore.configDir);
  }
  async handle(message) {
    const config = this.configStore.get();
    let fingerprint;
    try {
      validateRelayCommand(message, config);
      fingerprint = commandFingerprint(message);
      const completed = this.#completed.get(message.requestId);
      if (completed) {
        if (completed.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        await this.#authorizeReplay(message, completed.response);
        return completed.response;
      }
      const inflight = this.#inflight.get(message.requestId);
      if (inflight) {
        if (inflight.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        return await inflight.promise;
      }
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
    const threadId = message.command.threadId || message.threadId;
    const ordered = threadId && ["thread.settings.update", "turn.start"].includes(message.command.type);
    const previous = ordered ? this.#settingsWriteTails.get(threadId) : null;
    const promise = (previous ? previous.catch(() => {
    }) : Promise.resolve()).then(() => this.#run(config, message, fingerprint));
    if (ordered) this.#settingsWriteTails.set(threadId, promise);
    this.#inflight.set(message.requestId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (this.#inflight.get(message.requestId)?.promise === promise) {
        this.#inflight.delete(message.requestId);
      }
      if (ordered && this.#settingsWriteTails.get(threadId) === promise) this.#settingsWriteTails.delete(threadId);
    }
  }
  async #run(config, message, fingerprint) {
    let entry;
    try {
      entry = await this.journal.begin(config, message, fingerprint);
      if (entry?.response) {
        await this.#authorizeReplay(message, entry.response);
        return entry.response;
      }
      const result = await this.#executeRead(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {}, message.deviceId);
      try {
        await this.journal.finish(entry, response);
      } catch {
        throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u540E\u7AEF\u53EF\u80FD\u5DF2\u6267\u884C\u547D\u4EE4\uFF0C\u4F46\u56DE\u6267\u672A\u80FD\u4FDD\u5B58\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\u6838\u5BF9\u7ED3\u679C");
      }
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      const uncertain = entry && ["APP_SERVER_UNAVAILABLE", "APP_SERVER_TIMEOUT"].includes(error.code);
      const response = this.#failure(config, message, fingerprint, uncertain ? new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u8FDE\u63A5\u4E2D\u65AD\u6216\u8D85\u65F6\uFF0C\u547D\u4EE4\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\uFF0C\u52FF\u91CD\u590D\u53D1\u9001", { cause: error.code, threadId: message.threadId, command: message.command.type }) : error);
      if (entry && error.code !== "COMMAND_OUTCOME_UNKNOWN") await this.journal.finish(entry, response).catch(() => {
      });
      return response;
    }
  }
  async #authorizeReplay(message, response) {
    if (!response.success) return;
    const command = message.command;
    if (command.type === "thread.settings.update") composerSettingsPatch(command, this.configStore.get());
    if (command.type === "thread.create") this.#allowedCwd(command.cwd, true);
    const threadId = command.threadId || message.threadId;
    if (threadId) await this.#assertThreadAllowed(threadId);
  }
  async #executeRead(command, envelope) {
    if (!["project.list", "thread.list", "thread.read", "thread.status", "thread.resume", "sync.request", "workspace.search", "skills.list"].includes(command.type)) {
      return this.#execute(command, envelope);
    }
    const key = JSON.stringify({
      deviceId: envelope.deviceId,
      threadId: envelope.threadId || null,
      command: stableValue(command)
    });
    const existing = this.#readRequests.get(key);
    if (existing) return existing;
    const threadId = command.type === "thread.read" || command.type === "thread.status" ? String(command.threadId || envelope.threadId || "").trim() : "";
    const previous = threadId ? this.#threadReadTails.get(threadId) : null;
    const pending = (previous ? previous.catch(() => void 0) : Promise.resolve()).then(() => this.#execute(command, envelope)).finally(() => {
      if (this.#readRequests.get(key) === pending) this.#readRequests.delete(key);
      if (threadId && this.#threadReadTails.get(threadId) === pending) {
        this.#threadReadTails.delete(threadId);
      }
    });
    this.#readRequests.set(key, pending);
    if (threadId) this.#threadReadTails.set(threadId, pending);
    return pending;
  }
  #failure(config, message, fingerprint, error) {
    const relayError = asRelayError(error);
    this.logger.warn("command", "\u8FDC\u7A0B\u547D\u4EE4\u6267\u884C\u5931\u8D25", {
      command: message?.command?.type,
      code: relayError.code,
      message: relayError.message
    });
    const response = commandError(config, message?.requestId, relayError, message?.deviceId);
    if (message?.requestId && fingerprint && !this.#completed.has(message.requestId)) {
      this.#remember(message.requestId, fingerprint, response);
    }
    return response;
  }
  async #execute(command, envelope) {
    if (command.type === "ping") return { pong: true };
    if (command.type === "host.get_status") return this.service.status();
    if (command.type === "sync.request") {
      return this.service.syncAfter(Object.hasOwn(command, "lastSequence") ? command.lastSequence : null, command.eventStreamId);
    }
    if (command.type === "workspace.search") {
      const cwd = this.#allowedCwd(command.cwd, true);
      return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
    }
    if (command.type === "skills.list") {
      const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : void 0;
      return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
    }
    if (command.type.startsWith("image.upload.")) {
      const owner = this.images.owner(this.configStore.get(), envelope);
      if (command.type === "image.upload.append") return this.images.append(command, owner);
      if (command.type === "image.upload.finish") return this.images.finish(command.uploadId, owner);
      if (command.type === "image.upload.remove") return this.images.remove(command.uploadId, owner);
      const threadId = command.threadId || envelope.threadId;
      let cwd = this.#allowedCwd(command.cwd, true);
      if (threadId) {
        await this.appServer.start();
        const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
        const result = await read.call(this.appServer, threadId);
        this.#assertThreadResultAllowed(result);
        cwd = this.#allowedCwd((result.thread || result).cwd, true);
      }
      return this.images.begin(command, owner, { cwd, threadId });
    }
    await this.appServer.start();
    switch (command.type) {
      case "model.list":
        return this.appServer.listModels(command);
      case "project.list":
        return filterProjectList(await this.appServer.listProjects(command), this.configStore.get().allowedProjects);
      case "workspace.search": {
        const cwd = this.#allowedCwd(command.cwd, true);
        return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
      }
      case "skills.list": {
        const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : void 0;
        return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
      }
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
        const result = compactThreadReadResult(
          await this.#readSubscribedThread(threadId, readThread)
        );
        const snapshotHash = createHash3("sha256").update(JSON.stringify(result)).digest("hex");
        if (command.snapshotHash === snapshotHash) {
          return { threadId, snapshotHash, unchanged: true, pendingInteractions: this.appServer.pendingInteractions?.(threadId) || [] };
        }
        const prepared = this.service.prepareResourceImages ? this.service.prepareResourceImages(result) : result;
        return { ...this.#annotateThreadSnapshot(threadId, compactThreadReadResult(await prepared), "read"), snapshotHash };
      }
      case "thread.status": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
        return this.#annotateThreadSnapshot(threadId, result, "status");
      }
      case "thread.create": {
        const cwd = this.#allowedCwd(command.cwd, true);
        const result = await this.appServer.createThread({ cwd });
        this.#selectedThreadId = result?.thread?.id || result?.id || null;
        return result;
      }
      case "thread.resume": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
        this.#selectedThreadId = threadId;
        return { ...result, syncMode: "snapshot" };
      }
      case "thread.select": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        await this.appServer.subscribeThread?.(threadId);
        this.#selectedThreadId = threadId;
        return { threadId: this.#selectedThreadId };
      }
      case "thread.settings.update": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const patch = composerSettingsPatch(command, this.configStore.get());
        await this.#assertThreadAllowed(threadId);
        return this.appServer.updateThreadSettings(threadId, patch);
      }
      case "turn.start": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        let images;
        let references = [];
        let skills = [];
        let threadCwd = this.#allowedCwd(command.cwd);
        if (command.workspaceRefs !== void 0 || command.skills !== void 0) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          threadCwd = this.#allowedCwd((result.thread || result).cwd, true);
          references = await resolveWorkspaceReferences({ cwd: threadCwd, references: command.workspaceRefs || [], allowedProjects: this.configStore.get().allowedProjects });
          skills = await resolveSkills({ cwd: threadCwd, skills: command.skills || [], allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
        }
        if (command.attachmentIds !== void 0) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          const cwd = this.#allowedCwd((result.thread || result).cwd, true);
          threadCwd = threadCwd || cwd;
          images = await this.images.resolve(command.attachmentIds, this.images.owner(this.configStore.get(), envelope), { cwd, threadId });
        }
        return this.appServer.startTurn({
          threadId,
          text: `${buildTurnContext(references, skills)}${images?.length ? optionalString(command.text) || "" : requireString(command.text, "text")}`,
          ...images ? { images } : {},
          cwd: threadCwd,
          model: optionalString(command.model),
          effort: optionalString(command.effort)
        });
      }
      case "turn.steer": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.steerTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId"),
          text: requireString(command.text, "text")
        });
      }
      case "turn.interrupt": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.interruptTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId")
        });
      }
      case "approval.respond": {
        const allowed = /* @__PURE__ */ new Set(["accept", "acceptForSession", "decline", "cancel"]);
        if (!allowed.has(command.decision)) throw new RelayError("INVALID_MESSAGE", "\u5BA1\u6279\u51B3\u5B9A\u65E0\u6548");
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToApproval(id, command.decision);
      }
      case "userInput.respond": {
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToUserInput(id, command.answers);
      }
      default:
        throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${command.type}`);
    }
  }
  #allowedCwd(cwd, required = false) {
    const config = this.configStore.get();
    const candidate = cwd || (required ? config.codex.defaultWorkingDirectory : "");
    if (!candidate) {
      if (required && config.allowedProjects.length) {
        throw new RelayError("PROJECT_REQUIRED", "\u542F\u7528\u9879\u76EE\u767D\u540D\u5355\u540E\uFF0C\u521B\u5EFA\u4F1A\u8BDD\u5FC5\u987B\u6307\u5B9A\u5141\u8BB8\u7684\u5DE5\u4F5C\u76EE\u5F55");
      }
      return void 0;
    }
    const safe = safeProjectPath(candidate, config.allowedProjects);
    if (!safe) throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u9879\u76EE\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    return safe;
  }
  async #assertInteractionAllowed(id, envelope) {
    const entry = this.appServer.getInteraction(id);
    const threadId = entry.params.threadId;
    if (!threadId || envelope.threadId && envelope.threadId !== threadId) throw new RelayError("PROJECT_NOT_ALLOWED", "\u4EA4\u4E92\u8BF7\u6C42\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4EFB\u52A1");
    await this.#assertThreadAllowed(threadId);
  }
  async #readSubscribedThread(threadId, read) {
    let result = await read.call(this.appServer, threadId, { ensureResumed: false });
    this.#assertThreadResultAllowed(result);
    if (await this.appServer.subscribeThread?.(threadId)) {
      result = await read.call(this.appServer, threadId, { ensureResumed: false });
      this.#assertThreadResultAllowed(result);
    }
    this.appServer.rememberThreadSettings?.(threadId, result);
    const settings = this.appServer.threadSettings?.(threadId);
    return settings ? { ...result, threadSettings: settings } : result;
  }
  async #assertThreadAllowed(threadId) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return;
    const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
    this.#assertThreadResultAllowed(await readThread.call(this.appServer, threadId));
  }
  #assertThreadResultAllowed(result) {
    const config = this.configStore.get();
    if (!config.allowedProjects.length) return;
    const cwd = result?.thread?.cwd || result?.cwd;
    if (!cwd || !safeProjectPath(cwd, config.allowedProjects)) {
      throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u4F1A\u8BDD\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    }
  }
  #remember(requestId, fingerprint, response) {
    this.#completed.set(requestId, { fingerprint, response });
    if (this.#completed.size > 500) this.#completed.delete(this.#completed.keys().next().value);
  }
  #annotateThreadSnapshot(threadId, result, source) {
    const id = String(threadId || "").trim();
    if (!id || !result || typeof result !== "object") return result;
    const revision = ++this.#nextSnapshotRevision;
    return {
      ...result,
      snapshotRevision: revision,
      snapshotSource: source,
      snapshotObservedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pendingInteractions: this.appServer.pendingInteractions?.(id) || []
    };
  }
};
function commandFingerprint(message) {
  return JSON.stringify({
    spaceId: message.spaceId,
    deviceId: message.deviceId,
    targetDeviceId: message.targetDeviceId,
    threadId: message.threadId || null,
    turnId: message.turnId || null,
    command: message.command.type === "image.upload.append" ? { ...stableValue(message.command), data: createHash3("sha256").update(String(message.command.data)).digest("hex") } : stableValue(message.command)
  });
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new RelayError("INVALID_MESSAGE", `\u7F3A\u5C11 ${name}`);
  return value;
}
function optionalString(value) {
  const text3 = typeof value === "string" ? value.trim() : "";
  return text3 || void 0;
}
function compactThreadReadResult(result) {
  if (!result || typeof result !== "object") return result;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_THREAD_READ_BYTES) return result;
  const sourceThread = result.thread && typeof result.thread === "object" ? result.thread : result;
  const sourceTurns = Array.isArray(sourceThread.turns) ? sourceThread.turns : [];
  const compactThread = compactValue({ ...sourceThread, turns: [] });
  const compactTurns = [];
  for (let index = sourceTurns.length - 1; index >= 0 && compactTurns.length < MAX_THREAD_READ_TURNS; index -= 1) {
    const turn = sourceTurns[index];
    if (!turn || typeof turn !== "object") continue;
    compactTurns.unshift(compactValue(turn));
    compactThread.turns = compactTurns;
    const candidate = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_THREAD_READ_BYTES) {
      compactTurns.shift();
      compactThread.turns = compactTurns;
      break;
    }
  }
  const compacted = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
  if (Buffer.byteLength(JSON.stringify(compacted), "utf8") <= MAX_THREAD_READ_BYTES) {
    return compacted;
  }
  const minimalThread = compactValue(Object.fromEntries(
    ["id", "sessionId", "cwd", "path", "preview", "name", "status", "createdAt", "updatedAt"].filter((key) => sourceThread[key] !== void 0).map((key) => [key, sourceThread[key]])
  ));
  minimalThread.turns = [];
  return result.thread && typeof result.thread === "object" ? { thread: minimalThread } : minimalThread;
}
function compactValue(value, depth = 0) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") <= MAX_THREAD_ITEM_STRING_BYTES) return value;
    const suffix = "\n\u2026\uFF08\u5386\u53F2\u8F93\u51FA\u5DF2\u622A\u65AD\uFF09";
    const maxChars = Math.max(0, MAX_THREAD_ITEM_STRING_BYTES - Buffer.byteLength(suffix, "utf8"));
    return `${value.slice(0, maxChars)}${suffix}`;
  }
  if (Array.isArray(value)) {
    const items = value.length > MAX_THREAD_ARRAY_ITEMS ? value.slice(-MAX_THREAD_ARRAY_ITEMS) : value;
    return items.map((item) => compactValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  if (depth > 8) return "[nested value omitted]";
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)])
  );
}

// server/event-buffer.js
var EventBuffer = class {
  #items = [];
  #sequence = 0;
  #bytes = 0;
  #droppedThrough = 0;
  constructor(limit = 1e3, options = {}) {
    this.limit = Math.max(1, Number(limit) || 1e3);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024);
    this.maxEventBytes = Math.max(1, Number(options.maxEventBytes) || 2 * 1024 * 1024);
  }
  nextSequence() {
    this.#sequence += 1;
    return this.#sequence;
  }
  push(event) {
    const bytes = byteSize(event);
    if (bytes > this.maxEventBytes) {
      this.#droppedThrough = Math.max(this.#droppedThrough, event.sequence || this.#sequence);
      return event;
    }
    this.#items.push(event);
    this.#bytes += bytes;
    while (this.#items.length > this.limit || this.#bytes > this.maxBytes) {
      const removed = this.#items.shift();
      this.#bytes -= byteSize(removed);
      this.#droppedThrough = Math.max(this.#droppedThrough, removed.sequence || 0);
    }
    return event;
  }
  after(lastSequence) {
    const sequence = Number(lastSequence || 0);
    if (sequence < this.#droppedThrough) return null;
    if (!this.#items.length) return [];
    const first = this.#items[0].sequence;
    if (sequence < first - 1) return null;
    return this.#items.filter((item) => item.sequence > sequence);
  }
  latestSequence() {
    return this.#sequence;
  }
  invalidateReplay() {
    this.#items.length = 0;
    this.#bytes = 0;
    this.#droppedThrough = this.nextSequence();
  }
  clear() {
    this.#items.length = 0;
    this.#sequence = 0;
    this.#bytes = 0;
    this.#droppedThrough = 0;
  }
  get size() {
    return this.#items.length;
  }
  get bytes() {
    return this.#bytes;
  }
};
function byteSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

// server/instance-lock.js
import fs9 from "node:fs/promises";
import path10 from "node:path";
var LOCK_WRITE_GRACE_MS = 5e3;
var InstanceLock = class {
  #file = null;
  #handle = null;
  #acquirePromise = null;
  constructor(configDir, name = "connector.lock") {
    this.#file = path10.join(configDir, name);
  }
  async acquire() {
    if (this.#handle) return;
    if (this.#acquirePromise) return this.#acquirePromise;
    this.#acquirePromise = this.#acquire();
    try {
      await this.#acquirePromise;
    } finally {
      this.#acquirePromise = null;
    }
  }
  async #acquire() {
    await fs9.mkdir(path10.dirname(this.#file), { recursive: true, mode: 448 });
    for (; ; ) {
      try {
        this.#handle = await fs9.open(this.#file, "wx", 384);
        await this.#handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })}
`);
        return;
      } catch (error) {
        if (this.#handle) {
          await this.#handle.close().catch(() => {
          });
          this.#handle = null;
        }
        if (error.code !== "EEXIST") throw error;
        if (await this.#removeIfStale()) continue;
        const active = new Error("\u540C\u4E00\u914D\u7F6E\u76EE\u5F55\u5DF2\u6709 Codex Relay Connector \u5728\u8FD0\u884C");
        active.code = "RELAY_INSTANCE_ALREADY_RUNNING";
        throw active;
      }
    }
  }
  async release() {
    const handle = this.#handle;
    if (!handle) return;
    this.#handle = null;
    await handle.close().catch(() => {
    });
    await fs9.unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async #removeIfStale() {
    let record;
    try {
      record = JSON.parse(await fs9.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return true;
      try {
        const stat = await fs9.stat(this.#file);
        if (Date.now() - stat.mtimeMs < LOCK_WRITE_GRACE_MS) return false;
      } catch (statError) {
        if (statError.code === "ENOENT") return true;
        return false;
      }
      await fs9.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      await fs9.unlink(this.#file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
      await fs9.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
  }
};

// server/logger.js
import { EventEmitter as EventEmitter3 } from "node:events";
var Logger = class extends EventEmitter3 {
  #entries = [];
  constructor(limit = 300) {
    super();
    this.limit = limit;
  }
  log(level, component, message, data) {
    const entry = {
      timestamp: nowIso(),
      level,
      component,
      message: redact(String(message)),
      ...data === void 0 ? {} : { data: redact(data) }
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.shift();
    this.emit("entry", entry);
    return entry;
  }
  info(component, message, data) {
    return this.log("info", component, message, data);
  }
  warn(component, message, data) {
    return this.log("warn", component, message, data);
  }
  error(component, message, data) {
    return this.log("error", component, message, data);
  }
  list(limit = 100) {
    return this.#entries.slice(-Math.max(1, Math.min(limit, this.limit)));
  }
  clear() {
    this.#entries.length = 0;
  }
};

// server/relay-client.js
import { EventEmitter as EventEmitter4 } from "node:events";
import crypto5 from "node:crypto";

// server/relay-token-service.js
import crypto4 from "node:crypto";
var REFRESH_LEAD_MS = 6e4;
var MAX_RETRY_AFTER_MS = 10 * 6e4;
var RelayTokenService = class {
  #refreshing = null;
  #refreshingKey = null;
  constructor(configStore, logger, options = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.fetch = options.fetch || globalThis.fetch;
  }
  /**
   * Resolve a credential that is safe to use for the next handshake.  The
   * object-returning variant is useful to connection owners because a refresh
   * also changes expiry metadata; keeping that metadata alongside the token
   * prevents a runtime override or a restart from scheduling the next refresh
   * from stale information.
   */
  async usableCredential({
    force = false,
    credential: suppliedCredential = null,
    // Connection tests can validate credentials that are still in an editor
    // draft.  Such a refresh must remain ephemeral; normal connector startup
    // and scheduled rotation keep the default durable behavior.
    persist = true
  } = {}) {
    const credential = await this.#resolveCredential(suppliedCredential);
    const connectToken = typeof credential?.connectToken === "string" ? credential.connectToken : "";
    const endpointGrant = typeof credential?.endpointGrant === "string" ? credential.endpointGrant : "";
    if (!connectToken && !endpointGrant) {
      throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token \u6216 Endpoint Grant");
    }
    const hasExpiry = Number.isSafeInteger(credential.expiresAt) && credential.expiresAt > 0;
    const expiring = !connectToken || !hasExpiry || credential.expiresAt <= Date.now() + REFRESH_LEAD_MS;
    if (!force && !expiring) return { ...credential };
    if (!endpointGrant) {
      if (!force && connectToken && (!hasExpiry || credential.expiresAt > Date.now())) {
        return { ...credential };
      }
      throw new RelayError("auth.grant_required", "Connect Token \u5DF2\u8FC7\u671F\u4E14\u672A\u914D\u7F6E Endpoint Grant");
    }
    if (Number.isSafeInteger(credential.grantExpiresAt) && credential.grantExpiresAt <= Date.now()) {
      throw new RelayError("auth.grant_expired", "Endpoint Grant \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u7B7E\u53D1\u51ED\u8BC1");
    }
    const refreshKey = `${await this.#refreshContextKey(credential)}\0${persist ? "persist" : "ephemeral"}`;
    let refreshPromise = this.#refreshing;
    if (!refreshPromise || this.#refreshingKey !== refreshKey) {
      refreshPromise = this.#refresh(credential, { persist });
      this.#refreshing = refreshPromise;
      this.#refreshingKey = refreshKey;
      refreshPromise.then(
        () => this.#clearRefresh(refreshPromise),
        () => this.#clearRefresh(refreshPromise)
      );
    }
    try {
      return { ...await refreshPromise };
    } catch (error) {
      if (error?.code !== "AUTH_CONTEXT_CHANGED" && !force && connectToken && (!hasExpiry || credential.expiresAt > Date.now())) {
        this.logger?.warn?.("relay", "Connect Token \u5237\u65B0\u6682\u65F6\u5931\u8D25\uFF0C\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D\u51ED\u8BC1", {
          code: error.code,
          message: error.message
        });
        return { ...credential };
      }
      throw error;
    }
  }
  async usableToken(options = {}) {
    const credential = await this.usableCredential(options);
    return credential?.connectToken || null;
  }
  async #refresh(credential, { persist = true } = {}) {
    const initialConfig = this.configStore.get();
    const initialRelay = initialConfig.relay || {};
    const identity = await this.configStore.endpointIdentity();
    const tokenEndpoint = resolveTokenEndpoint(credential.tokenEndpoint, initialRelay.url);
    if (!tokenEndpoint) throw new RelayError("auth.refresh_invalid", "\u672A\u914D\u7F6E\u6709\u6548\u7684 Token \u5237\u65B0\u5730\u5740");
    const requestId = randomId("refresh");
    const issuedAt = Date.now();
    const nonce = crypto4.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-token-v1",
      requestId,
      issuedAt,
      nonce,
      credential.endpointGrant
    ].join("\n");
    const privateKey = crypto4.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
    });
    let response;
    try {
      response = await this.fetch(tokenEndpoint, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpointGrant: credential.endpointGrant,
          proof: {
            requestId,
            issuedAt,
            nonce,
            signature: crypto4.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
          }
        }),
        signal: AbortSignal.timeout(1e4)
      });
    } catch (error) {
      throw new RelayError("RELAY_UNAVAILABLE", `Connect Token \u5237\u65B0\u5931\u8D25\uFF1A${error.message}`, {
        retryable: true
      });
    }
    const body = await response.json().catch(() => null);
    const errorCode = typeof body?.data?.errorCode === "string" ? body.data.errorCode : null;
    const envelopeCode = Number.isInteger(body?.code) ? body.code : null;
    if (!response.ok || envelopeCode !== null && envelopeCode !== 200) {
      const retryable = isRetryableHttpStatus(response.status) || envelopeCode !== null && isRetryableHttpStatus(envelopeCode);
      const retryAfterMs = retryAfterMilliseconds(response.headers?.get?.("retry-after"));
      throw new RelayError(
        retryable ? "RELAY_RETRYABLE" : errorCode || "auth.refresh_rejected",
        body?.msg || `Connect Token \u5237\u65B0\u88AB\u62D2\u7EDD\uFF08HTTP ${response.status}\uFF09`,
        {
          retryable,
          status: response.status,
          relayCode: errorCode || envelopeCode,
          ...retryAfterMs == null ? {} : { retryAfterMs }
        }
      );
    }
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const now = Date.now();
    if (typeof data?.connectToken !== "string" || data.connectToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(data.connectToken) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) {
      throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u5237\u65B0\u51ED\u8BC1");
    }
    validateRefreshContext(data, initialRelay, now);
    const grantExpiresAt = data.grantExpiresAt;
    if (grantExpiresAt !== void 0 && grantExpiresAt !== null && (!Number.isSafeInteger(grantExpiresAt) || grantExpiresAt <= now)) {
      throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u6388\u6743\u51ED\u8BC1\u6709\u6548\u671F");
    }
    const patch = {
      connectToken: data.connectToken,
      expiresAt: data.expiresAt,
      ...credential.tokenEndpoint ? {} : { tokenEndpoint },
      ...Number.isSafeInteger(grantExpiresAt) ? { grantExpiresAt } : {}
    };
    const currentConfig = this.configStore.get();
    const currentIdentity = await this.configStore.endpointIdentity();
    const contextChanged = currentConfig.relay?.url !== initialRelay.url || currentConfig.relay?.spaceId !== initialRelay.spaceId || currentConfig.relay?.endpointId !== initialRelay.endpointId || currentConfig.relay?.endpointType !== initialRelay.endpointType || currentIdentity?.publicKey !== identity?.publicKey;
    if (contextChanged) {
      throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
    }
    let currentCredential = null;
    let persistenceAvailable = false;
    if (typeof this.configStore.relayCredential === "function" || typeof this.configStore.persistedRelayCredential === "function") {
      persistenceAvailable = true;
      currentCredential = await this.#persistedCredential();
      if (persist && currentCredential && currentCredential.endpointGrant !== credential.endpointGrant) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
      if (persist && currentCredential && (currentCredential.tokenEndpoint || "") !== (credential.tokenEndpoint || "")) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
    }
    let updatedValue = null;
    if (persist && (currentCredential || !persistenceAvailable)) {
      if (typeof this.configStore.updateRelayCredential !== "function") {
        throw new RelayError("AUTH_FAILED", "\u5F53\u524D\u51ED\u8BC1\u5B58\u50A8\u4E0D\u652F\u6301\u81EA\u52A8\u7EED\u671F");
      }
      const expectedCredential = { endpointGrant: credential.endpointGrant };
      if (currentCredential && Object.hasOwn(currentCredential, "connectToken")) {
        expectedCredential.connectToken = currentCredential.connectToken;
      } else if (currentCredential) {
        expectedCredential.connectToken = null;
      }
      if (currentCredential && Object.hasOwn(currentCredential, "tokenEndpoint")) {
        expectedCredential.tokenEndpoint = currentCredential.tokenEndpoint;
      } else if (currentCredential) {
        expectedCredential.tokenEndpoint = null;
      }
      updatedValue = await this.configStore.updateRelayCredential(
        patch,
        expectedCredential
      );
      if (updatedValue === null) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
    } else {
      this.logger?.info?.("relay", "\u4F7F\u7528\u672A\u4FDD\u5B58\u7684 Endpoint Grant \u5B8C\u6210\u672C\u6B21\u8FDE\u63A5\u6D4B\u8BD5");
    }
    const updated = persist ? {
      ...credential,
      ...currentCredential || {},
      ...updatedValue || {},
      ...patch
    } : {
      ...credential,
      ...patch
    };
    this.logger.info("relay", "Connect Token \u5DF2\u901A\u8FC7 Endpoint Grant \u81EA\u52A8\u7EED\u671F", {
      expiresAt: new Date(updated.expiresAt).toISOString()
    });
    return updated;
  }
  #clearRefresh(promise) {
    if (this.#refreshing === promise) {
      this.#refreshing = null;
      this.#refreshingKey = null;
    }
  }
  async #credential() {
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential();
    }
    const token = typeof this.configStore.token === "function" ? await this.configStore.token() : typeof this.configStore.get === "function" ? await this.configStore.get() : null;
    if (typeof token === "string") return token ? { connectToken: token } : null;
    if (typeof token?.relay?.token === "string" && token.relay.token) {
      return { connectToken: token.relay.token };
    }
    return null;
  }
  async #persistedCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return this.#credential();
  }
  async #refreshContextKey(credential) {
    let config;
    try {
      config = this.configStore.get();
    } catch {
      config = {};
    }
    let identity;
    try {
      identity = await this.configStore.endpointIdentity();
    } catch {
      identity = {};
    }
    return [
      credential.endpointGrant || "",
      credential.tokenEndpoint || "",
      config.relay?.url || "",
      config.relay?.spaceId || "",
      config.relay?.endpointId || "",
      identity?.publicKey || ""
    ].join("\0");
  }
  async #resolveCredential(suppliedCredential) {
    const stored = await this.#credential();
    if (suppliedCredential === null || suppliedCredential === void 0) return stored;
    const supplied = typeof suppliedCredential === "string" ? { connectToken: suppliedCredential } : suppliedCredential;
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) return stored;
    const hasTokenField = Object.hasOwn(supplied, "connectToken");
    const hasGrantField = Object.hasOwn(supplied, "endpointGrant");
    const merged = { ...stored || {}, ...supplied };
    if (hasGrantField && !hasTokenField) {
      delete merged.connectToken;
      delete merged.expiresAt;
    }
    if (typeof supplied.connectToken === "string" && supplied.connectToken && stored?.connectToken && supplied.connectToken !== stored.connectToken) {
      if (!Object.hasOwn(supplied, "expiresAt")) delete merged.expiresAt;
      if (!hasGrantField) {
        delete merged.endpointGrant;
        delete merged.grantExpiresAt;
      }
    }
    if (typeof supplied.endpointGrant === "string" && supplied.endpointGrant && stored?.endpointGrant && supplied.endpointGrant !== stored.endpointGrant && !Object.hasOwn(supplied, "grantExpiresAt")) {
      delete merged.grantExpiresAt;
    }
    return Object.keys(merged).length ? merged : null;
  }
};
function deriveTokenEndpoint(relayUrl) {
  try {
    const url = new URL(relayUrl);
    if (!["ws:", "wss:"].includes(url.protocol)) return null;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/api/connect-tokens/refresh";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function resolveTokenEndpoint(configured, relayUrl) {
  const raw = typeof configured === "string" && configured.trim() ? configured.trim() : deriveTokenEndpoint(relayUrl);
  if (!raw) return null;
  try {
    const endpoint = new URL(raw);
    const loopback = isLoopbackHostname(endpoint.hostname);
    if (!["http:", "https:"].includes(endpoint.protocol) || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.protocol !== "https:" && !loopback) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}
function isRetryableHttpStatus(status) {
  return Number.isInteger(status) && (status === 408 || status === 425 || status === 429 || status >= 500 && status <= 599);
}
function retryAfterMilliseconds(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isSafeInteger(seconds)) return MAX_RETRY_AFTER_MS;
    return Math.min(MAX_RETRY_AFTER_MS, seconds * 1e3);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()));
}
function validateRefreshContext(data, relay, now = Date.now()) {
  const expected = {
    spaceId: typeof relay?.spaceId === "string" ? relay.spaceId : "",
    endpointId: typeof relay?.endpointId === "string" ? relay.endpointId : "",
    endpointType: typeof relay?.endpointType === "string" && relay.endpointType ? relay.endpointType : "bridge"
  };
  for (const field of ["spaceId", "endpointId", "endpointType"]) {
    if (data?.[field] === void 0 || data?.[field] === null) continue;
    if (typeof data[field] !== "string" || !data[field] || data[field] !== expected[field]) {
      throw new RelayError("AUTH_CONTEXT_CHANGED", `Relay \u5237\u65B0\u54CD\u5E94\u7684 ${field} \u4E0E\u5F53\u524D\u914D\u7F6E\u4E0D\u4E00\u81F4`);
    }
  }
  if (data?.grantExpiresAt !== void 0 && data?.grantExpiresAt !== null && (!Number.isSafeInteger(data.grantExpiresAt) || data.grantExpiresAt <= now)) {
    throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u6388\u6743\u51ED\u8BC1\u6709\u6548\u671F");
  }
}

// server/outbound-queue.js
var OutboundQueue = class {
  #entries = [];
  #bytes = 0;
  #timer = null;
  #nextSendAt = 0;
  constructor({
    bytesPerSecond = 512 * 1024,
    maxBytes = 16 * 1024 * 1024,
    maxEntries = 512,
    maxWaitMs = 25e3
  } = {}) {
    Object.assign(this, { bytesPerSecond, maxBytes, maxEntries, maxWaitMs });
  }
  status() {
    return { queuedBytes: this.#bytes, queuedFrames: this.#entries.length, bytesPerSecond: this.bytesPerSecond };
  }
  enqueue(encoded, send, reject = () => {
  }) {
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (this.#bytes + bytes > this.maxBytes || this.#entries.length >= this.maxEntries) {
      reject(new RelayError("RELAY_BACKPRESSURE", "Relay \u53D1\u9001\u961F\u5217\u5DF2\u6EE1\uFF0C\u8BF7\u7A0D\u540E\u540C\u6B65"));
      return false;
    }
    this.#entries.push({ encoded, bytes, send, reject, expiresAt: Date.now() + this.maxWaitMs });
    this.#bytes += bytes;
    this.#drain();
    return true;
  }
  pause(ms) {
    this.#nextSendAt = Math.max(this.#nextSendAt, Date.now() + ms);
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#drain();
  }
  clear(error = new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00")) {
    clearTimeout(this.#timer);
    this.#timer = null;
    const entries = this.#entries.splice(0);
    this.#bytes = 0;
    for (const entry of entries) entry.reject(error);
  }
  #drain() {
    if (this.#timer) return;
    while (this.#entries.length) {
      const entry = this.#entries[0];
      const now = Date.now();
      if (entry.expiresAt <= now) {
        this.#entries.shift();
        this.#bytes -= entry.bytes;
        entry.reject(new RelayError("RELAY_BACKPRESSURE", "Relay \u53D1\u9001\u6392\u961F\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65"));
        continue;
      }
      if (this.#nextSendAt > now) {
        this.#timer = setTimeout(() => {
          this.#timer = null;
          this.#drain();
        }, Math.min(this.#nextSendAt, entry.expiresAt) - now);
        this.#timer.unref?.();
        return;
      }
      this.#entries.shift();
      this.#bytes -= entry.bytes;
      this.#nextSendAt = now + Math.max(34, Math.ceil(entry.bytes * 1e3 / this.bytesPerSecond));
      try {
        entry.send(entry.encoded);
      } catch (error) {
        entry.reject(error);
      }
    }
  }
};

// server/resource-cache.js
import { createHash as createHash4 } from "node:crypto";
var ResourceCache = class {
  #entries = /* @__PURE__ */ new Map();
  constructor(maxEntries = 256) {
    this.maxEntries = maxEntries;
  }
  get(context, mime, bytes, upload) {
    const key = createHash4("sha256").update(JSON.stringify([context, mime])).update(bytes).digest("hex");
    const cached = this.#entries.get(key);
    if (cached && (cached.pending || cached.expiresAt > Date.now() + 6e4)) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached.promise;
    }
    const entry = { pending: true, expiresAt: 0, promise: null };
    entry.promise = Promise.resolve().then(upload).then((ready) => {
      entry.pending = false;
      entry.expiresAt = typeof ready?.expiresAt === "number" ? ready.expiresAt : Date.parse(ready?.expiresAt);
      if (!ready?.resourceUrl || !(entry.expiresAt > Date.now() + 6e4)) {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
      }
      return ready;
    }, (error) => {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
      throw error;
    });
    this.#entries.set(key, entry);
    while (this.#entries.size > this.maxEntries) this.#entries.delete(this.#entries.keys().next().value);
    return entry.promise;
  }
};

// server/relay-client.js
var TERMINAL_RELAY_AUTH_CODES = /* @__PURE__ */ new Set([
  "auth.token_expired",
  "auth.token_revoked",
  "auth.invalid_token",
  "auth.proof_required",
  "auth.proof_mismatch",
  "auth.proof_invalid",
  "auth.proof_expired",
  "auth.grant_required",
  "auth.grant_expired",
  "auth.grant_revoked",
  "auth.invalid_grant",
  "auth.refresh_invalid",
  "auth.refresh_rejected",
  "auth.replay",
  "auth.account_unavailable",
  "auth.space_unavailable",
  "auth.endpoint_type_mismatch",
  "auth.revoked",
  "AUTH_CONTEXT_CHANGED",
  "handshake.invalid",
  "connection.kicked"
]);
var TOKEN_REFRESH_LEAD_MS = 6e4;
var UNKNOWN_EXPIRY_REFRESH_MS = 5 * 6e4;
var TOKEN_REFRESH_RETRY_MS = 15e3;
var RelayClient = class extends EventEmitter4 {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #tokenRefreshTimer = null;
  #tokenRefreshInFlight = null;
  #tokenRefreshContextKey = null;
  #connectPromise = null;
  #socketGeneration = 0;
  #attempt = 0;
  #manualClose = false;
  #token = null;
  #credential = null;
  #tokenService;
  #maxFrameSize = 10 * 1024 * 1024;
  #forceTokenRefresh = false;
  #credentialRefreshBlocked = false;
  #rotationInProgress = false;
  #resourceRequests = /* @__PURE__ */ new Map();
  #outbound;
  #resourceCache = new ResourceCache();
  #rateLimitUntil = 0;
  #connectionError = null;
  constructor(configStore, logger, options = {}) {
    super();
    this.configStore = configStore;
    this.logger = logger;
    this.#tokenService = options.tokenService || new RelayTokenService(configStore, logger, options);
    this.#outbound = new OutboundQueue(options.outbound);
    this.state = "disconnected";
    this.lastError = null;
    this.lastHeartbeat = null;
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
  }
  status() {
    return {
      state: this.state,
      lastError: this.lastError,
      lastHeartbeat: this.lastHeartbeat,
      connectedAt: this.connectedAt,
      connectionId: this.connectionId,
      features: [...this.features],
      reconnectAttempt: this.#attempt,
      transfer: this.#outbound.status(),
      retryAfterMs: Math.max(0, this.#rateLimitUntil - Date.now())
    };
  }
  async connect(credential) {
    if (this.#connectPromise) return this.#connectPromise;
    if (["connected", "authenticating", "connecting", "disconnecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay \u5730\u5740");
    if (!spaceId) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Space ID");
    if (!relayEndpointId(config.relay)) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay Endpoint ID");
    const token = typeof credential === "string" ? credential.trim() : credential?.connectToken?.trim?.() || "";
    const grant = credential && typeof credential === "object" ? credential.endpointGrant?.trim?.() || "" : "";
    if (credential !== void 0 && credential !== null && !token && !grant) {
      throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token \u6216 Endpoint Grant");
    }
    if (credential === void 0 || credential === null) this.#credential = null;
    else if (typeof credential === "string") this.#credential = { connectToken: token };
    else this.#credential = {
      ...credential,
      ...token ? { connectToken: token } : {},
      ...grant ? { endpointGrant: grant } : {}
    };
    this.#manualClose = false;
    this.#credentialRefreshBlocked = false;
    this.#forceTokenRefresh = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    return this.#beginOpen();
  }
  async test(credential, timeoutMs = 8e3) {
    if (this.state === "connected") {
      return {
        ok: true,
        connectionId: this.connectionId,
        protocolVersion: PROTOCOL_VERSION,
        reused: true
      };
    }
    if (["connecting", "authenticating", "reconnecting", "disconnecting"].includes(this.state)) {
      throw new RelayError("RELAY_BUSY", "Relay \u6B63\u5728\u8FDE\u63A5\u6216\u65AD\u5F00\uFF0C\u8BF7\u7B49\u5F85\u5F53\u524D\u64CD\u4F5C\u5B8C\u6210");
    }
    const config = this.configStore.get();
    const supplied = typeof credential === "string" ? { connectToken: credential } : credential;
    if (!config.relay.url || !relaySpaceId(config.relay) || !relayEndpointId(config.relay)) {
      throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Relay \u5730\u5740\u3001Space ID \u548C Relay Endpoint ID");
    }
    let storedCredential = null;
    if (typeof this.configStore.relayCredential === "function") {
      try {
        storedCredential = await this.configStore.relayCredential();
      } catch {
      }
    }
    const endpointGrant = supplied && typeof supplied === "object" && Object.hasOwn(supplied, "endpointGrant") ? supplied.endpointGrant?.trim?.() || "" : storedCredential?.endpointGrant?.trim?.() || "";
    const draftCredential = hasDifferentCredentialFields(supplied, storedCredential);
    const persistRefresh = !draftCredential;
    let token = await this.#tokenService.usableToken({
      credential: supplied,
      persist: persistRefresh
    });
    if (!token) throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Connect Token \u6216 Endpoint Grant");
    let refreshAttempted = false;
    while (true) {
      try {
        return await this.#testHandshake(config, token, timeoutMs);
      } catch (error) {
        if (!refreshAttempted && isRefreshableCredentialFailure(error) && endpointGrant) {
          token = await this.#tokenService.usableToken({
            force: true,
            credential: typeof supplied === "object" && supplied ? { ...supplied, connectToken: token } : { connectToken: token },
            persist: persistRefresh
          });
          if (!token) throw new RelayError("CONFIG_INCOMPLETE", "\u5237\u65B0\u540E\u4ECD\u672A\u83B7\u5F97\u6709\u6548 Connect Token");
          refreshAttempted = true;
          continue;
        }
        throw error;
      }
    }
  }
  async #testHandshake(config, token, timeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(config.relay.url);
      let settled = false;
      let timeout;
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const closeAfter = () => {
        try {
          socket.close();
        } catch {
        }
      };
      timeout = setTimeout(() => {
        finishReject(new RelayError("RELAY_TIMEOUT", "Relay \u5728\u6D4B\u8BD5\u65F6\u95F4\u5185\u6CA1\u6709\u786E\u8BA4\u8BA4\u8BC1"));
        closeAfter();
      }, timeoutMs);
      socket.addEventListener("open", async () => {
        try {
          socket.send(JSON.stringify(await this.#hello(config, token, true)));
        } catch (error) {
          finishReject(error);
          closeAfter();
        }
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "connect.welcome") {
            validateRelayWelcome(message);
            validateWelcomeIdentity(message, config);
            finishResolve({ ok: true, connectionId: message.connectionId, protocolVersion: message.version });
            closeAfter();
          } else if (message.type === "relay.error") {
            finishReject(new RelayError(message.code || "AUTH_FAILED", message.message || "Relay \u62D2\u7EDD\u8FDE\u63A5"));
            closeAfter();
          }
        } catch (error) {
          finishReject(new RelayError("INVALID_MESSAGE", `Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u6D88\u606F\uFF1A${error.message}`));
          closeAfter();
        }
      });
      socket.addEventListener("error", () => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", "\u65E0\u6CD5\u8FDE\u63A5 Relay"));
      });
      socket.addEventListener("close", (event) => {
        if (!settled) finishReject(new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`));
      });
    });
  }
  async disconnect(reason = "manual disconnect") {
    this.#outbound.clear();
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    clearTimeout(this.#tokenRefreshTimer);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    this.#tokenRefreshTimer = null;
    this.#rotationInProgress = false;
    const socket = this.#socket;
    const opening = this.#connectPromise;
    this.#credential = null;
    this.#token = null;
    this.#forceTokenRefresh = false;
    this.#credentialRefreshBlocked = false;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
    }
    this.#resourceRequests.clear();
    const shouldWait = Boolean(opening) || Boolean(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING));
    this.state = shouldWait ? "disconnecting" : "disconnected";
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
    this.emit("status", this.status());
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      await closeSocket(socket, reason);
    }
    if (opening) await opening.catch(() => {
    });
    this.#socketGeneration += 1;
    this.#socket = null;
    this.state = "disconnected";
    this.emit("status", this.status());
    return this.status();
  }
  send(message) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") return false;
    const config = this.configStore.get();
    const frame = wrapRelayFrame(message, config);
    if (frame?.to && !this.features.includes("directed-routing")) {
      const error = new RelayError(
        "DIRECTED_ROUTING_UNAVAILABLE",
        "\u5F53\u524D Relay \u5957\u9910\u4E0D\u652F\u6301\u5B9A\u5411\u8F6C\u53D1\uFF0C\u654F\u611F\u547D\u4EE4\u672A\u53D1\u9001"
      );
      this.lastError = error.message;
      this.logger.warn("relay", "Relay \u672A\u63D0\u4F9B\u5B9A\u5411\u8F6C\u53D1\u80FD\u529B\uFF0C\u5DF2\u963B\u6B62\u76EE\u6807\u6D88\u606F", {
        code: error.code,
        target: frame.to
      });
      this.emit("status", this.status());
      return false;
    }
    const encoded = JSON.stringify(frame);
    if (Buffer.byteLength(encoded, "utf8") > this.#maxFrameSize) {
      this.lastError = "\u5F85\u53D1\u9001\u6D88\u606F\u8D85\u8FC7 Relay maxFrameSize \u9650\u5236";
      this.logger.warn("relay", "\u5DF2\u963B\u6B62\u8D85\u8FC7 maxFrameSize \u7684\u6D88\u606F", {
        bytes: Buffer.byteLength(encoded, "utf8"),
        maxFrameSize: this.#maxFrameSize,
        type: message?.type
      });
      this.emit("status", this.status());
      return false;
    }
    const socket = this.#socket;
    if (message.type === "ping") {
      if (Date.now() < this.#rateLimitUntil) return false;
      try {
        socket.send(encoded);
        return true;
      } catch {
        return false;
      }
    }
    return this.#outbound.enqueue(encoded, (payload) => {
      if (this.#socket !== socket || socket.readyState !== WebSocket.OPEN) {
        throw new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u66F4\u6362\uFF0C\u65E7\u54CD\u5E94\u5DF2\u4E22\u5F03");
      }
      socket.send(payload);
    }, (error) => {
      this.logger.warn("relay", "Relay \u6570\u636E\u672A\u53D1\u9001\uFF0C\u9700\u8981\u91CD\u65B0\u540C\u6B65", { code: error.code, type: message?.type });
    });
  }
  /** Upload an image over the authenticated data channel and receive a
   * short-lived capability URL from Relay. */
  uploadResource({ mime, data, ttlSeconds } = {}) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const relay = this.configStore.get().relay;
    const context = [relay.url, relaySpaceId(relay), relayEndpointId(relay), ttlSeconds];
    return this.#resourceCache.get(context, mime, bytes, () => this.#uploadResource({ mime, bytes, ttlSeconds }));
  }
  #uploadResource({ mime, bytes, ttlSeconds }) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") {
      return Promise.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u5C1A\u672A\u8FDE\u63A5\uFF0C\u65E0\u6CD5\u4E0A\u4F20\u56FE\u7247"));
    }
    if (!this.features.includes("resources-v1")) {
      return Promise.reject(new RelayError("RESOURCE_UNSUPPORTED", "\u5F53\u524D Relay \u4E0D\u652F\u6301\u53D7\u63A7\u56FE\u7247\u8D44\u6E90"));
    }
    const frameBudget = Math.max(0, this.#maxFrameSize - 1024);
    const maxByFrame = Math.floor(frameBudget * 3 / 4);
    if (!bytes.length || bytes.length > Math.min(6 * 1024 * 1024, maxByFrame)) {
      return Promise.reject(new RelayError("RESOURCE_TOO_LARGE", "\u56FE\u7247\u8D85\u8FC7 6 MiB \u9650\u5236"));
    }
    const requestId = randomId("resource");
    const frame = {
      version: PROTOCOL_VERSION,
      type: "stream.message",
      messageId: randomId("resource-msg"),
      streamId: "resources",
      from: relayEndpointId(this.configStore.get().relay),
      protocol: "codex.resource.v1",
      encrypted: false,
      payload: {
        type: "codex.resource.put",
        requestId,
        mime: typeof mime === "string" ? mime : "",
        data: bytes.toString("base64"),
        ...Number.isInteger(ttlSeconds) ? { ttlSeconds } : {}
      }
    };
    return new Promise((resolve, reject) => {
      let timer;
      const fail = (error) => {
        this.#resourceRequests.delete(requestId);
        clearTimeout(timer);
        reject(error);
      };
      this.#resourceRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: fail
      });
      const socket = this.#socket;
      this.#outbound.enqueue(JSON.stringify(frame), (payload) => {
        if (this.#socket !== socket || socket.readyState !== WebSocket.OPEN) {
          throw new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u66F4\u6362\uFF0C\u56FE\u7247\u4E0A\u4F20\u5DF2\u53D6\u6D88");
        }
        timer = setTimeout(() => fail(new RelayError("RESOURCE_TIMEOUT", "Relay \u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u8D85\u65F6")), 15e3);
        socket.send(payload);
      }, fail);
    });
  }
  #beginOpen() {
    if (this.#connectPromise) return this.#connectPromise;
    const promise = this.#open();
    this.#connectPromise = promise;
    const clear = () => {
      if (this.#connectPromise === promise) this.#connectPromise = null;
    };
    promise.then(clear, clear);
    return promise;
  }
  async #open() {
    try {
      const usableCredential = await this.#usableCredential({
        force: this.#forceTokenRefresh,
        credential: this.#credential
      });
      this.#token = usableCredential?.connectToken || null;
      this.#credential = {
        ...this.#credential || {},
        ...usableCredential || {},
        ...this.#token ? { connectToken: this.#token } : {}
      };
      if (!this.#token) throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token");
      this.#forceTokenRefresh = false;
      const stored = await this.#authoritativeCredential();
      if (stored) {
        if (stored?.connectToken === this.#token) {
          this.#credential = stored;
        } else {
          const supplied = this.#credential || {};
          const tokenChanged = Boolean(
            supplied.connectToken && supplied.connectToken !== this.#token
          );
          this.#credential = {
            ...stored || {},
            ...supplied,
            connectToken: this.#token
          };
          if (tokenChanged) delete this.#credential.expiresAt;
        }
      }
    } catch (error) {
      if (this.#manualClose) throw error;
      this.#handleFailure(error);
      if (!this.#manualClose && !isTerminalRelayFailure(error, this.#credential)) {
        this.#scheduleReconnect();
      }
      throw error;
    }
    if (this.#manualClose) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    this.state = "connecting";
    this.lastError = null;
    this.emit("status", this.status());
    this.logger.info("relay", "\u6B63\u5728\u8FDE\u63A5 Relay", { url: config.relay.url, spaceId });
    const generation = ++this.#socketGeneration;
    return new Promise((resolve, reject) => {
      let settled = false;
      let established = false;
      let failureReported = false;
      let failureCode = null;
      const socket = new WebSocket(config.relay.url);
      this.#socket = socket;
      const isCurrent = () => this.#socket === socket && this.#socketGeneration === generation;
      const reportFailure = (error) => {
        if (failureReported || !isCurrent()) return;
        failureReported = true;
        failureCode = error?.code || "RELAY_UNAVAILABLE";
        if (this.#manualClose) return;
        this.#handleFailure(error);
      };
      const authenticationTimeout = setTimeout(() => {
        const error = new RelayError("RELAY_TIMEOUT", "Relay \u8BA4\u8BC1\u8D85\u65F6");
        reportFailure(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
        socket.close();
      }, 1e4);
      socket.addEventListener("open", async () => {
        if (!isCurrent()) return;
        this.state = "authenticating";
        this.emit("status", this.status());
        try {
          socket.send(JSON.stringify(await this.#hello(config, this.#token, false)));
        } catch (error) {
          reportFailure(error);
          if (!settled) {
            settled = true;
            clearTimeout(authenticationTimeout);
            reject(error);
          }
          socket.close();
        }
      });
      socket.addEventListener("message", (event) => this.#handleMessage(event, {
        resolve,
        reject,
        settle: () => {
          settled = true;
        },
        authenticationTimeout,
        socket,
        isCurrent,
        reportFailure,
        markEstablished: () => {
          established = true;
        }
      }));
      socket.addEventListener("error", () => {
        const error = this.#connectionError || new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket \u8FDE\u63A5\u5931\u8D25");
        reportFailure(error);
        if (!settled) {
          settled = true;
          clearTimeout(authenticationTimeout);
          reject(error);
        }
      });
      socket.addEventListener("close", (event) => {
        if (!isCurrent()) return;
        clearTimeout(authenticationTimeout);
        clearInterval(this.#heartbeat);
        this.#heartbeat = null;
        clearTimeout(this.#tokenRefreshTimer);
        this.#tokenRefreshTimer = null;
        const rotating = this.#rotationInProgress;
        this.#rotationInProgress = false;
        if (!settled) {
          settled = true;
          const error = new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`);
          reportFailure(error);
          reject(error);
        }
        if (established && !failureReported && !this.#manualClose && !rotating) {
          reportFailure(this.#connectionError || new RelayError("RELAY_UNAVAILABLE", `Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF1A${event.code}`));
        }
        this.#detachSocket(socket);
        if (!this.#manualClose && !this.#credentialRefreshBlocked && !isTerminalRelayFailure({ code: failureCode }, this.#credential)) {
          this.#scheduleReconnect(rotating ? 100 : void 0);
        } else {
          this.emit("disconnected", { code: failureCode || event.code });
        }
      });
    });
  }
  #handleMessage(event, handshake) {
    if (handshake.isCurrent && !handshake.isCurrent()) return;
    let message;
    try {
      const raw = String(event.data);
      if (Buffer.byteLength(raw, "utf8") > this.#maxFrameSize) {
        handshake.socket?.close(1009, "message too large");
        throw new RelayError("INVALID_MESSAGE", "Relay \u6D88\u606F\u8D85\u8FC7 maxFrameSize \u9650\u5236");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "\u5FFD\u7565 Relay \u7684\u65E0\u6548 JSON", { message: error.message });
      return;
    }
    if (message.type === "connect.welcome") {
      if (this.state !== "authenticating" || handshake.isCurrent && !handshake.isCurrent()) return;
      try {
        validateRelayWelcome(message);
        validateWelcomeIdentity(message, this.configStore.get());
        if (!Number.isInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
          throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
        }
      } catch (error) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.reportFailure?.(error);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close(1002, "invalid welcome");
        return;
      }
      clearTimeout(handshake.authenticationTimeout);
      this.state = "connected";
      handshake.markEstablished?.();
      this.connectedAt = nowIso();
      this.connectionId = message.connectionId;
      this.features = Array.isArray(message.features) ? message.features.filter((item) => typeof item === "string") : [];
      if (Number.isInteger(message.maxFrameSize) && message.maxFrameSize > 0) this.#maxFrameSize = message.maxFrameSize;
      this.#attempt = 0;
      this.lastError = null;
      this.#connectionError = null;
      this.#startHeartbeat();
      this.#scheduleTokenRefresh();
      this.logger.info("relay", "Relay \u5DF2\u8FDE\u63A5\u5E76\u5B8C\u6210\u8BA4\u8BC1", { connectionId: this.connectionId });
      this.emit("status", this.status());
      this.emit("connected", message);
      handshake.settle();
      handshake.resolve(this.status());
      return;
    }
    if (message.type === "relay.error") {
      const authenticating = this.state === "authenticating";
      const error = new RelayError(message.code || "RELAY_ERROR", message.message || "Relay \u8FD4\u56DE\u9519\u8BEF");
      if (isRefreshableCredentialFailure(error) && this.#credential?.endpointGrant) {
        this.#forceTokenRefresh = true;
      }
      const requestLevel = ["resource.", "message.too_large", "rate.limited", "frame.invalid"].some((prefix) => error.code === prefix || error.code.startsWith(prefix));
      if (!authenticating && error.code === "rate.limited") {
        this.#connectionError = error;
        this.lastError = `Relay \u6570\u636E\u9650\u6D41\uFF1A${error.message}`;
        this.#rateLimitUntil = Date.now() + 6e4;
        this.#outbound.bytesPerSecond = Math.max(16 * 1024, Math.floor(this.#outbound.bytesPerSecond / 2));
        this.#outbound.clear(error);
        this.#outbound.pause(6e4);
        for (const pending of this.#resourceRequests.values()) pending.reject(error);
        this.#resourceRequests.clear();
        this.logger.warn("relay", "Relay \u6570\u636E\u9650\u6D41\uFF0C\u6682\u505C\u53D1\u9001\u5E76\u964D\u4F4E\u901F\u7387", {
          code: error.code,
          message: error.message,
          retryAfterMs: 6e4,
          bytesPerSecond: this.#outbound.bytesPerSecond
        });
        this.emit("status", this.status());
        return;
      }
      if (!authenticating && requestLevel) {
        this.logger.warn("relay", "Relay \u62D2\u7EDD\u4E86\u5355\u4E2A\u6570\u636E\u8BF7\u6C42\uFF0C\u4FDD\u6301\u8FDE\u63A5", {
          code: error.code,
          message: error.message
        });
        this.emit("status", this.status());
        return;
      }
      handshake.reportFailure?.(error);
      if (authenticating) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close();
      } else {
        handshake.socket?.close();
      }
      return;
    }
    if (message.type === "pong") {
      this.lastHeartbeat = nowIso();
      this.emit("status", this.status());
      return;
    }
    if (message.type === "stream.message" && message.protocol === "codex.resource.v1") {
      const resourceMessage = unwrapRelayFrame(message);
      if (resourceMessage?.type === "codex.resource.ready" && resourceMessage.requestId) {
        const pending = this.#resourceRequests.get(resourceMessage.requestId);
        if (pending) {
          this.#resourceRequests.delete(resourceMessage.requestId);
          pending.resolve(resourceMessage);
        }
      }
      return;
    }
    if (message.type === "stream.message" && message.protocol !== "codex.v1") return;
    const productMessage = unwrapRelayFrame(message);
    if (productMessage?.type === "codex.command") this.emit("command", productMessage);
  }
  async #hello(config, token, test) {
    const identity = await this.configStore.endpointIdentity();
    const spaceId = relaySpaceId(config.relay);
    const endpointId = relayEndpointId(config.relay);
    const requestId = randomId("hello");
    const issuedAt = Date.now();
    const nonce = crypto5.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-v1",
      PROTOCOL_VERSION,
      requestId,
      spaceId,
      endpointId,
      "bridge",
      token,
      issuedAt,
      nonce
    ].join("\n");
    const privateKey = crypto5.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
    });
    return {
      version: PROTOCOL_VERSION,
      type: "connect.hello",
      requestId,
      spaceId,
      endpointId,
      endpointType: "bridge",
      endpointName: config.relay.deviceName,
      token,
      endpointProof: {
        algorithm: "Ed25519",
        publicKey: identity.publicKey,
        issuedAt,
        nonce,
        signature: crypto5.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
      },
      capabilities: ["threads", "turns", "streaming", "steer", "interrupt", "approvals", "sync-v1", "resources-v1"],
      ...test ? { test: true } : {}
    };
  }
  #startHeartbeat() {
    clearInterval(this.#heartbeat);
    const seconds = this.configStore.get().relay.heartbeatSeconds;
    this.#heartbeat = setInterval(() => {
      this.send({
        version: PROTOCOL_VERSION,
        type: "ping",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: nowIso()
      });
    }, seconds * 1e3);
  }
  #handleFailure(error) {
    if (isTerminalRelayFailure(error, this.#credential)) {
      this.#manualClose = true;
      this.#credentialRefreshBlocked = true;
      clearTimeout(this.#tokenRefreshTimer);
      this.#tokenRefreshTimer = null;
    }
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay \u8FDE\u63A5\u5F02\u5E38", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }
  #scheduleReconnect(delayOverride = void 0) {
    if (this.#manualClose || this.#credentialRefreshBlocked || this.#reconnectTimer) return;
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = Math.max(this.#rateLimitUntil - Date.now(), delayOverride ?? Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1e3 + Math.floor(Math.random() * 500));
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay \u5DF2\u65AD\u5F00\uFF0C\u8BA1\u5212\u91CD\u8FDE", { attempt: this.#attempt, delayMs: delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#manualClose || this.#credentialRefreshBlocked) return;
      this.#beginOpen().catch(() => {
      });
    }, delay);
    this.#reconnectTimer.unref?.();
  }
  #scheduleTokenRefresh(delayOverride = void 0) {
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    if (this.#manualClose || this.#credentialRefreshBlocked || this.state !== "connected" || !this.#credential?.endpointGrant) return;
    const expiresAt = Number.isSafeInteger(this.#credential.expiresAt) && this.#credential.expiresAt > 0 ? this.#credential.expiresAt : null;
    const delay = delayOverride ?? (expiresAt == null ? UNKNOWN_EXPIRY_REFRESH_MS : Math.max(1e3, expiresAt - Date.now() - TOKEN_REFRESH_LEAD_MS));
    this.#tokenRefreshTimer = setTimeout(() => {
      this.#tokenRefreshTimer = null;
      this.#runScheduledTokenRefresh().catch(() => {
      });
    }, Math.max(250, delay));
    this.#tokenRefreshTimer.unref?.();
  }
  async #runScheduledTokenRefresh() {
    if (this.#manualClose || this.#credentialRefreshBlocked || this.state !== "connected") return;
    const socket = this.#socket;
    const credential = this.#credential;
    if (!socket || socket.readyState !== WebSocket.OPEN || !credential?.endpointGrant) return;
    const generation = this.#socketGeneration;
    const contextKey = this.#tokenRefreshKey(credential, generation);
    if (this.#tokenRefreshInFlight && this.#tokenRefreshContextKey === contextKey) return;
    const promise = (async () => {
      let rotationStarted = false;
      try {
        const refreshedCredential = await this.#usableCredential({ force: true, credential });
        const token = refreshedCredential?.connectToken || null;
        if (!token) throw new RelayError("AUTH_FAILED", "\u81EA\u52A8\u7EED\u671F\u672A\u8FD4\u56DE\u6709\u6548 Connect Token");
        if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
        let nextCredential = {
          ...credential,
          ...refreshedCredential || {},
          connectToken: token
        };
        const stored = await this.#authoritativeCredential();
        if (stored) {
          if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
          nextCredential = {
            ...stored || {},
            ...credential,
            ...refreshedCredential || {},
            connectToken: token
          };
        }
        this.#token = token;
        this.#credential = nextCredential;
        this.#forceTokenRefresh = false;
        this.#credentialRefreshBlocked = false;
        this.#rotationInProgress = true;
        rotationStarted = true;
        this.state = "reconnecting";
        this.emit("status", this.status());
        await closeSocket(socket, "connect token renewed");
        if (this.#socket === socket && this.#socketGeneration === generation) {
          this.#detachSocket(socket);
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) this.#scheduleReconnect(100);
        }
      } catch (error) {
        if (rotationStarted) {
          this.logger.warn("relay", "\u65E7 Relay \u8FDE\u63A5\u5173\u95ED\u5F02\u5E38\uFF0C\u7EE7\u7EED\u91CD\u8FDE", {
            code: error.code,
            message: error.message
          });
          return;
        }
        if (isTerminalRelayFailure(error, credential)) {
          this.#credentialRefreshBlocked = true;
          this.#manualClose = true;
          clearTimeout(this.#tokenRefreshTimer);
          this.#tokenRefreshTimer = null;
          this.state = "error";
          this.connectedAt = null;
          this.connectionId = null;
          this.features = [];
          this.lastError = error.message;
          this.logger.error("relay", "Connect Token \u81EA\u52A8\u7EED\u671F\u5DF2\u505C\u6B62", {
            code: error.code,
            message: error.message
          });
          this.emit("status", this.status());
          this.#rotationInProgress = true;
          const closed = await closeSocket(socket, "connect token renewal stopped");
          if (this.#socket === socket) {
            this.#detachSocket(socket);
          }
          this.#rotationInProgress = false;
          if (!closed) this.emit("disconnected", { code: error.code || "auth.refresh_rejected" });
          return;
        }
        this.lastError = error.message;
        this.logger.warn("relay", "Connect Token \u81EA\u52A8\u7EED\u671F\u6682\u65F6\u5931\u8D25\uFF0C\u7A0D\u540E\u91CD\u8BD5", {
          code: error.code,
          message: error.message
        });
        this.emit("status", this.status());
        this.#scheduleTokenRefresh(refreshRetryDelay(error));
      } finally {
        if (rotationStarted && this.#rotationInProgress && this.#socket === socket && this.#socketGeneration === generation) {
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) {
            this.#detachSocket(socket);
            this.#scheduleReconnect(100);
          }
        }
      }
    })();
    this.#tokenRefreshInFlight = promise;
    this.#tokenRefreshContextKey = contextKey;
    try {
      await promise;
    } finally {
      if (this.#tokenRefreshInFlight === promise) {
        this.#tokenRefreshInFlight = null;
        this.#tokenRefreshContextKey = null;
      }
    }
  }
  #isCurrentRefreshContext(socket, generation, credential) {
    return !this.#manualClose && this.#socket === socket && this.#socketGeneration === generation && this.state === "connected" && this.#credential?.endpointGrant === credential?.endpointGrant;
  }
  #tokenRefreshKey(credential, generation) {
    const config = this.configStore.get();
    return [
      generation,
      config.relay?.url || "",
      relaySpaceId(config.relay),
      relayEndpointId(config.relay),
      credential?.endpointGrant || "",
      credential?.tokenEndpoint || ""
    ].join("\0");
  }
  async #usableCredential(options) {
    if (typeof this.#tokenService.usableCredential === "function") {
      return this.#tokenService.usableCredential(options);
    }
    const token = await this.#tokenService.usableToken(options);
    return {
      ...options?.credential || {},
      ...token ? { connectToken: token } : {}
    };
  }
  async #authoritativeCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return null;
  }
  #detachSocket(socket) {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#outbound.clear();
    clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
    }
    this.#resourceRequests.clear();
  }
};
function isTerminalRelayFailure(error, credential) {
  const code = typeof error === "string" ? error : error?.code;
  if (isRetryableRefreshFailure(error)) return false;
  if (code === "connection.rejected") return true;
  if (isRefreshableCredentialFailure({ code }) && credential?.endpointGrant) return false;
  return TERMINAL_RELAY_AUTH_CODES.has(code);
}
function isRetryableRefreshFailure(error) {
  return error?.code === "RELAY_RETRYABLE" || error?.details?.retryable === true;
}
function refreshRetryDelay(error) {
  const retryAfterMs = error?.details?.retryAfterMs;
  return Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0 ? Math.max(250, retryAfterMs) : TOKEN_REFRESH_RETRY_MS;
}
function isRefreshableCredentialFailure(error) {
  const code = typeof error === "string" ? error : error?.code;
  return code === "auth.token_expired" || code === "auth.invalid_token";
}
function hasDifferentCredentialFields(supplied, stored) {
  if (supplied === void 0 || supplied === null) return false;
  const candidate = typeof supplied === "string" ? { connectToken: supplied.trim() } : supplied;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
  if (!stored) return Object.keys(candidate).some((field) => [
    "connectToken",
    "endpointGrant",
    "tokenEndpoint",
    "expiresAt",
    "grantExpiresAt"
  ].includes(field));
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint", "expiresAt", "grantExpiresAt"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const suppliedValue = candidate[field] == null ? "" : String(candidate[field]).trim();
    const storedValue = stored[field] == null ? "" : String(stored[field]).trim();
    if (suppliedValue !== storedValue) return true;
  }
  return false;
}
function closeSocket(socket, reason) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed === false ? false : true);
    };
    const timer = setTimeout(() => finish(false), 3e3);
    try {
      socket.addEventListener("close", finish, { once: true });
      socket.close(1e3, reason);
    } catch {
      finish();
    }
  });
}
function validateWelcomeIdentity(message, config) {
  const expectedSpaceId = relaySpaceId(config.relay);
  const expectedEndpointId = relayEndpointId(config.relay);
  if (message.spaceId !== expectedSpaceId || message.endpointId !== expectedEndpointId) {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7684 Space \u6216 Endpoint \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  }
}

// server/resource-images.js
import { execFile as execFile2 } from "node:child_process";
import fs10 from "node:fs/promises";
import os5 from "node:os";
import path11 from "node:path";
import { promisify as promisify2 } from "node:util";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var MAX_IMAGE_BYTES = 6 * 1024 * 1024;
var INLINE_THUMBNAIL_BYTES = 256 * 1024;
var execFileAsync2 = promisify2(execFile2);
function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;]+)?;base64,([a-z0-9+/=_-]+)$/i.exec(value.trim());
  if (!match) return null;
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: match[1].toLowerCase(), bytes };
}
function imageDataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
function imageMimeForPath(filePath) {
  const extension = path11.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif"
  }[extension] || "";
}
function localPathFromValue(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("file://")) {
    try {
      return fileURLToPath2(candidate);
    } catch {
      return null;
    }
  }
  return path11.isAbsolute(candidate) ? candidate : null;
}
async function parseLocalImage(value, declaredMime, allowedRoots) {
  const candidate = localPathFromValue(value);
  if (!candidate) return null;
  const roots = await Promise.all([os5.tmpdir(), ...allowedRoots || []].filter((root) => typeof root === "string" && path11.isAbsolute(root)).map(async (root) => {
    try {
      return await fs10.realpath(root);
    } catch {
      return path11.resolve(root);
    }
  }));
  let realPath;
  try {
    realPath = await fs10.realpath(candidate);
  } catch {
    return null;
  }
  if (!roots.some((root) => realPath === root || realPath.startsWith(`${root}${path11.sep}`))) return null;
  const mime = typeof declaredMime === "string" && declaredMime.toLowerCase().startsWith("image/") ? declaredMime.toLowerCase() : imageMimeForPath(realPath);
  if (!mime) return null;
  try {
    const stat = await fs10.stat(realPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return null;
    return { mime, bytes: await fs10.readFile(realPath) };
  } catch {
    return null;
  }
}
function thumbnailDataUrl(mime, bytes) {
  return bytes.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl(mime, bytes) : "";
}
async function createThumbnailDataUrl(mime, bytes) {
  const inline = thumbnailDataUrl(mime, bytes);
  if (inline || process.platform !== "darwin") return inline;
  const directory = await fs10.mkdtemp(path11.join(os5.tmpdir(), "recodex-thumb-"));
  const extension = mime.split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "") || "img";
  const input = path11.join(directory, `source.${extension}`);
  const output = path11.join(directory, "thumbnail.jpg");
  try {
    await fs10.writeFile(input, bytes, { mode: 384 });
    await execFileAsync2("sips", ["--resampleWidth", "640", "--setProperty", "format", "jpeg", input, "--out", output], { timeout: 5e3 });
    const thumbnail = await fs10.readFile(output);
    return thumbnail.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl("image/jpeg", thumbnail) : "";
  } catch {
    return "";
  } finally {
    await fs10.rm(directory, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function prepareEventImages(value, upload, seen = /* @__PURE__ */ new WeakSet(), options = {}) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => prepareEventImages(entry, upload, seen, options)));
  }
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = await prepareEventImages(entry, upload, seen, options);
  }
  const sourceKeys = ["dataUrl", "data_url", "imageUrl", "image_url", "url", "path", "filePath", "file_path", "localPath", "local_path", "data"];
  let sourceKey = null;
  let source = null;
  for (const key of sourceKeys) {
    const parsed = parseImageDataUrl(value[key]) || await parseLocalImage(
      value[key],
      value.mime || value.mimeType || value.mediaType,
      options.allowedRoots
    );
    if (parsed) {
      sourceKey = key;
      source = parsed;
      break;
    }
  }
  if (!source) return result;
  const existingThumbnail = parseImageDataUrl(value.thumbnailDataUrl || value.thumbnail_data_url);
  const thumb = existingThumbnail ? imageDataUrl(existingThumbnail.mime, existingThumbnail.bytes) : await createThumbnailDataUrl(source.mime, source.bytes);
  if (thumb) result.thumbnailDataUrl = thumb;
  try {
    const ready = await upload({ mime: source.mime, bytes: source.bytes });
    if (ready?.resourceUrl) {
      result.resourceUrl = ready.resourceUrl;
      if (ready.expiresAt) result.expiresAt = ready.expiresAt;
      if (sourceKey === "dataUrl" || sourceKey === "data_url" || sourceKey === "data") {
        delete result[sourceKey];
      } else {
        result[sourceKey] = ready.resourceUrl;
      }
    }
  } catch {
  }
  const removableSource = /* @__PURE__ */ new Set(["dataUrl", "data_url", "data", "url", "imageUrl", "image_url", "path", "filePath", "file_path", "localPath", "local_path"]);
  const localSource = ["path", "filePath", "file_path", "localPath", "local_path"].includes(sourceKey) || sourceKey === "url" && localPathFromValue(value[sourceKey]) !== null;
  if (!result.resourceUrl && removableSource.has(sourceKey) && (localSource || source.bytes.length > INLINE_THUMBNAIL_BYTES)) {
    delete result[sourceKey];
  }
  return result;
}

// server/remote-control.js
import fs11 from "node:fs/promises";
import os6 from "node:os";
import path12 from "node:path";
import { execFile as execFile3, spawn as spawn2 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
var exec = promisify3(execFile3);
var DEFAULT_TIMEOUT = 15e3;
var DEFAULT_STANDALONE = path12.join(os6.homedir(), ".codex", "packages", "standalone", "current", "codex");
var CONTROL_SOCKET = path12.join(os6.homedir(), ".codex", "app-server-control", "app-server-control.sock");
var bounded = (value) => redact(String(value || "")).replace(/[\0\r\n]+/g, " ").slice(0, 600);
var ownSocket = async (file, uid = process.getuid?.()) => {
  const stat = await fs11.stat(file).catch(() => null);
  return Boolean(stat?.isSocket() && (uid == null || stat.uid === uid));
};
async function detectInstallerProxy({ env = process.env, home = os6.homedir() } = {}) {
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    const value = String(env[key] || "").trim();
    if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  }
  const files = [
    path12.join(home, "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"),
    path12.join(home, ".config/clash/config.yaml"),
    path12.join(home, ".config/clash-verge/config.yaml")
  ];
  for (const file of files) {
    const text3 = await fs11.readFile(file, "utf8").catch(() => "");
    const port = text3.match(/^\s*(?:mixed-port|http-port):\s*(\d+)\s*$/m)?.[1];
    if (port && Number(port) > 0 && Number(port) < 65536) return `http://127.0.0.1:${port}`;
  }
  return null;
}
async function detectCodexAuth({ home = os6.homedir() } = {}) {
  try {
    const saved = JSON.parse(await fs11.readFile(path12.join(home, ".codex", "auth.json"), "utf8"));
    if (typeof saved?.OPENAI_API_KEY === "string" && saved.OPENAI_API_KEY) return "api_key";
    if (typeof saved?.tokens?.access_token === "string" && saved.tokens.access_token) return "chatgpt";
    if (typeof saved?.access_token === "string" && saved.access_token) return "chatgpt";
  } catch {
  }
  return "unknown";
}
function remoteControlPaths(home = os6.homedir()) {
  const codexHome = home || os6.homedir();
  return {
    executable: path12.join(codexHome, ".codex", "packages", "standalone", "current", "codex"),
    controlSocket: path12.join(codexHome, ".codex", "app-server-control", "app-server-control.sock")
  };
}
function extractRemoteControlResult(stdout, stderr = "") {
  const text3 = String(stdout || "").trim();
  let json = null;
  for (const line of text3.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        json = parsed;
        break;
      }
    } catch {
    }
  }
  const code = text3.match(/(?:pairing\s+code|code)\s*[:=]\s*([A-Z0-9][A-Z0-9-]{3,63})/i)?.[1] || null;
  const url = json?.websocket_url || json?.webSocketUrl || json?.url || null;
  return {
    state: json?.status || json?.state || (text3 ? "reported" : "unknown"),
    pairingCode: code,
    endpoint: typeof url === "string" && /^wss?:\/\//.test(url) ? url : null,
    message: bounded(json?.message || text3 || stderr)
  };
}
async function inspectRemoteControl({ home = os6.homedir(), executable, socketPath, platform = process.platform, run = exec } = {}) {
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  let version = null;
  let installed = false;
  if (platform === "darwin" || platform === "linux") {
    try {
      await fs11.access(binary, fs11.constants.X_OK);
      const result = await run(binary, ["--version"], { timeout: 4e3, maxBuffer: 4096 });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (/codex(?:-cli)?\s+\S+/i.test(output)) {
        installed = true;
        version = bounded(output);
      }
    } catch {
    }
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
    reason: installed ? authMode === "api_key" ? "\u5F53\u524D\u4F7F\u7528 API Key\uFF1B\u5B98\u65B9 Remote Control \u53EA\u63A5\u53D7 ChatGPT \u8D26\u53F7\u6388\u6743" : running ? "\u5B98\u65B9 Remote Control \u5DF2\u542F\u52A8\uFF1B\u63A7\u5236 Socket \u4EC5\u4F9B\u5B98\u65B9\u5BA2\u6237\u7AEF\u4F7F\u7528" : "\u5DF2\u627E\u5230\u5B98\u65B9 standalone \u5B89\u88C5\uFF0C\u53EF\u4ECE\u63A7\u5236\u53F0\u542F\u52A8 Remote Control" : "\u672A\u627E\u5230\u5B98\u65B9 standalone \u5B89\u88C5\uFF1B\u5F53\u524D Homebrew/\u684C\u9762\u5185\u7F6E CLI \u4E0D\u80FD\u4EE3\u66FF Remote Control daemon"
  };
  const bridge = {
    state: running ? "ready" : "blocked",
    endpoint: null,
    attachable: false,
    reason: running ? "\u5B98\u65B9\u63A7\u5236 Socket \u4E0D\u662F\u7B2C\u4E09\u65B9 App Server \u7AEF\u70B9\uFF0C\u9700\u5B98\u65B9\u6388\u6743\u6216\u684C\u9762\u6865\u63A5\u4EE3\u7406" : "\u7B49\u5F85\u5B98\u65B9 Remote Control \u6216\u684C\u9762\u5BBF\u4E3B\u63D0\u4F9B\u5DF2\u6388\u6743\u7684\u672C\u5730\u7AEF\u70B9"
  };
  return { checkedAt: (/* @__PURE__ */ new Date()).toISOString(), official, bridge, paths: { controlSocket: control } };
}
async function runRemoteControl(command, { home = os6.homedir(), executable, socketPath, run = exec, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  if (!["start", "stop", "pair"].includes(command)) throw new Error("\u4E0D\u652F\u6301\u7684 Remote Control \u64CD\u4F5C");
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  if (await detectCodexAuth({ home }) === "api_key") {
    const error = new Error("\u5B98\u65B9 Remote Control \u9700\u8981 ChatGPT \u8D26\u53F7\u6388\u6743\uFF1B\u5F53\u524D API Key \u767B\u5F55\u4E0D\u80FD\u4F7F\u7528\u6B64\u529F\u80FD");
    error.code = "REMOTE_CONTROL_AUTH_REQUIRED";
    throw error;
  }
  const exists = await fs11.access(binary, fs11.constants.X_OK).then(() => true, () => false);
  if (!exists) {
    const error = new Error("\u672A\u627E\u5230\u5B98\u65B9 standalone Codex\uFF1B\u8BF7\u5148\u4F7F\u7528\u5B98\u65B9\u5B89\u88C5\u5668\u5B89\u88C5\u540E\u91CD\u8BD5");
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
    const wrapped = new Error(authRequired ? "\u5B98\u65B9 Remote Control \u9700\u8981 ChatGPT \u8D26\u53F7\u6388\u6743\uFF1B\u5F53\u524D API Key \u767B\u5F55\u4E0D\u80FD\u4F7F\u7528\u6B64\u529F\u80FD" : detail || `\u5B98\u65B9 Remote Control ${command} \u5931\u8D25`);
    wrapped.code = authRequired ? "REMOTE_CONTROL_AUTH_REQUIRED" : error.code === "ETIMEDOUT" ? "REMOTE_CONTROL_TIMEOUT" : "REMOTE_CONTROL_FAILED";
    throw wrapped;
  }
}
async function installOfficialStandalone({ home = os6.homedir(), installerUrl = "https://chatgpt.com/codex/install.sh", fetchImpl = fetch, curlImpl = exec, spawnImpl = spawn2, proxy, timeoutMs = 12e4 } = {}) {
  if (!/^https:\/\/chatgpt\.com\/codex\/install\.sh$/.test(installerUrl)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u5730\u5740\u65E0\u6548");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  const target = remoteControlPaths(home).executable;
  if (await fs11.access(target, fs11.constants.X_OK).then(() => true, () => false)) {
    return { installed: true, alreadyPresent: true, executable: target };
  }
  const proxyUrl = proxy === void 0 ? await detectInstallerProxy({ home }) : proxy;
  let script = "";
  let finalUrl = installerUrl;
  if (proxyUrl && curlImpl) {
    try {
      const args = ["-fsSL", "--proto", "=https", "--connect-timeout", "10", "--max-time", "20", "--proxy", proxyUrl, "-w", "\n__CODEX_INSTALL_URL__%{url_effective}", installerUrl];
      const result = await curlImpl("/usr/bin/curl", args, { timeout: 3e4, maxBuffer: 3 * 1024 * 1024 });
      const marker = "\n__CODEX_INSTALL_URL__";
      const index = String(result.stdout || "").lastIndexOf(marker);
      script = index >= 0 ? String(result.stdout).slice(0, index) : String(result.stdout || "");
      finalUrl = index >= 0 ? String(result.stdout).slice(index + marker.length).trim() : installerUrl;
    } catch (error) {
      const wrapped = new Error(`\u65E0\u6CD5\u901A\u8FC7\u672C\u673A\u4EE3\u7406\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A${bounded(error.stderr || error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    }
  } else {
    let response;
    const downloadController = new AbortController();
    const downloadTimer = setTimeout(() => downloadController.abort(), Math.min(timeoutMs, 2e4));
    try {
      response = await fetchImpl(installerUrl, { redirect: "follow", signal: downloadController.signal });
    } catch (error) {
      const wrapped = new Error(error.name === "AbortError" ? "\u65E0\u6CD5\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A\u7F51\u7EDC\u8FDE\u63A5\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5" : `\u65E0\u6CD5\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A${bounded(error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    } finally {
      clearTimeout(downloadTimer);
    }
    if (!response.ok) {
      const error = new Error(`\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
      error.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw error;
    }
    script = await response.text();
    finalUrl = response.url || installerUrl;
  }
  let final;
  try {
    final = new URL(finalUrl);
  } catch {
    final = null;
  }
  if (!final || !["chatgpt.com", "www.chatgpt.com", "openai.com", "www.openai.com", "releases.openai.com"].includes(final.hostname)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u91CD\u5B9A\u5411\u5230\u4E86\u4E0D\u53D7\u4FE1\u4EFB\u7684\u5730\u5740");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  if (!script || script.length > 2 * 1024 * 1024 || !/codex/i.test(script)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u5185\u5BB9\u65E0\u6548");
    error.code = "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID";
    throw error;
  }
  const env = { ...process.env, HOME: home, CI: "1", TERM: "dumb", CODEX_NON_INTERACTIVE: "true", ...proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, ALL_PROXY: proxyUrl } : {} };
  const child = spawnImpl("/bin/sh", ["-s"], { cwd: home, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk}`.slice(-8e3);
  };
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
      const error = new Error(`\u5B98\u65B9 standalone \u5B89\u88C5\u5931\u8D25\uFF1A${bounded(output)}`);
      error.code = result.signal ? "REMOTE_CONTROL_INSTALL_TIMEOUT" : "REMOTE_CONTROL_INSTALL_FAILED";
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
  if (!await fs11.access(target, fs11.constants.X_OK).then(() => true, () => false)) {
    const error = new Error("\u5B89\u88C5\u811A\u672C\u5DF2\u5B8C\u6210\uFF0C\u4F46\u672A\u627E\u5230 standalone Codex \u53EF\u6267\u884C\u6587\u4EF6");
    error.code = "REMOTE_CONTROL_INSTALL_INCOMPLETE";
    throw error;
  }
  return { installed: true, alreadyPresent: false, executable: target };
}

// server/connector-service.js
var ConnectorService = class _ConnectorService extends EventEmitter5 {
  #unsupportedNotificationMethods = /* @__PURE__ */ new Set();
  static MAX_THREAD_ACCESS_ENTRIES = 1e3;
  static MAX_PENDING_EVENTS = 256;
  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.instanceLock = options.instanceLock || null;
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.remoteControl = options.remoteControl || {
      inspect: () => inspectRemoteControl(),
      start: () => runRemoteControl("start"),
      stop: () => runRemoteControl("stop"),
      pair: () => runRemoteControl("pair"),
      install: () => installOfficialStandalone()
    };
    this.remoteControlInstalling = false;
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1e3, {
      maxBytes: options.eventBufferMaxBytes,
      maxEventBytes: options.eventMaxBytes
    });
    this.dashboard = null;
    this.startedAt = null;
    this.starting = null;
    this.autoConnectStarted = false;
    this.eventQueue = Promise.resolve();
    this.#pendingEvents = [];
    this.#eventWorker = null;
    this.#eventQueueOverflowed = false;
    this.threadAccess = /* @__PURE__ */ new Map();
    this.eventStreamId = randomUUID4();
    this.router = new CommandRouter({
      configStore: this.configStore,
      appServer: this.appServer,
      service: this,
      logger: this.logger
    });
    this.#wireEvents();
  }
  async start() {
    if (this.startedAt) return this.status();
    if (!this.starting) {
      this.starting = (async () => {
        await this.configStore.load();
        this.instanceLock ||= new InstanceLock(this.configStore.configDir);
        this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.logger.info("connector", "Codex Relay Connector \u5DF2\u542F\u52A8");
        await this.router.journal.prune();
      })();
    }
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
    if (this.configStore.get().relay.autoConnect && !this.autoConnectStarted) {
      this.autoConnectStarted = true;
      this.connect().catch((error) => this.logger.error("connector", "\u81EA\u52A8\u8FDE\u63A5\u5931\u8D25", { message: error.message }));
    }
    return this.status();
  }
  attachDashboard(dashboard) {
    this.dashboard = dashboard;
  }
  async stop() {
    this.#pendingEvents.length = 0;
    this.#eventQueueOverflowed = false;
    await this.disconnect("connector stopped");
    await this.appServer.stop();
    await this.dashboard?.stop();
    this.startedAt = null;
    this.autoConnectStarted = false;
  }
  async connect() {
    await this.start();
    const config = this.configStore.get();
    const credential = await this.configStore.relayCredential();
    await this.instanceLock.acquire();
    try {
      if (config.codex.autoStartAppServer) await this.appServer.start();
      return await this.relay.connect(credential);
    } catch (error) {
      if (this.relay.state !== "reconnecting") await this.instanceLock.release();
      throw error;
    }
  }
  async disconnect(reason = "manual disconnect") {
    await this.relay.disconnect(reason);
    await this.instanceLock?.release();
    return this.status();
  }
  // Restart the App Server process owned by this plugin.
  async restartAppServerConnection() {
    await this.appServer.stop();
    await this.appServer.start();
    this.emit("status", await this.status());
    return this.status();
  }
  async reconnectRelay() {
    await this.disconnect("dashboard reconnect");
    return this.connect();
  }
  async testConnection() {
    await this.start();
    return this.relay.test(await this.configStore.relayCredential());
  }
  async remoteControlStatus() {
    return this.remoteControl.inspect();
  }
  async remoteControlStart() {
    const result = await this.remoteControl.start();
    this.emit("status", await this.status());
    return result;
  }
  async remoteControlStop() {
    const result = await this.remoteControl.stop();
    this.emit("status", await this.status());
    return result;
  }
  async remoteControlPair() {
    return this.remoteControl.pair();
  }
  async remoteControlInstall() {
    if (this.remoteControlInstalling) {
      const error = new RelayError("REMOTE_CONTROL_INSTALL_BUSY", "\u5B98\u65B9 standalone \u6B63\u5728\u5B89\u88C5\uFF0C\u8BF7\u7A0D\u5019");
      throw error;
    }
    this.remoteControlInstalling = true;
    try {
      return await this.remoteControl.install();
    } finally {
      this.remoteControlInstalling = false;
    }
  }
  async updateConfig(patch, credentialPatch) {
    const previous = this.configStore.get();
    this.configStore.preview?.(patch);
    const wasConnected = ["connected", "connecting", "authenticating", "reconnecting"].includes(this.relay.state);
    if (wasConnected) await this.disconnect("configuration changed");
    const config = await this.configStore.update(patch, credentialPatch);
    const backendChanged = ["executable", "defaultWorkingDirectory", "autoStartAppServer"].some((key) => previous.codex[key] !== config.codex[key]);
    const accessChanged = JSON.stringify([previous.allowedProjects, previous.permissions, previous.readOnly]) !== JSON.stringify([config.allowedProjects, config.permissions, config.readOnly]);
    if (backendChanged || accessChanged) {
      await this.appServer.stop();
      this.#pendingEvents.length = 0;
      await this.eventQueue.catch(() => {
      });
      this.#resetEventStream();
      this.router = new CommandRouter({ configStore: this.configStore, appServer: this.appServer, service: this, logger: this.logger });
    }
    this.threadAccess.clear();
    if (wasConnected || config.relay.autoConnect) await this.connect();
    this.emit("status", await this.status());
    return config;
  }
  #rememberThreadAccess(threadId, allowed) {
    const id = String(threadId || "").trim();
    if (!id) return;
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { allowed: Boolean(allowed), touchedAt: Date.now() });
    while (this.threadAccess.size > _ConnectorService.MAX_THREAD_ACCESS_ENTRIES) {
      this.threadAccess.delete(this.threadAccess.keys().next().value);
    }
  }
  #pendingEvents;
  #eventWorker;
  #eventQueueOverflowed;
  #resetEventStream() {
    this.eventBuffer.invalidateReplay();
    this.eventStreamId = randomUUID4();
    this.#pendingEvents.length = 0;
  }
  #enqueueEvent(event, params = {}) {
    const context = extractContext(params);
    const isDelta = event.type.endsWith(".delta") || event.type === "tool.output";
    if (this.#pendingEvents.length >= _ConnectorService.MAX_PENDING_EVENTS) {
      this.#eventQueueOverflowed = true;
      this.#resetEventStream();
    }
    this.#pendingEvents.push({ event, params, isDelta, threadId: context.threadId, eventStreamId: this.eventStreamId });
    if (!this.#eventWorker) {
      this.#eventWorker = this.#drainEvents();
      this.eventQueue = this.#eventWorker.finally(() => {
        this.#eventWorker = null;
      });
    }
  }
  async #drainEvents() {
    while (this.#pendingEvents.length) {
      const entry = this.#pendingEvents.shift();
      try {
        await this.#forwardEvent(entry.event, entry.params, entry.eventStreamId);
      } catch (error) {
        this.#resetEventStream();
        this.logger.warn("connector", "Codex \u4E8B\u4EF6\u8F6C\u53D1\u5931\u8D25", { message: error.message });
      }
    }
  }
  #readThreadAccess(threadId) {
    const id = String(threadId || "").trim();
    const entry = this.threadAccess.get(id);
    if (!entry) return void 0;
    if (Date.now() - entry.touchedAt > 15 * 60 * 1e3) {
      this.threadAccess.delete(id);
      return void 0;
    }
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { ...entry, touchedAt: Date.now() });
    return entry.allowed;
  }
  async status() {
    const config = await this.configStore.publicConfig();
    return {
      connector: {
        state: this.startedAt ? "running" : "stopped",
        startedAt: this.startedAt
      },
      relay: this.relay.status(),
      appServer: this.appServer.status(),
      capabilities: { imageAttachments: !config.readOnly && config.permissions.sendMessages ? IMAGE_INPUT_LIMITS : null },
      eventStreamId: this.eventStreamId,
      space: {
        spaceId: relaySpaceId(config.relay),
        endpointId: relayEndpointId(config.relay),
        endpointType: "bridge",
        deviceId: config.relay.deviceId,
        deviceName: config.relay.deviceName
      },
      security: {
        readOnly: config.readOnly,
        allowedProjects: config.allowedProjects.length,
        remoteApprovalEnabled: config.permissions.respondToApprovals,
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
        endpointPublicKey: config.relay.endpointPublicKey
      },
      protocol: {
        version: 1,
        latestSequence: this.eventBuffer.latestSequence(),
        bufferedEvents: this.eventBuffer.size,
        bufferedBytes: this.eventBuffer.bytes,
        threadAccessEntries: this.threadAccess.size,
        pendingEventQueue: this.#pendingEvents.length,
        eventQueueOverflowed: this.#eventQueueOverflowed
      },
      dashboard: this.dashboard?.status() || { state: "stopped", url: null }
    };
  }
  async diagnostics() {
    const checks = [];
    try {
      checks.push({ name: "codex", ok: true, ...await this.appServer.checkAvailability() });
    } catch (error) {
      checks.push({ name: "codex", ok: false, error: error.message });
    }
    const config = await this.configStore.publicConfig();
    checks.push({
      name: "configuration",
      ok: Boolean(config.relay.url && relaySpaceId(config.relay) && relayEndpointId(config.relay) && config.relay.credentialConfigured),
      details: {
        relayUrlConfigured: Boolean(config.relay.url),
        spaceConfigured: Boolean(relaySpaceId(config.relay)),
        endpointConfigured: Boolean(relayEndpointId(config.relay)),
        endpointId: relayEndpointId(config.relay),
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint
      }
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }
  async prepareResourceImages(value) {
    const config = this.configStore.get();
    return prepareEventImages(value, async ({ mime, bytes }) => {
      try {
        return await this.relay.uploadResource({ mime, data: bytes });
      } catch (error) {
        this.logger.warn("resource", "\u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u5931\u8D25\uFF0C\u4FDD\u7559\u5185\u8054\u56DE\u9000", { message: error.message });
        return null;
      }
    }, /* @__PURE__ */ new WeakSet(), {
      allowedRoots: [
        this.router?.images?.directory,
        ...Array.isArray(config.allowedProjects) ? config.allowedProjects : [],
        config.codex?.defaultWorkingDirectory
      ]
    });
  }
  async syncAfter(lastSequence, eventStreamId) {
    if (lastSequence == null) return this.#snapshotSync();
    if (eventStreamId && eventStreamId !== this.eventStreamId) return this.#snapshotSync();
    if (this.#eventQueueOverflowed) {
      this.#eventQueueOverflowed = false;
      return this.#snapshotSync();
    }
    const events = this.eventBuffer.after(lastSequence);
    const requestedSequence = Number(lastSequence || 0);
    const latestSequence = this.eventBuffer.latestSequence();
    if (events !== null && requestedSequence <= latestSequence && !(requestedSequence === 0 && events.length === 0 && !eventStreamId)) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence(), eventStreamId: this.eventStreamId };
    }
    return this.#snapshotSync();
  }
  async #snapshotSync(attempt = 0) {
    const latestSequence = this.eventBuffer.latestSequence();
    const eventStreamId = this.eventStreamId;
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 100 }), allowedProjects);
    let projects = { data: [], nextCursor: null };
    if (typeof this.appServer.listProjects === "function") {
      try {
        projects = filterProjectList(
          await this.appServer.listProjects({ limit: 100 }),
          allowedProjects
        );
      } catch (error) {
        this.logger.warn("connector", "\u9879\u76EE\u5217\u8868\u4E0D\u53EF\u7528\uFF0C\u4F7F\u7528\u4EFB\u52A1\u76EE\u5F55\u56DE\u9000", {
          message: error.message
        });
      }
    }
    const status = await this.status();
    if (eventStreamId !== this.eventStreamId) {
      if (attempt < 2) return this.#snapshotSync(attempt + 1);
      throw new RelayError("APP_SERVER_UNAVAILABLE", "\u540E\u7AEF\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u4EFB\u52A1");
    }
    return {
      mode: "snapshot",
      status,
      threads,
      projects,
      latestSequence,
      eventStreamId
    };
  }
  #wireEvents() {
    this.relay.on("command", async (message) => {
      const connectionId = this.relay.connectionId;
      const response = await this.router.handle(message);
      if (connectionId !== this.relay.connectionId) return;
      if (!this.relay.send(response)) {
        this.logger.warn("connector", "Relay \u672A\u63A5\u53D7\u5B9A\u5411\u547D\u4EE4\u54CD\u5E94\uFF0C\u6D88\u606F\u672A\u53D1\u9001", {
          requestId: message?.requestId,
          targetDeviceId: response?.targetDeviceId
        });
      }
    });
    this.relay.on("connected", async () => {
      this.relay.send({
        version: 1,
        type: "host.snapshot",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: await this.status()
      });
    });
    this.relay.on("status", (status) => this.emit("status", status));
    this.relay.on("disconnected", () => {
      this.instanceLock?.release().catch((error) => {
        this.logger.warn("connector", "\u91CA\u653E Connector \u5B9E\u4F8B\u9501\u5931\u8D25", { message: error.message });
      });
    });
    this.appServer.on("status", (status) => {
      this.emit("status", status);
      if (status.state === "reconnecting") this.#resetEventStream();
      if (this.relay.state === "connected") {
        this.status().then((current) => this.relay.send({
          version: 1,
          type: "host.snapshot",
          spaceId: relaySpaceId(this.configStore.get().relay),
          deviceId: this.configStore.get().relay.deviceId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          status: current
        })).catch((error) => this.logger.warn("connector", "\u540E\u7AEF\u8FDE\u63A5\u72B6\u6001\u540C\u6B65\u5931\u8D25", { message: error.message }));
      }
    });
    this.appServer.on("notification", (method, params) => {
      const event = normalizeCodexNotification(method, params);
      if (!event) {
        if (!this.#unsupportedNotificationMethods.has(method)) {
          this.#unsupportedNotificationMethods.add(method);
          this.logger.warn("app-server", "\u5FFD\u7565\u4E0D\u652F\u6301\u7684 Codex \u901A\u77E5", { method });
        }
        return;
      }
      this.#enqueueEvent(event, params);
    });
    this.appServer.on("approval", (approval) => {
      this.#enqueueEvent({ type: "approval.requested", ...approval }, approval.params);
    });
    this.appServer.on("interactionResolved", (interaction) => {
      this.#enqueueEvent({ type: "interaction.resolved", ...interaction }, interaction.params);
    });
  }
  async #forwardEvent(event, params = {}, eventStreamId = this.eventStreamId) {
    if (!await this.#isEventAllowed(params)) return;
    const config = this.configStore.get();
    const preparedEvent = await this.prepareResourceImages(event);
    if (eventStreamId !== this.eventStreamId) return;
    const envelope = eventEnvelope(config, this.eventBuffer, preparedEvent, extractContext(params));
    envelope.eventStreamId = this.eventStreamId;
    const sent = this.relay.send(envelope);
    if (!sent) {
      this.logger.warn("connector", "Relay \u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u4E8B\u4EF6\u5DF2\u4FDD\u7559\u5F85\u540C\u6B65", {
        eventId: envelope.eventId,
        sequence: envelope.sequence,
        type: event.type
      });
    }
    this.emit("event", envelope);
  }
  async #isEventAllowed(params) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return true;
    const context = extractContext(params);
    const cwd = params.cwd || params.thread?.cwd;
    if (cwd) {
      const allowed = Boolean(safeProjectPath(cwd, allowedProjects));
      if (context.threadId) this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    }
    if (!context.threadId) return false;
    const cached = this.#readThreadAccess(context.threadId);
    if (cached !== void 0) return cached;
    try {
      const result = await this.appServer.readThreadStatus(context.threadId, { ensureResumed: false });
      const allowed = Boolean(result?.thread?.cwd && safeProjectPath(result.thread.cwd, allowedProjects));
      this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    } catch (error) {
      this.logger.warn("connector", "\u65E0\u6CD5\u786E\u8BA4\u4E8B\u4EF6\u6240\u5C5E\u9879\u76EE\uFF0C\u5DF2\u505C\u6B62\u8FDC\u7A0B\u8F6C\u53D1", { threadId: context.threadId, message: error.message });
      return false;
    }
  }
};

// server/dashboard-server.js
import crypto6 from "node:crypto";
import fs13 from "node:fs/promises";
import http from "node:http";
import path14 from "node:path";

// server/environment-service.js
import fs12 from "node:fs/promises";
import { constants } from "node:fs";
import os7 from "node:os";
import path13 from "node:path";
import { execFile as execFile4 } from "node:child_process";
import { promisify as promisify4 } from "node:util";
var exec2 = promisify4(execFile4);
var CACHE_MS = 15e3;
var STALE_MS = 6e4;
var clean = (value) => typeof value === "string" ? redact(value).slice(0, 600) : null;
var samePath = (a, b) => typeof a === "string" && typeof b === "string" && path13.resolve(a) === path13.resolve(b);
async function inspectExecutable(configured, options = {}) {
  const env = options.env || process.env;
  const run = options.exec || exec2;
  const platform = options.platform || process.platform;
  const candidates = [];
  const add = (value) => {
    if (value && path13.isAbsolute(value) && !candidates.includes(value)) candidates.push(value);
  };
  if (path13.isAbsolute(configured || "")) add(configured);
  else if (configured && !/[\\/]/.test(configured)) {
    for (const directory of (env.PATH || "").split(path13.delimiter)) if (path13.isAbsolute(directory)) add(path13.join(directory, configured));
  }
  const configuredCandidates = [...candidates];
  if (path13.basename(env.CODEX_CLI_PATH || "") === "codex") add(env.CODEX_CLI_PATH);
  if (env.CODEX_ELECTRON_RESOURCES_PATH) add(path13.join(env.CODEX_ELECTRON_RESOURCES_PATH, "codex"));
  if (platform === "darwin") {
    add("/Applications/ChatGPT.app/Contents/Resources/codex");
    add("/Applications/Codex.app/Contents/Resources/codex");
  }
  let candidate = null;
  let configuredValid = false;
  for (const file of candidates) {
    try {
      await fs12.access(file, constants.X_OK);
      const { stdout } = await run(file, ["--version"], { timeout: 2500, maxBuffer: 4096, env });
      const version = stdout.trim();
      if (!/^codex-cli\s+[^\s]+$/.test(version)) continue;
      candidate = { path: file, version };
      configuredValid = configuredCandidates.includes(file);
      break;
    } catch {
    }
  }
  return {
    state: configuredValid ? "ok" : "error",
    configured: configured || "codex",
    resolved: configuredValid ? candidate?.path : null,
    version: configuredValid ? candidate?.version : null,
    candidate,
    needsRepair: Boolean(candidate && (!configuredValid || configured !== candidate.path)),
    message: configuredValid ? "Codex \u7A0B\u5E8F\u9A8C\u8BC1\u901A\u8FC7" : candidate ? "\u5F53\u524D\u547D\u4EE4\u4E0D\u53EF\u7528\uFF0C\u5DF2\u627E\u5230\u53EF\u7528\u7684 Codex \u7A0B\u5E8F" : "\u672A\u627E\u5230\u53EF\u7528\u7684 Codex \u7A0B\u5E8F\uFF0C\u8BF7\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u5B89\u88C5\u8DEF\u5F84"
  };
}
function processConflicts(output, allowedPids = []) {
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || allowedPids.includes(Number(match[1]))) return [];
    const command = match[3];
    if (/^\/.*\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:$|\s+--)/.test(command)) return [{ pid: Number(match[1]), kind: "desktop" }];
    if (/(?:^|\/)codex\s+(?:.*?\s)?app-server(?:\s|$)/.test(command) && !/app-server\s+(?:proxy|daemon|generate-)/.test(command)) return [{ pid: Number(match[1]), kind: "backend" }];
    if (/\bnode\s+.*\/(?:agent-cli|mcp-server|dashboard-cli)\.js(?:\s|$)/.test(command)) return [{ pid: Number(match[1]), kind: "relay" }];
    return [];
  });
}
var EnvironmentService = class {
  constructor(service, options = {}) {
    this.service = service;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exec = options.exec || exec2;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.codexHome = this.env.CODEX_HOME || path13.join(os7.homedir(), ".codex");
    this.cache = null;
    this.pending = null;
    this.repairing = false;
    this.remoteControl = options.remoteControl || service.remoteControl || null;
  }
  async inspect(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && Date.now() - this.cache.time < CACHE_MS) return this.cache.value;
    this.pending = this.collect();
    try {
      const value = await this.pending;
      this.cache = { time: Date.now(), value };
      return value;
    } finally {
      this.pending = null;
    }
  }
  async collect() {
    const config = this.service.configStore.get();
    const configDir = this.service.configStore.configDir;
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    const [executable, processes, installed, remoteControl] = await Promise.all([
      inspectExecutable(config.codex.executable, { env: this.env, platform: this.platform, exec: this.exec }),
      this.inspectProcesses(),
      fs12.readFile(path13.join(this.pluginRoot, ".codex-plugin/plugin.json"), "utf8").then(JSON.parse).catch(() => null),
      this.remoteControl?.inspect ? Promise.resolve().then(() => this.remoteControl.inspect()).catch((error) => ({ checkedAt, official: { state: "error", installed: false, reason: clean(error.message) }, bridge: { state: "blocked", attachable: false, endpoint: null, reason: "Remote Control \u72B6\u6001\u68C0\u67E5\u5931\u8D25" } })) : Promise.resolve(null)
    ]);
    const status = await this.service.status();
    const runningVersion = "1.0.0+codex.20260912223014";
    const runningBuild = "1.0.0+codex.20260912223014:1789252227083";
    const diskBundle = runningBuild ? await fs12.readFile(path13.join(this.pluginRoot, "server/agent-cli.js"), "utf8").catch(() => null) : null;
    const needsRestart = runningBuild && diskBundle !== null ? !diskBundle.includes(JSON.stringify(runningBuild)) : installed?.version && runningVersion !== "development" ? installed.version !== runningVersion : null;
    const owned = processes.items.filter((p) => p.scope === "same" && (p.kind === "backend" || p.kind === "relay"));
    const repairAllowed = ["stopped", "error"].includes(status.appServer?.state) && executable.needsRepair;
    return {
      checkedAt,
      staleAfterMs: STALE_MS,
      platform: this.platform,
      plugin: { installedVersion: installed?.version || null, runningVersion, needsRestart, pid: process.pid, startedAt: status.connector?.startedAt, root: this.pluginRoot },
      desktop: { version: null, running: processes.state === "ok" ? processes.items.some((p) => p.kind === "desktop" && p.scope === "same") : null },
      executable,
      processes,
      backend: { mode: "managed", state: status.appServer?.state || "unknown", pid: status.appServer?.pid ?? null, ownsProcess: status.appServer?.ownsProcess ?? null, endpoint: null, error: clean(status.appServer?.lastError) },
      desktopBackend: { state: "unavailable", pid: null, transport: null, endpoint: null, attachable: false, reason: "\u684C\u9762\u7248 App Server \u4E0E Relay \u72EC\u7ACB\u8FD0\u884C\uFF1BRelay \u4F7F\u7528\u81EA\u5DF1\u7684\u6258\u7BA1\u8FDB\u7A0B" },
      remoteControl: remoteControl || { checkedAt, official: { state: "unavailable", installed: false, reason: "\u672A\u68C0\u67E5" }, bridge: { state: "blocked", endpoint: null, attachable: false, reason: "\u672A\u68C0\u67E5" } },
      relay: { state: status.relay?.state || "unknown", lastHeartbeat: status.relay?.lastHeartbeat || null, reconnectAttempt: status.relay?.reconnectAttempt || 0 },
      sharing: { state: "managed", label: "\u63D2\u4EF6\u6258\u7BA1\u5DF2\u542F\u7528", message: "Codex App Server \u7531\u63D2\u4EF6\u5728\u672C\u673A\u7BA1\u7406\uFF0CRelay \u8D1F\u8D23\u8BA4\u8BC1\u3001\u5916\u7F51\u6865\u63A5\u548C\u534F\u8BAE\u8F6C\u53D1\u3002" },
      desktopTools: { state: "unchecked", label: "\u5F53\u524D\u8FDE\u63A5\u672A\u9A8C\u8BC1", message: "\u684C\u9762\u5DE5\u5177\u7531 Codex App Server \u672C\u5730\u914D\u7F6E\u7BA1\u7406\u3002" },
      paths: { configDir, codexHome: this.codexHome },
      actions: { repair: { enabled: Boolean(repairAllowed), candidate: executable.candidate?.path || null, reason: !executable.candidate ? "\u5C1A\u672A\u627E\u5230\u53EF\u7528\u7A0B\u5E8F\uFF0C\u8BF7\u5148\u5B89\u88C5 Codex \u6216\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u8DEF\u5F84" : !executable.needsRepair ? "\u5F53\u524D\u5DF2\u4F7F\u7528\u9A8C\u8BC1\u8FC7\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u65E0\u9700\u4FEE\u590D" : !repairAllowed ? "\u540E\u7AEF\u6B63\u5728\u4F7F\u7528\u4E2D\uFF0C\u8BF7\u5728\u505C\u6B62\u6267\u884C\u540E\u901A\u8FC7\u9AD8\u7EA7\u8BBE\u7F6E\u4FEE\u6539\u8DEF\u5F84" : "\u9A8C\u8BC1\u5019\u9009\u8DEF\u5F84\u540E\u4FDD\u5B58\uFF1B\u81EA\u52A8\u8FDE\u63A5\u5DF2\u5F00\u542F\u65F6\u4F1A\u5C1D\u8BD5\u6062\u590D\u8FDE\u63A5" } }
    };
  }
  async inspectProcesses() {
    if (this.platform === "win32") return { state: "unsupported", items: [], message: "\u5F53\u524D\u5E73\u53F0\u6682\u4E0D\u652F\u6301\u8FDB\u7A0B\u5360\u7528\u68C0\u67E5" };
    try {
      const { stdout } = await this.exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3e3, maxBuffer: 8 * 1024 * 1024 });
      const items = await Promise.all(processConflicts(stdout).map(async (item) => {
        const line = stdout.split("\n").find((line2) => Number(line2.trim().split(/\s+/)[0]) === item.pid) || "";
        const command = line.trim().replace(/^\d+\s+\d+\s+/, "");
        const application = item.kind === "desktop" ? "Codex \u684C\u9762" : item.kind === "relay" ? "Relay \u63D2\u4EF6" : "Codex App Server";
        const details = await this.exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="], { timeout: 2e3, maxBuffer: 1024 * 1024 }).then((r) => r.stdout, () => "");
        const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
        const selected = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`))?.[1];
        const defaultDir = path13.join(os7.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
        const target = item.kind === "relay" ? this.service.configStore.configDir : this.codexHome;
        return { ...item, application, scope: !details ? "unknown" : samePath(selected || defaultDir, target) ? "same" : "other", taskState: "unknown" };
      }));
      return { state: "ok", items, message: "\u4EC5\u68C0\u67E5\u8FDB\u7A0B\u548C\u6570\u636E\u76EE\u5F55\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u7ED3\u675F\u8FD9\u4E9B\u8FDB\u7A0B\u3002" };
    } catch {
      return { state: "error", items: [], message: "\u8FDB\u7A0B\u68C0\u67E5\u5931\u8D25\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u6CA1\u6709\u5360\u7528" };
    }
  }
  async repairExecutable(expected = {}) {
    if (this.repairing) throw new RelayError("ENVIRONMENT_BUSY", "\u6B63\u5728\u4FEE\u590D\u6267\u884C\u8DEF\u5F84\uFF0C\u8BF7\u7A0D\u5019");
    this.repairing = true;
    try {
      const current = await this.inspect(true);
      if (!current.actions.repair.enabled) throw new RelayError("REPAIR_NOT_AVAILABLE", current.actions.repair.reason);
      if (expected.configured !== current.executable.configured || expected.candidate !== current.actions.repair.candidate) throw new RelayError("ENVIRONMENT_CHANGED", "\u73AF\u5883\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u518D\u4FEE\u590D");
      const backend = this.service.appServer.status();
      if (!["stopped", "error"].includes(backend.state) || this.service.configStore.get().codex.executable !== expected.configured) throw new RelayError("ENVIRONMENT_CHANGED", "\u540E\u7AEF\u6216\u914D\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
      let connectionError = null;
      try {
        await this.service.updateConfig({ codex: { executable: current.actions.repair.candidate } });
      } catch (error) {
        if (this.service.configStore.get().codex.executable !== current.actions.repair.candidate) throw error;
        connectionError = "\u8DEF\u5F84\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u8FDE\u63A5\u5C1A\u672A\u6062\u590D\uFF1B\u8BF7\u67E5\u770B\u540E\u7AEF\u4E0E Relay \u72B6\u6001";
      }
      this.cache = null;
      return { saved: true, executable: current.actions.repair.candidate, connectionError, environment: await this.inspect(true) };
    } finally {
      this.repairing = false;
    }
  }
};

// server/dashboard-server.js
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};
var DASHBOARD_PORT = 3210;
var DASHBOARD_COOKIE = "codex_relay_session";
var DASHBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
function configuredDashboardPort() {
  const raw = process.env.CODEX_RELAY_DASHBOARD_PORT?.trim();
  if (!raw) return DASHBOARD_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("CODEX_RELAY_DASHBOARD_PORT \u5FC5\u987B\u662F 0 \u5230 65535 \u4E4B\u95F4\u7684\u6574\u6570");
  }
  return port;
}
var DashboardServer = class {
  #server = null;
  #accessKey = crypto6.randomBytes(24).toString("base64url");
  #sessionTokenHashes = [];
  #port = null;
  #listenPort;
  #sessionFile;
  constructor(service, logger, options = {}) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path14.join(PLUGIN_ROOT, "ui");
    this.#listenPort = options.port ?? configuredDashboardPort();
    this.#sessionFile = path14.join(service.configStore.configDir, "dashboard-session.json");
    this.environment = options.environment || new EnvironmentService(service);
  }
  async start() {
    if (this.#server) return this.url();
    await this.#loadOrCreateSession();
    this.#server = http.createServer((request, response) => {
      this.#handle(request, response).catch((error) => {
        this.logger.error("dashboard", "\u63A7\u5236\u53F0\u8BF7\u6C42\u5931\u8D25", { message: error.message });
        this.#json(response, 500, { error: { code: "INTERNAL_ERROR", message: error.message } });
      });
    });
    try {
      await new Promise((resolve, reject) => {
        this.#server.once("error", reject);
        this.#server.listen(this.#listenPort, "127.0.0.1", resolve);
      });
    } catch (error) {
      if (error.code !== "EADDRINUSE" || this.#listenPort === 0) {
        this.#server = null;
        throw error;
      }
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
      this.#listenPort = 0;
      return this.start();
    }
    this.#port = this.#server.address().port;
    this.logger.info("dashboard", "\u672C\u5730\u914D\u7F6E\u63A7\u5236\u53F0\u5DF2\u542F\u52A8", { port: this.#port });
    return this.url();
  }
  async stop() {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = null;
    await new Promise((resolve) => server.close(resolve));
    this.#port = null;
  }
  url() {
    return this.#port ? `http://127.0.0.1:${this.#port}/#key=${this.#accessKey}` : null;
  }
  connectionInfo() {
    return this.#port ? { port: this.#port, accessKey: this.#accessKey, url: this.url() } : null;
  }
  status() {
    return { state: this.#server ? "running" : "stopped" };
  }
  async #handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    this.#securityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      const auth = this.#authorized(request);
      if (!auth.ok) return this.#json(response, 401, { error: { code: "UNAUTHORIZED", message: "\u63A7\u5236\u53F0\u8BBF\u95EE\u5BC6\u94A5\u65E0\u6548" } });
      if (auth.viaBootstrap) this.#setSessionCookie(response);
      return this.#api(request, response, url);
    }
    if (!["GET", "HEAD"].includes(request.method)) return this.#json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "\u65B9\u6CD5\u4E0D\u5141\u8BB8" } });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path14.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path14.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
    try {
      const body = await fs13.readFile(file);
      if (!this.#authorized(request).ok) this.#setSessionCookie(response);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path14.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      if (request.method === "HEAD") return response.end();
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
      throw error;
    }
  }
  async #api(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/environment") {
      return this.#json(response, 200, await this.environment.inspect());
    }
    if (request.method === "GET" && url.pathname === "/api/remote-control") {
      return this.#json(response, 200, await this.service.remoteControlStatus());
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/install") {
      try {
        return this.#json(response, 200, await this.service.remoteControlInstall());
      } catch (error) {
        const known = ["REMOTE_CONTROL_INSTALL_BUSY", "REMOTE_CONTROL_INSTALL_URL_INVALID", "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED", "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID", "REMOTE_CONTROL_INSTALL_FAILED", "REMOTE_CONTROL_INSTALL_TIMEOUT", "REMOTE_CONTROL_INSTALL_INCOMPLETE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "REMOTE_CONTROL_INSTALL_FAILED", message: known ? error.message : "\u5B98\u65B9 standalone \u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/start") {
      try {
        return this.#json(response, 200, await this.service.remoteControlStart());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/stop") {
      try {
        return this.#json(response, 200, await this.service.remoteControlStop());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/pair") {
      try {
        return this.#json(response, 200, await this.service.remoteControlPair());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/environment/check") {
      return this.#json(response, 200, await this.environment.inspect(true));
    }
    if (request.method === "POST" && url.pathname === "/api/environment/repair-executable") {
      try {
        const body = await this.#body(request);
        const result = await this.environment.repairExecutable({ configured: body.configured, candidate: body.candidate });
        return this.#json(response, 200, result);
      } catch (error) {
        const known = ["ENVIRONMENT_BUSY", "ENVIRONMENT_CHANGED", "REPAIR_NOT_AVAILABLE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "ENVIRONMENT_REPAIR_FAILED", message: known ? error.message : "\u6267\u884C\u8DEF\u5F84\u4FEE\u590D\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u73AF\u5883" } });
      }
    }
    if (request.method === "GET" && url.pathname === "/api/config") {
      return this.#json(response, 200, await this.service.configStore.publicConfig({ includeToken: true }));
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return this.#json(response, 200, await this.service.status());
    }
    if (request.method === "GET" && url.pathname === "/api/logs") {
      return this.#json(response, 200, { logs: this.service.logger.list(Number(url.searchParams.get("limit") || 100)) });
    }
    if (request.method === "GET" && url.pathname === "/api/diagnostics") {
      return this.#json(response, 200, await this.service.diagnostics());
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await this.#body(request);
      const credential = body.credential || (body.token !== void 0 || body.endpointGrant !== void 0 || body.grantExpiresAt !== void 0 || body.tokenEndpoint !== void 0 ? {
        ...body.token !== void 0 ? { connectToken: body.token } : {},
        ...body.endpointGrant !== void 0 ? { endpointGrant: body.endpointGrant } : {},
        ...body.grantExpiresAt !== void 0 ? { grantExpiresAt: body.grantExpiresAt } : {},
        ...body.tokenEndpoint !== void 0 ? { tokenEndpoint: body.tokenEndpoint } : {}
      } : void 0);
      await this.service.updateConfig(body.config || {}, credential);
      const config = await this.service.configStore.publicConfig({ includeToken: true });
      return this.#json(response, 200, config);
    }
    if (request.method === "POST" && url.pathname === "/api/connection/test") {
      return this.#json(response, 200, await this.service.testConnection());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/connect") {
      return this.#json(response, 200, await this.service.connect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/disconnect") {
      return this.#json(response, 200, await this.service.disconnect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/reconnect") {
      try {
        return this.#json(response, 200, await this.service.reconnectRelay());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "RELAY_RECONNECT_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/start") {
      return this.#json(response, 200, await this.service.appServer.start());
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/restart") {
      try {
        return this.#json(response, 200, await this.service.restartAppServerConnection());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "APP_SERVER_RESTART_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/stop") {
      await this.service.appServer.stop();
      return this.#json(response, 200, this.service.appServer.status());
    }
    if (request.method === "DELETE" && url.pathname === "/api/logs") {
      this.service.logger.clear();
      return this.#json(response, 200, { ok: true });
    }
    return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "API \u4E0D\u5B58\u5728" } });
  }
  #authorized(request) {
    const authorization = request.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = Buffer.from(this.#accessKey);
    const actual = Buffer.from(supplied);
    const viaBootstrap = expected.length === actual.length && crypto6.timingSafeEqual(expected, actual);
    if (viaBootstrap) return { ok: true, viaBootstrap };
    const cookies = request.headers.cookie || "";
    const session = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DASHBOARD_COOKIE}=`));
    const cookieValue = session ? decodeURIComponent(session.slice(DASHBOARD_COOKIE.length + 1)) : "";
    const suppliedHash = crypto6.createHash("sha256").update(cookieValue).digest("hex");
    const actualHash = Buffer.from(suppliedHash, "hex");
    const viaCookie = this.#sessionTokenHashes.some((expected2) => {
      const expectedHash = Buffer.from(expected2, "hex");
      return expectedHash.length === actualHash.length && crypto6.timingSafeEqual(expectedHash, actualHash);
    });
    return { ok: viaCookie, viaBootstrap: false };
  }
  #setSessionCookie(response) {
    response.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=${this.#sessionToken}; Max-Age=${DASHBOARD_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict`);
  }
  #sessionToken;
  async #loadOrCreateSession() {
    let hashes = [];
    try {
      const saved = JSON.parse(await fs13.readFile(this.#sessionFile, "utf8"));
      hashes = Array.isArray(saved?.tokenHashes) ? saved.tokenHashes : [];
      if (typeof saved?.token === "string" && saved.token.length >= 32) hashes.push(crypto6.createHash("sha256").update(saved.token).digest("hex"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.#sessionToken = crypto6.randomBytes(32).toString("base64url");
    this.#sessionTokenHashes = [.../* @__PURE__ */ new Set([...hashes.filter((value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)), crypto6.createHash("sha256").update(this.#sessionToken).digest("hex")])].slice(-8);
    await fs13.mkdir(path14.dirname(this.#sessionFile), { recursive: true, mode: 448 });
    await fs13.writeFile(this.#sessionFile, `${JSON.stringify({ version: 1, tokenHashes: this.#sessionTokenHashes })}
`, { mode: 384 });
  }
  async #body(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 256 * 1024) throw new Error("\u8BF7\u6C42\u5185\u5BB9\u8D85\u8FC7 256 KiB \u9650\u5236");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  #json(response, status, payload) {
    if (response.headersSent) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(payload));
  }
  #securityHeaders(response) {
    response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
};

// server/runtime.js
var runtime;
async function getRuntime() {
  if (runtime) return runtime;
  const configStore = new ConfigStore();
  const lock = new InstanceLock(configStore.configDir, "runtime.lock");
  try {
    await lock.acquire();
  } catch (error) {
    if (error.code !== "RELAY_INSTANCE_ALREADY_RUNNING") throw error;
    let info = await readRuntimeInfo(configStore.configDir);
    for (let attempt = 0; !info && attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      info = await readRuntimeInfo(configStore.configDir);
    }
    if (!info) throw error;
    const service2 = new RuntimeProxy(info);
    runtime = {
      service: service2,
      dashboard: { url: () => info.url, status: () => ({ state: "running", ownerPid: info.pid }) },
      remote: true
    };
    return runtime;
  }
  await retireLegacyConnector(configStore.configDir, lock);
  const service = new ConnectorService({ configDir: configStore.configDir });
  try {
    await service.start();
    const dashboard = new DashboardServer(service, service.logger);
    service.attachDashboard(dashboard);
    await dashboard.start();
    const info = {
      pid: process.pid,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      generation: crypto7.randomUUID(),
      version: "1.0.0+codex.20260912223014",
      buildId: "1.0.0+codex.20260912223014:1789252227083",
      ...dashboard.connectionInfo()
    };
    await writeRuntimeInfo(configStore.configDir, info);
    runtime = { service, dashboard, remote: false, configDir: configStore.configDir, runtimeInfo: info, runtimeLock: lock };
    return runtime;
  } catch (error) {
    await lock.release().catch(() => {
    });
    throw error;
  }
}
async function stopRuntime() {
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  if (current.remote) return;
  try {
    await current.service.stop();
  } finally {
    if (current.runtimeLock) await current.runtimeLock.release().catch(() => {
    });
    if (current.configDir) await removeRuntimeInfo(current.configDir, current.runtimeInfo?.pid);
  }
}
async function readRuntimeInfo(configDir) {
  try {
    const info = JSON.parse(await fs14.readFile(path15.join(configDir, "runtime.json"), "utf8"));
    if (!Number.isInteger(info?.port) || info.port <= 0 || typeof info.accessKey !== "string" || !info.url) return null;
    try {
      process.kill(Number(info.pid), 0);
    } catch {
      return null;
    }
    return info;
  } catch {
    return null;
  }
}
async function writeRuntimeInfo(configDir, info) {
  await fs14.mkdir(configDir, { recursive: true, mode: 448 });
  const file = path15.join(configDir, "runtime.json");
  const temporary = `${file}.${process.pid}.tmp`;
  await fs14.writeFile(temporary, `${JSON.stringify(info)}
`, { mode: 384 });
  await fs14.rename(temporary, file);
}
async function removeRuntimeInfo(configDir, pid) {
  const file = path15.join(configDir, "runtime.json");
  try {
    const current = JSON.parse(await fs14.readFile(file, "utf8"));
    if (pid && Number(current.pid) !== Number(pid)) return;
  } catch {
  }
  await fs14.unlink(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
async function retireLegacyConnector(configDir, runtimeLock) {
  const file = path15.join(configDir, "connector.lock");
  try {
    const record = JSON.parse(await fs14.readFile(file, "utf8"));
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch (error2) {
      if (error2.code !== "ESRCH") throw error2;
      return;
    }
    const deadline = Date.now() + 3e3;
    while (Date.now() < deadline) {
      try {
        await fs14.access(file);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error2) {
        if (error2.code === "ENOENT") return;
        throw error2;
      }
    }
    const error = new Error("\u65E7\u7248 Codex Relay \u8FDB\u7A0B\u672A\u80FD\u5728 3 \u79D2\u5185\u9000\u51FA");
    error.code = "LEGACY_RUNTIME_STILL_RUNNING";
    throw error;
  } catch (error) {
    if (error.code === "ENOENT") return;
    await runtimeLock.release().catch(() => {
    });
    throw error;
  }
}
var RuntimeProxy = class {
  constructor(info) {
    this.info = info;
  }
  async status() {
    return this.#request("/api/status");
  }
  async diagnostics() {
    return this.#request("/api/diagnostics");
  }
  async connect() {
    return this.#request("/api/connection/connect", "POST");
  }
  async disconnect() {
    return this.#request("/api/connection/disconnect", "POST");
  }
  async testConnection() {
    return this.#request("/api/connection/test", "POST");
  }
  async remoteControlStatus() {
    return this.#request("/api/remote-control");
  }
  async remoteControlInstall() {
    return this.#request("/api/remote-control/install", "POST");
  }
  async remoteControlStart() {
    return this.#request("/api/remote-control/start", "POST");
  }
  async remoteControlStop() {
    return this.#request("/api/remote-control/stop", "POST");
  }
  async remoteControlPair() {
    return this.#request("/api/remote-control/pair", "POST");
  }
  async updateConfig(patch, credential) {
    return this.#request("/api/config", "PUT", { config: patch, credential });
  }
  async #request(endpoint, method = "GET", body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15e3);
    try {
      const response = await fetch(`http://127.0.0.1:${this.info.port}${endpoint}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.info.accessKey}`,
          ...body ? { "Content-Type": "application/json" } : {}
        },
        ...body ? { body: JSON.stringify(body) } : {}
      });
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(value?.error?.message || `\u672C\u5730 Relay Agent \u8BF7\u6C42\u5931\u8D25 (${response.status})`);
        error.code = value?.error?.code || "RUNTIME_PROXY_FAILED";
        throw error;
      }
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
};

// server/agent-cli.js
try {
  const runtime2 = await getRuntime();
  if (runtime2.remote) {
    process.exit(0);
  }
} catch (error) {
  console.error(`[codex-relay-agent] ${error.message}`);
  process.exit(1);
}
var shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopRuntime().catch((error) => console.error(`[codex-relay-agent] shutdown: ${error.message}`));
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => shutdown(0));
}
