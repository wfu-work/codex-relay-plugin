import assert from "node:assert/strict";
import test from "node:test";
import { CommandRouter } from "../server/command-router.js";
import { defaultConfig } from "../server/config-store.js";

function setup({ readOnly = false, threadCwd = "/workspace/allowed/demo", threadTurns = [], delayTurn = false, delayList = false } = {}) {
  const config = defaultConfig();
  config.relay.spaceId = "space-1";
  config.relay.endpointId = "endpoint-1";
  config.relay.deviceId = "host-1";
  config.readOnly = readOnly;
  config.allowedProjects = ["/workspace/allowed"];
  const calls = [];
  const appServer = {
    start: async () => calls.push(["start"]),
    listModels: async (params) => (calls.push(["listModels", params]), {
      data: [
        { model: "remote-model", displayName: "Remote Model", isDefault: true },
      ],
      nextCursor: null,
    }),
    listThreads: async (params) => {
      calls.push(["listThreads", params]);
      if (delayList) await new Promise((resolve) => setImmediate(resolve));
      return {
        data: [
          { id: "thread-allowed", cwd: "/workspace/allowed/nested" },
          { id: "thread-private", cwd: "/workspace/private" },
        ],
        nextCursor: null,
      };
    },
    listProjects: async (params) => {
      calls.push(["listProjects", params]);
      return {
        data: [
          { id: "project-allowed", roots: [{ path: "/workspace/allowed/demo" }] },
          { id: "project-private", roots: [{ path: "/workspace/private" }] },
        ],
        nextCursor: null,
      };
    },
    readThread: async (threadId) => (calls.push(["readThread", threadId]), { thread: { id: threadId, cwd: threadCwd, turns: threadTurns } }),
    readThreadStatus: async (threadId) => (calls.push(["readThreadStatus", threadId]), {
      thread: { id: threadId, cwd: threadCwd, status: { type: "active", activeFlags: [] } },
    }),
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
  return { config, calls, router, appServer };
}

function envelope(command, requestId = "req-1") {
  return {
    version: 1,
    type: "codex.command",
    requestId,
    spaceId: "space-1",
    deviceId: "phone-1",
    targetDeviceId: "endpoint-1",
    timestamp: new Date().toISOString(),
    command,
  };
}

test("legacy resume polling never acquires the desktop writer and enforces access", async () => {
  const { router, appServer, calls, config } = setup({ readOnly: true });
  appServer.resumeThread = async () => { throw new Error("must not acquire a writer"); };
  for (let i = 0; i < 20; i++) {
    const response = await router.handle(envelope({ type: "thread.resume", threadId: "thread-active" }, `resume-${i}`));
    assert.equal(response.success, true);
    assert.equal(response.result.syncMode, "snapshot");
    assert.equal(response.result.thread.id, "thread-active");
  }
  assert.equal(calls.filter(([name]) => name === "readThread").length, 0);
  config.allowedProjects = ["/private"];
  const denied = await router.handle(envelope({ type: "thread.resume", threadId: "thread-active" }, "denied"));
  assert.equal(denied.error.code, "PROJECT_NOT_ALLOWED");
});

test("shared reads subscribe only after project authorization, including unchanged snapshots", async () => {
  const { router, appServer, config } = setup({ readOnly: true });
  const subscriptions = [];
  appServer.isShared = () => true;
  appServer.subscribeThread = async id => subscriptions.push(id);
  for (const [i, type] of ["thread.read", "thread.status", "thread.resume", "thread.select"].entries()) {
    const response = await router.handle(envelope({ type, threadId: "thread-1" }, `shared-${i}`));
    assert.equal(response.success, true);
    if (type === "thread.resume") assert.equal(response.result.syncMode, "live");
  }
  assert.equal(subscriptions.length, 4);
  config.allowedProjects = ["/private"];
  for (const [i, type] of ["thread.read", "thread.status", "thread.resume", "thread.select"].entries()) {
    const response = await router.handle(envelope({ type, threadId: "thread-1" }, `denied-shared-${i}`));
    assert.equal(response.error.code, "PROJECT_NOT_ALLOWED");
  }
  assert.equal(subscriptions.length, 4);
});

test("first shared status read returns runtime state after subscribing, not the old notLoaded snapshot", async () => {
  const { router, appServer } = setup();
  let subscribed = false;
  let reads = 0;
  appServer.readThreadStatus = async id => { reads++; return { thread: { id, cwd: "/workspace/allowed", status: { type: subscribed ? "active" : "notLoaded" } } }; };
  appServer.subscribeThread = async () => { const changed = !subscribed; subscribed = true; return changed; };
  const first = await router.handle(envelope({ type: "thread.status", threadId: "thread-1" }, "first-shared-status"));
  assert.equal(first.result.thread.status.type, "active");
  assert.equal(reads, 2);
  await router.handle(envelope({ type: "thread.status", threadId: "thread-1" }, "next-shared-status"));
  assert.equal(reads, 3, "already subscribed polls should not double-read");
});

test("unchanged snapshots skip history and image uploads but changed/forced reads hydrate", async () => {
  const { router, appServer, config } = setup();
  const thread = { id: "thread-1", cwd: "/workspace/allowed/demo", turns: [{ items: [{ text: "hello" }] }] };
  appServer.readThreadSnapshot = async () => ({ thread: structuredClone(thread) });
  let uploads = 0;
  router.service.prepareResourceImages = async (result) => { uploads++; return result; };
  const read = (id, snapshotHash) => router.handle(envelope({ type: "thread.read", threadId: thread.id, snapshotHash }, id));
  const first = await read("first");
  const unchanged = await read("unchanged", first.result.snapshotHash);
  assert.equal(unchanged.result.unchanged, true);
  assert.equal(unchanged.result.thread, undefined);
  assert.equal(uploads, 1);
  thread.turns[0].items[0].text += " world";
  const changed = await read("changed", first.result.snapshotHash);
  assert.notEqual(changed.result.snapshotHash, first.result.snapshotHash);
  assert.equal(changed.result.thread.turns[0].items[0].text, "hello world");
  const forced = await read("forced");
  assert.ok(forced.result.thread);
  assert.equal(uploads, 3);
  config.allowedProjects = ["/private"];
  assert.equal((await read("denied-hash", changed.result.snapshotHash)).error.code, "PROJECT_NOT_ALLOWED");
});

test("thread listing is constrained by the project whitelist", async () => {
  const { calls, router } = setup();
  const response = await router.handle(envelope({ type: "thread.list" }));
  assert.equal(response.success, true);
  assert.equal(calls.find(([name]) => name === "listThreads")[1].cwd, undefined);
  assert.deepEqual(response.result.data.map((thread) => thread.id), ["thread-allowed"]);
});

test("project listing is constrained by the project whitelist", async () => {
  const { calls, router } = setup();
  const response = await router.handle(envelope({ type: "project.list" }));
  assert.equal(response.success, true);
  assert.equal(calls.find(([name]) => name === "listProjects")[1].limit, undefined);
  assert.deepEqual(response.result.data.map((project) => project.id), ["project-allowed"]);
});

test("thread status uses the metadata-only App Server read", async () => {
  const { calls, router } = setup();
  const response = await router.handle(envelope({ type: "thread.status", threadId: "thread-allowed" }));
  assert.equal(response.success, true);
  assert.equal(response.result.thread.status.type, "active");
  assert.deepEqual(calls.find(([name]) => name === "readThreadStatus"), ["readThreadStatus", "thread-allowed"]);
  assert.equal(calls.some(([name]) => name === "readThread"), false);
});

test("thread reads prefer persisted snapshot methods over writer subscription", async () => {
  const { config, calls } = setup();
  let snapshotReads = 0;
  let snapshotStatusReads = 0;
  const appServer = {
    start: async () => calls.push(["start"]),
    readThreadSnapshot: async (threadId) => {
      snapshotReads += 1;
      return { thread: { id: threadId, cwd: "/workspace/allowed/demo", turns: [] } };
    },
    readThreadStatusSnapshot: async (threadId) => {
      snapshotStatusReads += 1;
      return { thread: { id: threadId, cwd: "/workspace/allowed/demo", status: { type: "active" } } };
    },
  };
  const router = new CommandRouter({
    configStore: { get: () => structuredClone(config) },
    appServer,
    service: { status: async () => ({ ok: true }), syncAfter: async () => ({ mode: "snapshot" }) },
    logger: { warn() {} },
  });

  const read = await router.handle(envelope({ type: "thread.read", threadId: "thread-allowed" }));
  const status = await router.handle(envelope({ type: "thread.status", threadId: "thread-allowed" }, "status-1"));
  assert.equal(read.success, true);
  assert.equal(status.success, true);
  assert.equal(snapshotReads, 1);
  assert.equal(snapshotStatusReads, 1);
});

test("model listing is forwarded to the App Server and allowed in read-only mode", async () => {
  const { calls, router } = setup({ readOnly: true });
  const response = await router.handle(envelope({ type: "model.list", includeHidden: false, limit: 100 }));
  assert.equal(response.success, true);
  assert.deepEqual(response.result.data, [
    { model: "remote-model", displayName: "Remote Model", isDefault: true },
  ]);
  assert.deepEqual(calls.find(([name]) => name === "listModels")[1], {
    type: "model.list",
    includeHidden: false,
    limit: 100,
  });
});

test("turn start verifies thread cwd and is idempotent by request id", async () => {
  const { calls, router } = setup();
  const message = envelope({
    type: "turn.start",
    threadId: "thread-1",
    text: "continue",
    model: "remote-model",
    effort: "high",
  });
  const first = await router.handle(message);
  const second = await router.handle(message);
  assert.equal(first.success, true);
  assert.deepEqual(second, first);
  assert.equal(calls.filter(([name]) => name === "startTurn").length, 1);
  assert.equal(calls.find(([name]) => name === "startTurn")[1].model, "remote-model");
  assert.equal(calls.find(([name]) => name === "startTurn")[1].effort, "high");
});

test("concurrent duplicate deliveries share one in-flight execution", async () => {
  const { calls, router } = setup({ delayTurn: true });
  const message = envelope({ type: "turn.start", threadId: "thread-1", text: "continue" });
  const [first, second] = await Promise.all([router.handle(message), router.handle(message)]);
  assert.equal(first.success, true);
  assert.deepEqual(second, first);
  assert.equal(calls.filter(([name]) => name === "startTurn").length, 1);
});

test("concurrent thread listings with different request ids share one App Server read", async () => {
  const { calls, router } = setup({ delayList: true });
  const [first, second] = await Promise.all([
    router.handle(envelope({ type: "thread.list" }, "list-1")),
    router.handle(envelope({ type: "thread.list" }, "list-2")),
  ]);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(first.requestId, "list-1");
  assert.equal(second.requestId, "list-2");
  assert.equal(calls.filter(([name]) => name === "listThreads").length, 1);
});

test("serializes status/read snapshots and annotates monotonic revisions", async () => {
  const { config } = setup();
  const calls = [];
  let releaseStatus;
  const statusGate = new Promise((resolve) => { releaseStatus = resolve; });
  const appServer = {
    start: async () => {},
    readThreadStatusSnapshot: async (threadId) => {
      calls.push("status:start");
      await statusGate;
      calls.push("status:end");
      return { thread: { id: threadId, cwd: "/workspace/allowed/demo", status: { type: "active" } } };
    },
    readThreadSnapshot: async (threadId) => {
      calls.push("read");
      return { thread: { id: threadId, cwd: "/workspace/allowed/demo", turns: [] } };
    },
  };
  const router = new CommandRouter({
    configStore: { get: () => structuredClone(config) },
    appServer,
    service: { status: async () => ({ ok: true }), syncAfter: async () => ({ mode: "snapshot" }) },
    logger: { warn() {} },
  });

  const statusPromise = router.handle(envelope({ type: "thread.status", threadId: "thread-allowed" }, "status-serial"));
  await new Promise((resolve) => setImmediate(resolve));
  const readPromise = router.handle(envelope({ type: "thread.read", threadId: "thread-allowed" }, "read-serial"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["status:start"]);
  releaseStatus();
  const [status, read] = await Promise.all([statusPromise, readPromise]);

  assert.deepEqual(calls, ["status:start", "status:end", "read"]);
  assert.equal(status.success, true);
  assert.equal(read.success, true);
  assert.equal(status.result.snapshotRevision, 1);
  assert.equal(read.result.snapshotRevision, 2);
  assert.equal(status.result.snapshotSource, "status");
  assert.equal(read.result.snapshotSource, "read");
});

test("large thread histories are compacted below the Relay frame budget", async () => {
  const threadTurns = Array.from({ length: 20 }, (_, index) => ({
    id: `turn-${index}`,
    items: [
      { type: "userMessage", content: [{ type: "text", text: `question-${index}` }] },
      { type: "commandExecution", aggregatedOutput: "x".repeat(200_000) },
      { type: "agentMessage", text: `answer-${index}` },
    ],
  }));
  const { router } = setup({ threadTurns });

  const response = await router.handle(envelope({ type: "thread.read", threadId: "thread-1" }));

  assert.equal(response.success, true);
  assert.ok(Buffer.byteLength(JSON.stringify(response), "utf8") < 1_600_000);
  assert.equal(response.result.thread.turns.length, 12);
  assert.equal(response.result.thread.turns.at(-1).id, "turn-19");
  assert.match(response.result.thread.turns.at(-1).items[1].aggregatedOutput, /历史输出已截断/);
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

test('remote answers require approval permission and authorize the registry thread, never an untrusted envelope', async () => {
  const { router, config, appServer } = setup();
  let answered = 0;
  appServer.getInteraction = () => ({ params: { threadId: 'real-thread' } });
  appServer.respondToUserInput = async () => { answered++; return { status: 'submitted' }; };
  const command = { type: 'userInput.respond', approvalId: 'interaction', answers: { q: { answers: ['yes'] } } };
  config.permissions.respondToApprovals = false;
  assert.equal((await router.handle(envelope(command, 'disabled'))).error.code, 'COMMAND_NOT_ALLOWED');
  config.permissions.respondToApprovals = true;
  assert.equal((await router.handle({ ...envelope(command, 'wrong-thread'), threadId: 'claimed-thread' })).error.code, 'PROJECT_NOT_ALLOWED');
  assert.equal((await router.handle({ ...envelope(command, 'allowed'), threadId: 'real-thread' })).success, true);
  config.allowedProjects = ['/other'];
  assert.equal((await router.handle({ ...envelope(command, 'revoked'), threadId: 'real-thread' })).error.code, 'PROJECT_NOT_ALLOWED');
  assert.equal(answered, 1);
});

test('composer writes wait in arrival order and a send follows the accepted settings', async () => {
  const { router, appServer, calls } = setup();
  let release;
  appServer.updateThreadSettings = async (id, patch) => {
    calls.push(['settings', id, patch]);
    if (patch.effort === 'high') await new Promise(resolve => { release = resolve; });
    return { threadId: id, threadSettings: { model: 'remote-model', ...patch } };
  };
  const first = router.handle(envelope({ type: 'thread.settings.update', threadId: 'thread-1', effort: 'high' }, 's1'));
  const second = router.handle(envelope({ type: 'thread.settings.update', threadId: 'thread-1', effort: 'ultra' }, 's2'));
  const turn = router.handle(envelope({ type: 'turn.start', threadId: 'thread-1', text: 'hello' }, 'send'));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.some(([name]) => name === 'startTurn'), false);
  release();
  assert.ok((await first).success);
  assert.ok((await second).success);
  assert.ok((await turn).success);
  assert.deepEqual(calls.filter(([name]) => ['settings', 'startTurn'].includes(name)).map(([name, , patch]) => [name, patch?.effort]), [['settings', 'high'], ['settings', 'ultra'], ['startTurn', undefined]]);
});

test('settings enforce read-only, project, and approval access and retain snapshot settings', async () => {
  const { router, appServer, config } = setup();
  let updates = 0;
  appServer.updateThreadSettings = async id => { updates++; return { threadId: id }; };
  const send = (patch, id) => router.handle(envelope({ type: 'thread.settings.update', threadId: 'thread-1', ...patch }, id));
  config.readOnly = true;
  assert.equal((await send({ model: 'm' }, 'ro')).error.code, 'COMMAND_NOT_ALLOWED');
  config.readOnly = false;
  config.allowedProjects = ['/private'];
  assert.equal((await send({ model: 'm' }, 'project')).error.code, 'PROJECT_NOT_ALLOWED');
  config.allowedProjects = ['/workspace/allowed'];
  config.permissions.respondToApprovals = false;
  assert.equal((await send({ permissionMode: '完全访问权限' }, 'permission')).error.code, 'COMMAND_NOT_ALLOWED');
  assert.equal(updates, 0);
  config.permissions.respondToApprovals = true;
  const request = envelope({ type: 'thread.settings.update', threadId: 'thread-1', permissionMode: '默认权限' }, 'once');
  assert.equal((await router.handle(request)).success, true);
  assert.equal((await router.handle(request)).success, true);
  assert.equal(updates, 1, 'replay must not repeat the mutation');
  config.permissions.respondToApprovals = false;
  assert.equal((await router.handle(request)).error.code, 'COMMAND_NOT_ALLOWED');
  appServer.threadSettings = () => ({ model: 'm', effort: 'ultra', revision: 1 });
  for (const type of ['thread.read', 'thread.status']) {
    const read = await router.handle(envelope({ type, threadId: 'thread-1' }, type));
    assert.equal(read.result.threadSettings.effort, 'ultra');
  }
});
