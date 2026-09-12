import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RolloutSnapshots } from "../server/rollout-snapshot.js";

const threadId = "11111111-1111-4111-8111-111111111111";
const turnOne = "22222222-2222-4222-8222-222222222222";
const turnTwo = "33333333-3333-4333-8333-333333333333";

test("does not apply an unscoped abort to an overlapping newer turn", async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-rollout-"));
  const cwd = path.join(codexHome, "project");
  const sessions = path.join(codexHome, "sessions");
  const file = path.join(sessions, "rollout-2026-09-13T12-00-00-11111111-1111-4111-8111-111111111111.jsonl");
  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(sessions, { recursive: true });
  const row = (payload, timestamp) => JSON.stringify({ type: "event_msg", timestamp, payload });
  await fs.writeFile(file, [
    JSON.stringify({ type: "session_meta", timestamp: "2026-09-13T12:00:00.000Z", payload: { id: threadId, cwd } }),
    row({ type: "task_started", thread_id: threadId, turn_id: turnOne, started_at: 1 }, "2026-09-13T12:00:01.000Z"),
    row({ type: "task_started", thread_id: threadId, turn_id: turnTwo, started_at: 2 }, "2026-09-13T12:00:02.000Z"),
    row({ type: "turn_aborted", thread_id: threadId }, "2026-09-13T12:00:03.000Z"),
  ].join("\n") + "\n");
  try {
    const snapshots = new RolloutSnapshots({ codexHome, indexIntervalMs: 0 });
    const snapshot = await snapshots.read({ id: threadId, path: file, cwd });
    assert.ok(snapshot);
    assert.equal(snapshot.currentTurn.id, turnTwo);
    assert.equal(snapshot.currentTurn.status, "inProgress");
    assert.equal(snapshot.turns.find((turn) => turn.id === turnOne).status, "inProgress");
  } finally {
    await fs.rm(codexHome, { recursive: true, force: true });
  }
});
