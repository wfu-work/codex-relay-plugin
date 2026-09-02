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
