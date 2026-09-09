import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RolloutSnapshots, applyRolloutSnapshot } from "../server/rollout-snapshot.js";
import { AppServerClient } from "../server/app-server-client.js";

const id = "01a0861e-3e5e-7041-9e27-0eb5308a2b9c";
const retry = "01a08623-4e83-7811-83b9-2d772ed3f2f4";
const row = (type, payload) => JSON.stringify({ timestamp: "2026-09-09T12:40:00Z", type, payload }) + "\n";
const event = (payload) => row("event_msg", payload);
const start = (turnId) => event({ type: "task_started", turn_id: turnId, started_at: 100 });
const item = (text, turnId = "current", itemId = "answer") => event({ type: "item_completed", thread_id: id,
  turn_id: turnId, item: { type: "AgentMessage", id: itemId, content: [{ type: "Text", text }], phase: "commentary" } });

async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "recodex-rollout-")));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const dir = path.join(home, "sessions", "2026", "09", "09");
  await fs.mkdir(dir, { recursive: true });
  const oldFile = path.join(dir, `rollout-2026-09-09T20-22-04-${id}.jsonl`);
  const newFile = path.join(dir, `rollout-2026-09-09T20-27-35-${id}_${retry}.jsonl`);
  const header = row("session_meta", { id, cwd: "/work/project", base_instructions: "must never appear" });
  await fs.writeFile(oldFile, header + start("old") + event({ type: "task_complete", turn_id: "old", error: { message: "old failure" } }));
  const thread = { id, cwd: "/work/project", path: oldFile, status: { type: "notLoaded" }, turns: [{ id: "old", status: "failed" }] };
  const reader = new RolloutSnapshots({ codexHome: home, indexIntervalMs: 0 });
  return { home, dir, oldFile, newFile, header, thread, reader };
}

test("a retried Desktop task reads its new journal and current active turn", async (t) => {
  const { reader, thread, newFile, header } = await fixture(t);
  await fs.writeFile(newFile, header + start("current") + item("new output"));
  const snapshot = await reader.read(thread);
  const result = applyRolloutSnapshot(thread, snapshot, { includeTurns: true });
  assert.equal(result.path, newFile);
  assert.equal(result.status.type, "active");
  assert.equal(result.currentTurn.id, "current");
  assert.equal(result.turns[0].items[0].text, "new output");
  assert.equal(JSON.stringify(result).includes("must never appear"), false);
  assert.deepEqual(snapshot.notifications, []);
});

test("incremental reads wait for whole UTF-8 JSON lines and deliver each item once", async (t) => {
  const { reader, thread, oldFile, header } = await fixture(t);
  await fs.writeFile(oldFile, header + start("current"));
  await reader.read(thread);
  const bytes = Buffer.from(item("正在同步数据"));
  const split = bytes.indexOf(Buffer.from("在")) + 1;
  await fs.appendFile(oldFile, bytes.subarray(0, split));
  assert.equal((await reader.read(thread)).notifications.length, 0);
  await fs.appendFile(oldFile, bytes.subarray(split));
  const snapshot = await reader.read(thread);
  assert.equal(snapshot.notifications.length, 1);
  assert.equal(snapshot.notifications[0][1].item.text, "正在同步数据");
  assert.equal((await reader.read(thread)).notifications.length, 0);
});

test("completion is correlated to its own turn and command failure is not task failure", async (t) => {
  const { reader, thread, oldFile, header } = await fixture(t);
  await fs.writeFile(oldFile, header + start("old") + start("current") + event({ type: "task_complete", turn_id: "old" })
    + event({ type: "item_completed", turn_id: "current", item: { type: "CommandExecution", id: "exec", status: "failed", exit_code: 1 } }));
  assert.equal((await reader.read(thread)).currentTurn.status, "inProgress");
  await fs.appendFile(oldFile, event({ type: "task_complete", turn_id: "current", completed_at: 150 }));
  const snapshot = await reader.read(thread);
  assert.equal(snapshot.currentTurn.status, "completed");
  assert.equal(snapshot.currentTurn.durationMs, 50000);
  assert.equal(snapshot.notifications[0][0], "turn/completed");
});

test("rejects a different task, workspace, or symlink outside the history root", async (t) => {
  const { reader, thread, oldFile, newFile, header, home } = await fixture(t);
  await fs.writeFile(newFile, row("session_meta", { id, cwd: "/private" }) + start("wrong"));
  assert.equal((await reader.read(thread)).file, oldFile);
  await fs.writeFile(newFile, row("session_meta", { id: retry, cwd: thread.cwd }) + start("wrong"));
  assert.equal((await reader.read(thread)).file, oldFile);
  const outside = path.join(home, "untrusted.jsonl");
  await fs.writeFile(outside, header + start("wrong"));
  await fs.unlink(newFile);
  await fs.symlink(outside, newFile);
  assert.equal((await reader.read(thread)).file, oldFile);
  assert.equal(await reader.read({ ...thread, path: outside }), null);
});

test("file truncation and rollover replace the previous projection", async (t) => {
  const { reader, thread, oldFile, newFile, header } = await fixture(t);
  await reader.read(thread);
  await fs.writeFile(oldFile, header + start("current"));
  assert.equal((await reader.read(thread)).currentTurn.id, "current");
  await fs.writeFile(newFile, header + start("retry"));
  assert.equal((await reader.read(thread)).currentTurn.id, "retry");
});

test("status and full reads use the same current turn without resuming a writer", async (t) => {
  const { home, thread, newFile, header } = await fixture(t);
  await fs.writeFile(newFile, header + start("current") + item("live"));
  const previousHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  const client = new AppServerClient({ get: () => ({ codex: {} }) }, { info() {}, warn() {}, error() {} });
  if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome;
  t.after(() => client.stop());
  client.request = async (method) => { assert.equal(method, "thread/read"); return { thread }; };
  const status = await client.readThreadStatusSnapshot(id);
  const read = await client.readThreadSnapshot(id);
  assert.equal(status.thread.currentTurn.id, "current");
  assert.equal(status.thread.status.type, "active");
  assert.equal(read.thread.turns[0].items[0].text, "live");
  const nextItem = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("journal event was not forwarded")), 3000);
    client.on("notification", (method, params) => {
      if (method !== "item/completed") return;
      clearTimeout(timer);
      resolve(params);
    });
  });
  await fs.appendFile(newFile, item("incremental", "current", "next"));
  assert.equal((await nextItem).item.text, "incremental");
});
