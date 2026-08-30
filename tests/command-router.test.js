import assert from "node:assert/strict";
import test from "node:test";
import { CommandRouter } from "../server/command-router.js";
import { defaultConfig } from "../server/config-store.js";

function setup({ readOnly = false, threadCwd = "/workspace/allowed/demo", delayTurn = false } = {}) {
  const config = defaultConfig();
  config.relay.spaceId = "space-1";
  config.relay.deviceId = "host-1";
  config.readOnly = readOnly;
  config.allowedProjects = ["/workspace/allowed"];
  const calls = [];
  const appServer = {
    start: async () => calls.push(["start"]),
    listThreads: async (params) => (calls.push(["listThreads", params]), {
      data: [
        { id: "thread-allowed", cwd: "/workspace/allowed/nested" },
        { id: "thread-private", cwd: "/workspace/private" },
      ],
      nextCursor: null,
    }),
    readThread: async (threadId) => (calls.push(["readThread", threadId]), { thread: { id: threadId, cwd: threadCwd } }),
    startTurn: async (params) => {
      calls.push(["startTurn", params]);
      if (delayTurn) await new Promise((resolve) => setImmediate(resolve));
      return { turn: { id: "turn-1" } };
    },
    createThread: async (params) => (calls.push(["createThread", params]), { thread: { id: "thread-new", cwd: params.cwd } }),
  };
  const router = new CommandRouter({
    configStore: { get: () => structuredClone(config) },
    appServer,
    service: { status: async () => ({ ok: true }), syncAfter: async () => ({ mode: "snapshot" }) },
    logger: { warn() {} },
  });
  return { config, calls, router };
}

function envelope(command, requestId = "req-1") {
  return {
    version: 1,
    type: "codex.command",
    requestId,
    spaceId: "space-1",
    deviceId: "phone-1",
    targetDeviceId: "host-1",
    timestamp: new Date().toISOString(),
    command,
  };
}

test("thread listing is constrained by the project whitelist", async () => {
  const { calls, router } = setup();
  const response = await router.handle(envelope({ type: "thread.list" }));
  assert.equal(response.success, true);
  assert.equal(calls.find(([name]) => name === "listThreads")[1].cwd, undefined);
  assert.deepEqual(response.result.data.map((thread) => thread.id), ["thread-allowed"]);
});

test("turn start verifies thread cwd and is idempotent by request id", async () => {
  const { calls, router } = setup();
  const message = envelope({ type: "turn.start", threadId: "thread-1", text: "continue" });
  const first = await router.handle(message);
  const second = await router.handle(message);
  assert.equal(first.success, true);
  assert.deepEqual(second, first);
  assert.equal(calls.filter(([name]) => name === "startTurn").length, 1);
});

test("concurrent duplicate deliveries share one in-flight execution", async () => {
  const { calls, router } = setup({ delayTurn: true });
  const message = envelope({ type: "turn.start", threadId: "thread-1", text: "continue" });
  const [first, second] = await Promise.all([router.handle(message), router.handle(message)]);
  assert.equal(first.success, true);
  assert.deepEqual(second, first);
  assert.equal(calls.filter(([name]) => name === "startTurn").length, 1);
});

test("reusing a request id for a different command is rejected", async () => {
  const { router } = setup();
  const first = await router.handle(envelope({ type: "thread.list" }, "duplicate-id"));
  const second = await router.handle(envelope({ type: "thread.read", threadId: "thread-1" }, "duplicate-id"));
  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.error.code, "REQUEST_ID_REUSED");
});

test("threads outside the whitelist are denied", async () => {
  const { calls, router } = setup({ threadCwd: "/workspace/private" });
  const response = await router.handle(envelope({ type: "turn.start", threadId: "thread-1", text: "continue" }));
  assert.equal(response.success, false);
  assert.equal(response.error.code, "PROJECT_NOT_ALLOWED");
  assert.equal(calls.some(([name]) => name === "startTurn"), false);
});

test("read-only policy blocks writes before starting App Server", async () => {
  const { calls, router } = setup({ readOnly: true });
  const response = await router.handle(envelope({ type: "turn.start", threadId: "thread-1", text: "continue" }));
  assert.equal(response.success, false);
  assert.equal(response.error.code, "COMMAND_NOT_ALLOWED");
  assert.deepEqual(calls, []);
});

test("whitelisted mode requires a cwd when creating a thread", async () => {
  const { calls, router } = setup();
  const response = await router.handle(envelope({ type: "thread.create" }));
  assert.equal(response.success, false);
  assert.equal(response.error.code, "PROJECT_REQUIRED");
  assert.equal(calls.some(([name]) => name === "createThread"), false);
});
