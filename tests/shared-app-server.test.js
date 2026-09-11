import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocketServer } from "ws";
import { AppServerClient } from "../server/app-server-client.js";
import { ConfigStore, defaultConfig, validateConfig } from "../server/config-store.js";
import { parseAppServerEndpoint } from "../server/app-server-transport.js";
import { EventBuffer } from "../server/event-buffer.js";

const logger = { info() {}, warn() {}, error() {} };
async function until(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error("condition timed out"); await new Promise(r => setTimeout(r, 10)); }
}
async function server(t, { socketPath, initialize = true } = {}) {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const requests = [];
  let turns = 0;
  let settings = { model: "desktop-model", effort: "medium", approvalPolicy: "on-request", approvalsReviewer: "user", activePermissionProfile: { id: ":workspace" } };
  wss.on("connection", socket => {
    socket.subscribed = new Set();
    socket.on("message", data => {
      const m = JSON.parse(data);
      requests.push({ socket, ...m });
      if (m.id === undefined) return;
      const respond = result => socket.send(JSON.stringify({ id: m.id, result }));
      if (m.method === "initialize") { if (initialize) respond({ userAgent: "codex/0.153.4" }); }
      else if (m.method === "thread/resume") { socket.subscribed.add(m.params.threadId); respond({ ...settings, reasoningEffort: settings.effort, thread: { id: m.params.threadId } }); }
      else if (m.method === "thread/read") respond({ thread: { id: m.params.threadId, cwd: "/allowed", status: { type: "active" }, turns: [] } });
      else if (m.method === "thread/settings/update") {
        const { threadId, permissions, ...patch } = m.params;
        settings = { ...settings, ...patch, ...(permissions ? { activePermissionProfile: { id: permissions } } : {}) };
        for (const peer of wss.clients) if (peer.subscribed.has(threadId)) {
          peer.send(JSON.stringify({ method: "thread/settings/updated", params: { threadId, threadSettings: settings } }));
        }
        respond({});
      }
      else if (m.method === "turn/start") {
        turns++;
        if (m.params.input[0].text === "drop-reply") { socket.terminate(); return; }
        respond({ turn: { id: `turn-${turns}` } });
        for (const peer of wss.clients) if (peer.subscribed.has(m.params.threadId)) {
          peer.send(JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: m.params.threadId, turnId: `turn-${turns}`, delta: "shared output" } }));
        }
      } else respond({});
    });
  });
  await new Promise(resolve => socketPath ? httpServer.listen(socketPath, resolve) : httpServer.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  });
  return { wss, requests, endpoint: socketPath ? `unix://${socketPath}` : `ws://127.0.0.1:${httpServer.address().port}`, turns: () => turns };
}
function client(t, endpoint, options = {}) {
  // Any CLI launch or --version probe would fail, proving shared mode only
  // uses the configured transport even on recovery/diagnostics paths.
  const c = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: endpoint, executable: "/does-not-exist-codex", defaultWorkingDirectory: "" } }) }, logger,
    { reconnectBaseMs: 30, reconnectMaxMs: 100, connectTimeoutMs: 150, initializeTimeoutMs: 150, ...options });
  t.after(() => c.stop());
  return c;
}

test("shared clients receive the same output and stopping a client keeps its peer/backend alive", async t => {
  const s = await server(t);
  const a = client(t, s.endpoint), b = client(t, s.endpoint);
  const aEvents = [], bEvents = [];
  a.on("notification", (...args) => aEvents.push(args));
  b.on("notification", (...args) => bEvents.push(args));
  await Promise.all([a.start(), b.start()]);
  assert.equal(a.status().version, "codex/0.153.4");
  assert.equal(a.status().pid, null);
  assert.equal(a.status().ownsProcess, false);
  await Promise.all([a.subscribeThread("thread-1"), b.subscribeThread("thread-1")]);
  await a.startTurn({ threadId: "thread-1", text: "hello" });
  await until(() => aEvents.length === 1 && bEvents.length === 1);
  assert.deepEqual(aEvents, bEvents);
  await a.stop();
  await b.startTurn({ threadId: "thread-1", text: "still alive" });
  await until(() => bEvents.length === 2);
  assert.equal(s.turns(), 2);
  assert.equal(a.status().state, "stopped");
  assert.equal(b.status().state, "ready");
});

test("shared reconnect restores subscriptions without replaying an unacknowledged turn", async t => {
  const s = await server(t);
  const c = client(t, s.endpoint);
  await c.start();
  const states = [];
  c.on("status", status => states.push(status.state));
  await c.subscribeThread("thread-1");
  await assert.rejects(c.startTurn({ threadId: "thread-1", text: "drop-reply" }), /未确认的命令不会自动重发/);
  await until(() => states.includes("reconnecting") && c.state === "ready");
  assert.equal(s.turns(), 1);
  assert.equal(s.requests.filter(r => r.method === "thread/resume").length, 2);
  const events = [];
  c.on("notification", (...args) => events.push(args));
  for (const peer of s.wss.clients) if (peer.subscribed.has("thread-1")) peer.send(JSON.stringify({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } }));
  await until(() => events.length === 1);
  assert.equal(events[0][1].turn.id, "turn-1");
});

