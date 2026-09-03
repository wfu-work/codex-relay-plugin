import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
  assert.equal(threadStatus.thread.resumed, true);
  const hydrated = await client.readThread("thread-1");
  assert.equal(hydrated.thread.resumed, true);
  assert.equal(hydrated.thread.resumeCount, 1);
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
