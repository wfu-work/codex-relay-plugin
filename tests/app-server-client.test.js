import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AppServerClient } from "../server/app-server-client.js";
import { Logger } from "../server/logger.js";

test("App Server client initializes and uses expectedTurnId for steering", async (t) => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex.js");
  await fs.chmod(executable, 0o755);
  const configStore = {
    get: () => ({ codex: { executable, defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  t.after(() => client.stop());

  const status = await client.start();
  assert.equal(status.state, "ready");
  assert.equal(status.version, "codex-cli 0.test");
  const threads = await client.listThreads({ limit: 100 });
  assert.deepEqual(threads.data.map((thread) => thread.id), ["thread-1", "thread-2"]);
  assert.equal(threads.nextCursor, null);
  const models = await client.listModels({ includeHidden: false, limit: 100 });
  assert.equal(models.data[0].model, "remote-model");
  const threadStatus = await client.readThreadStatus("thread-1");
  assert.equal(threadStatus.thread.status.type, "active");
  assert.equal(threadStatus.thread.statusProbe, true);
  assert.equal(threadStatus.thread.resumed, false);
  const hydrated = await client.readThread("thread-1");
  assert.equal(hydrated.thread.resumed, false);
  assert.equal(hydrated.thread.resumeCount, 0);
  const started = await client.startTurn({
    threadId: "thread-1",
    text: "hello",
    model: "remote-model",
    effort: "high",
  });
  assert.equal(started.received.model, "remote-model");
  assert.equal(started.received.effort, "high");
  const result = await client.steerTurn({ threadId: "thread-1", turnId: "turn-1", text: "more" });
  assert.equal(result.received.expectedTurnId, "turn-1");
  assert.equal(Object.hasOwn(result.received, "turnId"), false);
});

test("thread catalog defaults to the official recency ordering", async () => {
  const configStore = {
    get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  const calls = [];
  client.request = async (method, params) => {
    calls.push([method, params]);
    return {
      data: [
        { id: "thread-older", recencyAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
        { id: "thread-newer", recencyAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" },
      ],
      nextCursor: null,
    };
  };

  const result = await client.listThreads({ limit: 100 });

  assert.equal(calls[0][0], "thread/list");
  assert.equal(calls[0][1].sortKey, "recency_at");
  assert.equal(calls[0][1].sortDirection, "desc");
  assert.deepEqual(result.data.map((thread) => thread.id), ["thread-newer", "thread-older"]);
});

test("thread catalog falls back when an older App Server rejects recency sorting", async () => {
  const configStore = {
    get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  const calls = [];
  client.request = async (method, params) => {
    calls.push([method, params]);
    if (params.sortKey === "recency_at") {
      const error = new Error("unknown sort key recency_at");
      error.code = "APP_SERVER_ERROR";
      throw error;
    }
    return { data: [{ id: "thread-1", updatedAt: "2026-09-01T00:00:00Z" }], nextCursor: null };
  };

  const result = await client.listThreads({ limit: 100 });

  assert.equal(result.data[0].id, "thread-1");
  assert.deepEqual(calls.map(([, params]) => [params.sortKey, params.sortDirection]), [
    ["recency_at", "desc"],
    ["recency_at", undefined],
    ["updated_at", "desc"],
  ]);
});

test("project catalog is returned in official position order", async () => {
  const configStore = {
    get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  client.request = async (_method, params) => params.cursor == null
    ? {
        data: [
          { id: "project-b", name: "B", position: 2, roots: [{ path: "/b" }] },
          { id: "project-a", name: "A", position: 1, roots: [{ path: "/a" }] },
        ],
        nextCursor: null,
      }
    : { data: [], nextCursor: null };

  const result = await client.listProjects();

  assert.deepEqual(result.data.map((project) => project.id), ["project-a", "project-b"]);
});

test("App Server client hydrates paginated thread history", async (t) => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex-paginated.js");
  await fs.chmod(executable, 0o755);
  const configStore = {
    get: () => ({ codex: { executable, defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  t.after(() => client.stop());

  await client.start();
  const result = await client.readThread("thread-1");
  assert.equal(result.thread.id, "thread-1");
  assert.equal(result.thread.turns[0].items[0].text, "分页历史加载成功");
});

test("App Server client resumes a historical thread before retrying its first turn", async (t) => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex-resume.js");
  await fs.chmod(executable, 0o755);
  const configStore = {
    get: () => ({ codex: { executable, defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  t.after(() => client.stop());

  await client.start();
  const started = await client.startTurn({
    threadId: "thread-historical",
    text: "continue",
  });

  assert.equal(started.received.threadId, "thread-historical");
  assert.equal(started.received.input[0].text, "continue");
});

test("App Server client keeps reading when another client owns the thread writer", async (t) => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex.js");
  await fs.chmod(executable, 0o755);
  const configStore = {
    get: () => ({ codex: { executable, defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  t.after(() => client.stop());

  await client.start();
  const status = await client.readThreadStatus("thread-active-writer");
  assert.equal(status.thread.id, "thread-active-writer");
  assert.equal(status.thread.resumed, false);
});

test("App Server snapshot reads do not contend for another client's writer", async (t) => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex.js");
  await fs.chmod(executable, 0o755);
  const configStore = {
    get: () => ({ codex: { executable, defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  t.after(() => client.stop());

  await client.start();
  const status = await client.readThreadStatusSnapshot("thread-active-writer");
  assert.equal(status.thread.id, "thread-active-writer");
  assert.equal(status.thread.resumed, false);
  const snapshot = await client.readThreadSnapshot("thread-active-writer");
  assert.equal(snapshot.thread.id, "thread-active-writer");
  assert.equal(snapshot.thread.resumed, false);
  assert.equal(snapshot.thread.resumeCount, 0);
});

test("snapshot reads project the live Desktop rollout over a stale interrupted turn", async (t) => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-live-rollout-"));
  const cwd = path.join(codexHome, "project");
  const sessions = path.join(codexHome, "sessions");
  const threadId = "11111111-1111-4111-8111-111111111111";
  const turnId = "22222222-2222-4222-8222-222222222222";
  const file = path.join(sessions, `rollout-2026-09-13T12-00-00-${threadId}.jsonl`);
  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(sessions, { recursive: true });
  const event = (payload, timestamp) => JSON.stringify({ type: "event_msg", timestamp, payload });
  await fs.writeFile(file, [
    JSON.stringify({ type: "session_meta", timestamp: "2026-09-13T12:00:00.000Z", payload: { id: threadId, cwd } }),
    event({ type: "task_started", thread_id: threadId, turn_id: turnId, started_at: 1 }, "2026-09-13T12:00:01.000Z"),
  ].join("\n") + "\n");
  const configStore = {
    get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger(), { codexHome });
  client.request = async () => ({
    thread: {
      id: threadId,
      path: file,
      cwd,
      status: { type: "idle" },
      currentTurn: { id: "old-turn", status: "interrupted", items: [] },
      turns: [{ id: "old-turn", status: "interrupted", items: [] }],
    },
  });
  t.after(() => fs.rm(codexHome, { recursive: true, force: true }));

  const result = await client.readThreadSnapshot(threadId);
  assert.equal(result.thread.status.type, "active");
  assert.equal(result.thread.currentTurn.id, turnId);
  assert.equal(result.thread.currentTurn.status, "inProgress");
  assert.equal(result.thread.turns.at(-1).id, turnId);
});

test("status reads recover a desktop-owned active turn when the Relay index misses the thread", async (t) => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-live-status-fallback-"));
  const cwd = path.join(codexHome, "project");
  const sessions = path.join(codexHome, "sessions");
  const threadId = "33333333-3333-4333-8333-333333333333";
  const turnId = "44444444-4444-4444-8444-444444444444";
  const file = path.join(sessions, `rollout-2026-09-13T12-00-00-${threadId}.jsonl`);
  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(sessions, { recursive: true });
  await fs.writeFile(file, [
    JSON.stringify({ type: "session_meta", timestamp: "2026-09-13T12:00:00.000Z", payload: { id: threadId, cwd } }),
    JSON.stringify({ type: "event_msg", timestamp: "2026-09-13T12:00:01.000Z", payload: { type: "task_started", thread_id: threadId, turn_id: turnId, started_at: 1 } }),
  ].join("\n") + "\n");
  const configStore = { get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }) };
  const client = new AppServerClient(configStore, new Logger(), { codexHome });
  client.request = async () => { throw new Error("thread not found"); };
  t.after(() => fs.rm(codexHome, { recursive: true, force: true }));

  const result = await client.readThreadStatus(threadId);
  assert.equal(result.thread.id, threadId);
  assert.equal(result.thread.status.type, "active");
  assert.equal(result.thread.currentTurn.id, turnId);
  assert.equal(result.thread.currentTurn.status, "inProgress");
});

test("thread catalog collapses duplicate ids across persisted pages", async () => {
  const configStore = {
    get: () => ({ codex: { executable: "codex", defaultWorkingDirectory: "" } }),
  };
  const client = new AppServerClient(configStore, new Logger());
  const pages = [
    {
      data: [
        { id: "thread-newest", cwd: "/workspace/demo" },
        { id: "thread-older", cwd: "/workspace/demo", updated_at: "2026-09-03T00:00:00Z" },
      ],
      nextCursor: "page-2",
    },
    {
      data: [
        // The same id can appear at an index page boundary while the desktop
        // App Server is persisting a new turn.
        { id: "thread-older", cwd: "/workspace/demo", updated_at: "2026-09-02T00:00:00Z" },
        { id: "thread-another", cwd: "/workspace/demo" },
      ],
      nextCursor: null,
    },
  ];
  client.request = async (_method, params) =>
    params.cursor == null ? pages[0] : pages[1];

  const result = await client.listThreads({ limit: 100 });
  assert.deepEqual(result.data.map((thread) => thread.id), [
    "thread-newest",
    "thread-older",
    "thread-another",
  ]);
});