test("shared Unix sockets work and diagnostics do not claim a CLI version", async t => {
  if (process.platform === "win32") return t.skip("Unix socket transport");
  const dir = await fs.mkdtemp("/tmp/recodex-sock-");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const s = await server(t, { socketPath: path.join(dir, "server.sock") });
  const c = client(t, s.endpoint);
  const check = await c.checkAvailability();
  assert.equal(check.version, null);
  assert.equal(check.connectionMode, "shared");
  await c.start();
  assert.equal(c.status().transport, "unix");
  const result = await c.readThreadStatus("thread-1");
  assert.equal(result.thread.status.type, "active");
  assert.equal(s.requests.some(r => r.method === "thread/resume"), false, "raw reads must not subscribe before authorization");
});

test("stop cancels a stalled initialize and prevents a reconnect resurrection", async t => {
  const s = await server(t, { initialize: false });
  const c = client(t, s.endpoint, { initializeTimeoutMs: 5000 });
  const starting = c.start();
  const rejected = assert.rejects(starting, /停止|取消|中断/);
  await until(() => s.requests.some(r => r.method === "initialize"));
  await c.stop();
  await rejected;
  const count = s.requests.length;
  await new Promise(r => setTimeout(r, 180));
  assert.equal(c.status().state, "stopped");
  assert.equal(s.requests.length, count);
  assert.equal(c.status().pendingRequests, 0);
});

test("an unavailable shared endpoint retries then stops without starting a CLI", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-unavailable-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const c = client(t, `unix://${path.join(dir, "missing.sock")}`);
  await assert.rejects(c.start());
  assert.equal(c.state, "reconnecting");
  await until(() => c.status().reconnectAttempt >= 2);
  await c.stop();
  assert.equal(c.state, "stopped");
  assert.equal(c.status().nextRetryAt, null);
});

test("shared endpoint configuration is explicit, local, credential-free, and persists alongside legacy defaults", async t => {
  for (const endpoint of ["", "https://127.0.0.1", "ws://example.com", "ws://user:password@localhost", "ws://localhost/?token=secret", "ws://localhost/#key", "unix://relative", "unix:///tmp/a?token=secret"]) {
    const config = defaultConfig(); config.codex.connectionMode = "shared"; config.codex.appServerEndpoint = endpoint;
    assert.throws(() => validateConfig(config), endpoint);
  }
  assert.equal(parseAppServerEndpoint("ws://[::1]:4500").kind, "websocket");
  assert.equal(parseAppServerEndpoint("unix://").kind, "unix");
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-shared-config-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({ version: 1, codex: { executable: "legacy-codex" } }));
  const store = new ConfigStore({ configDir });
  await store.load();
  assert.equal(store.get().codex.connectionMode, "managed");
  assert.equal(store.get().codex.executable, "legacy-codex");
  await store.update({ codex: { connectionMode: "shared", appServerEndpoint: "ws://127.0.0.1:4500" } });
  await store.load();
  assert.equal(store.get().codex.appServerEndpoint, "ws://127.0.0.1:4500/");
  assert.equal(store.get().codex.connectionMode, "shared");
});

test("a lost backend connection invalidates event replay without reusing sequence numbers", () => {
  const buffer = new EventBuffer();
  buffer.push({ sequence: buffer.nextSequence() });
  const cursor = buffer.latestSequence();
  buffer.invalidateReplay();
  assert.equal(buffer.after(cursor), null);
  assert.ok(buffer.nextSequence() > cursor + 1);
});


test("composer settings synchronize both ways and recover after reconnect", async t => {
  const s = await server(t);
  const phone = client(t, s.endpoint), desktop = client(t, s.endpoint);
  await Promise.all([phone.start(), desktop.start()]);
  await Promise.all([phone.subscribeThread("thread-1"), desktop.subscribeThread("thread-1")]);
  assert.equal(phone.threadSettings("thread-1").effort, "medium");
  await phone.updateThreadSettings("thread-1", { model: "phone-model", effort: "high", permissions: ":danger-full-access", approvalPolicy: "never" });
  await until(() => desktop.threadSettings("thread-1")?.effort === "high");
  assert.equal(desktop.threadSettings("thread-1").activePermissionProfile.id, ":danger-full-access");
  await desktop.updateThreadSettings("thread-1", { model: "desktop-model", effort: "ultra", permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "auto_review" });
  await until(() => phone.threadSettings("thread-1")?.effort === "ultra");
  assert.equal(phone.threadSettings("thread-1").approvalsReviewer, "auto_review");
  const resumes = s.requests.filter(r => r.method === "thread/resume").length;
  assert.equal(resumes, 2, "notifications should avoid extra resume requests");
  const socket = s.requests.find(r => r.method === "thread/resume").socket;
  socket.terminate();
  await until(() => s.requests.filter(r => r.method === "thread/resume").length > resumes);
  await until(() => phone.state === "ready" && desktop.state === "ready");
  assert.equal(phone.threadSettings("thread-1").effort, "ultra");
});
