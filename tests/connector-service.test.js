import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorService } from "../server/connector-service.js";
import { defaultConfig } from "../server/config-store.js";
import { ConfigStore } from "../server/config-store.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function configurableService(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-service-shared-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configStore = new ConfigStore({ configDir: dir });
  await configStore.load();
  const actions = [];
  const relay = new EventEmitter();
  relay.state = "connected";
  relay.status = () => ({ state: relay.state });
  relay.disconnect = async () => { actions.push("relay.disconnect"); relay.state = "disconnected"; };
  relay.connect = async () => { actions.push("relay.connect"); relay.state = "connected"; return relay.status(); };
  const appServer = new EventEmitter();
  appServer.state = "ready";
  appServer.status = () => ({ state: appServer.state });
  appServer.start = async () => { actions.push("backend.start"); appServer.state = "ready"; };
  appServer.stop = async () => { actions.push("backend.stop"); appServer.state = "stopped"; };
  const service = new ConnectorService({ configStore, appServer, relay, instanceLock: { acquire: async () => {}, release: async () => {} }, logger: { info() {}, warn() {}, error() {} } });
  service.startedAt = new Date().toISOString();
  return { service, actions, appServer, relay, configStore };
}

test("switching backend endpoints closes the old connection; unrelated saves preserve it", async t => {
  const { service, actions } = await configurableService(t);
  await service.updateConfig({ codex: { connectionMode: "shared", appServerEndpoint: "ws://127.0.0.1:4500", autoStartAppServer: false } });
  assert.deepEqual(actions, ["relay.disconnect", "backend.stop", "backend.start", "relay.connect"]);
  actions.length = 0;
  await service.updateConfig({ relay: { deviceName: "new name" } });
  assert.equal(actions.includes("backend.stop"), false);
  actions.length = 0;
  await service.updateConfig({ allowedProjects: ["/allowed"] });
  assert.equal(actions.includes("backend.stop"), true, "revoking access must drop old shared subscriptions");
});

test("invalid shared endpoints leave the existing connection intact", async t => {
  const { service, actions } = await configurableService(t);
  await assert.rejects(service.updateConfig({ codex: { connectionMode: "shared", appServerEndpoint: "ws://external.example" } }));
  assert.deepEqual(actions, []);
});

test("Relay stays reachable while the shared backend retries its initial connection", async t => {
  const { service, actions, configStore, appServer } = await configurableService(t);
  await configStore.update({ codex: { connectionMode: "shared", appServerEndpoint: "ws://127.0.0.1:4500", autoStartAppServer: false } });
  appServer.start = async () => { appServer.state = "reconnecting"; throw new Error("connection refused"); };
  await service.connect();
  assert.deepEqual(actions, ["relay.connect"]);
  assert.equal((await service.status()).appServer.state, "reconnecting");
});

test("a command from a retired connection cannot send its response after reconnect", async () => {
  const config = defaultConfig();
  const relay = new EventEmitter();
  relay.connectionId = "old";
  const sent = [];
  relay.send = (message) => { sent.push(message); return true; };
  const service = new ConnectorService({
    configStore: { get: () => config }, appServer: new EventEmitter(), relay,
    logger: { info() {}, warn() {}, error() {} },
  });
  let finish;
  service.router.handle = () => new Promise((resolve) => { finish = resolve; });
  relay.emit("command", { requestId: "old-request" });
  relay.connectionId = "new";
  finish({ requestId: "old-request" });
  await new Promise(setImmediate);
  assert.deepEqual(sent, []);
});

test("event access checks use the metadata status read without blocking deltas", async () => {
  const config = defaultConfig();
  config.allowedProjects = ["/workspace/allowed"];
  const appServer = new EventEmitter();
  const relay = new EventEmitter();
  const calls = [];
  appServer.readThreadStatus = async (threadId) => {
    calls.push(["status", threadId]);
    return { thread: { id: threadId, cwd: "/workspace/allowed/demo", status: { type: "active" } } };
  };
  appServer.readThread = async (threadId) => {
    calls.push(["read", threadId]);
    return { thread: { id: threadId, cwd: "/workspace/allowed/demo" } };
  };
  relay.send = (message) => {
    calls.push(["send", message.event?.type]);
    return true;
  };

  const service = new ConnectorService({
    configStore: { get: () => config },
    appServer,
    relay,
    logger: { info() {}, warn() {}, error() {} },
  });
  appServer.emit("notification", "item/agentMessage/delta", {
    threadId: "thread-1",
    turnId: "turn-1",
    delta: "hello",
  });
  await service.eventQueue;

  assert.deepEqual(calls, [
    ["status", "thread-1"],
    ["send", "message.assistant.delta"],
  ]);
});

function recoveryService() {
  const config = defaultConfig();
  const appServer = new EventEmitter(), relay = new EventEmitter(), sent = [];
  appServer.start = async () => {};
  appServer.status = () => ({ state: 'ready' });
  appServer.listThreads = async () => ({ data: [] });
  relay.status = () => ({ state: 'connected' });
  relay.send = frame => { sent.push(frame); return true; };
  const service = new ConnectorService({ configStore: { get: () => config, publicConfig: async () => config }, appServer, relay, logger: { info() {}, warn() {}, error() {} } });
  return { service, appServer, relay, sent };
}

test('stream namespaces force snapshots even when an old cursor is numerically valid', async () => {
  const { service, appServer } = recoveryService();
  appServer.emit('notification', 'item/agentMessage/delta', { threadId: 't', delta: 'before' });
  await service.eventQueue;
  const old = service.eventStreamId;
  appServer.emit('status', { state: 'reconnecting' });
  appServer.emit('notification', 'item/agentMessage/delta', { threadId: 't', delta: 'after' });
  await service.eventQueue;
  assert.equal((await service.syncAfter(1, old)).mode, 'snapshot');
  assert.notEqual(service.eventStreamId, old);
});

test('a delta waiting on an async resource cannot leak into the replacement event stream', async () => {
  const { service, appServer, sent } = recoveryService();
  let release;
  service.prepareResourceImages = event => new Promise(resolve => { release = () => resolve(event); });
  appServer.emit('notification', 'item/agentMessage/delta', { threadId: 't', delta: 'stale' });
  await new Promise(setImmediate);
  appServer.emit('status', { state: 'reconnecting' });
  release(); await service.eventQueue;
  assert.equal(sent.filter(frame => frame.type === 'codex.event').length, 0);
});

test('snapshot watermark leaves events produced during the read available for replay', async () => {
  const { service, appServer } = recoveryService();
  let release;
  appServer.listThreads = () => new Promise(resolve => { release = () => resolve({ data: [] }); });
  const pending = service.syncAfter(null);
  await new Promise(setImmediate);
  appServer.emit('notification', 'item/agentMessage/delta', { threadId: 't', delta: 'during snapshot' });
  await service.eventQueue;
  release();
  const snapshot = await pending;
  assert.equal(snapshot.latestSequence, 0);
  const replay = await service.syncAfter(snapshot.latestSequence, snapshot.eventStreamId);
  assert.equal(replay.mode, 'events');
  assert.equal(replay.events.length, 1);
  assert.equal(replay.events[0].eventStreamId, snapshot.eventStreamId);
});

test('empty baseline settles as an empty replay instead of an infinite snapshot loop', async () => {
  const { service } = recoveryService();
  const first = await service.syncAfter(null);
  assert.equal(first.mode, 'snapshot');
  const next = await service.syncAfter(first.latestSequence, first.eventStreamId);
  assert.equal(next.mode, 'events');
  assert.deepEqual(next.events, []);
});
