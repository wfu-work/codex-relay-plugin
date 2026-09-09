import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { RelayClient } from "../server/relay-client.js";
import { defaultConfig } from "../server/config-store.js";

async function setup(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: Date.now() });
  const sockets = [], sent = [];
  class Socket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    listeners = new Map();
    constructor() { sockets.push(this); queueMicrotask(() => this.emit("open", {})); }
    addEventListener(type, callback) {
      const callbacks = this.listeners.get(type) || [];
      callbacks.push(callback);
      this.listeners.set(type, callbacks);
    }
    emit(type, value) { for (const callback of this.listeners.get(type) || []) callback(value); }
    receive(message) { this.emit("message", { data: JSON.stringify(message) }); }
    send(encoded) {
      const frame = JSON.parse(encoded);
      sent.push(frame);
      if (frame.type === "connect.hello") queueMicrotask(() => this.receive({
        version: 1, type: "connect.welcome", requestId: frame.requestId,
        connectionId: `connection-${sockets.length}`, sessionId: "session",
        spaceId: frame.spaceId, endpointId: frame.endpointId,
        maxFrameSize: 10 * 1024 * 1024, features: ["directed-routing", "resources-v1"],
      }));
      if (frame.protocol === "codex.resource.v1") queueMicrotask(() => this.receive({
        type: "stream.message", protocol: "codex.resource.v1", payload: {
          type: "codex.resource.ready", requestId: frame.payload.requestId,
          resourceUrl: "http://relay.test/image", expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      }));
    }
    close() { this.readyState = 3; this.emit("close", { code: 1000 }); }
  }
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = previous; });
  const config = defaultConfig();
  Object.assign(config.relay, { url: "ws://relay.test", spaceId: "space", endpointId: "endpoint" });
  const pair = generateKeyPairSync("ed25519");
  const store = { get: () => config, endpointIdentity: async () => ({
    publicKey: Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("base64url"),
    privateKey: Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" })).toString("base64url"),
  }) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} }, {
    tokenService: { usableToken: async () => "test-token" },
  });
  t.after(() => client.disconnect());
  await client.connect("test-token");
  return { client, sockets, sent };
}

test("repeated images upload once; large data is paced while ping stays responsive", async (t) => {
  const { client, sockets, sent } = await setup(t);
  const image = { mime: "image/png", data: Buffer.alloc(1024 * 1024) };
  const urls = await Promise.all([client.uploadResource(image), client.uploadResource(image)]);
  await client.uploadResource(image);
  assert.deepEqual(urls[0], urls[1]);
  assert.equal(sent.filter((f) => f.protocol === "codex.resource.v1").length, 1);
  assert.equal(client.send({ type: "codex.command.result", targetDeviceId: "phone", requestId: "read" }), true);
  assert.equal(client.status().transfer.queuedFrames, 1);
  client.send({ type: "ping" });
  assert.equal(sent.at(-1).type, "ping");
  t.mock.timers.tick(3000);
  assert.equal(sent.at(-1).payload.requestId, "read");
  assert.equal(sockets.length, 1);
});

test("rate-limit close preserves the reason and waits for the quota window", async (t) => {
  const { client, sockets } = await setup(t);
  sockets[0].receive({ type: "relay.error", code: "rate.limited", message: "byte rate limit exceeded" });
  sockets[0].emit("error", {});
  sockets[0].close();
  assert.match(client.status().lastError, /byte rate limit exceeded/);
  assert.equal(client.status().state, "reconnecting");
  assert.equal(client.status().transfer.bytesPerSecond, 256 * 1024);
  t.mock.timers.tick(59_000);
  assert.equal(sockets.length, 1);
  t.mock.timers.tick(1000);
  await new Promise(setImmediate);
  assert.equal(sockets.length, 2);
  assert.equal(client.status().state, "connected");
});

test("disconnect discards queued responses before a new connection is used", async (t) => {
  const { client, sent } = await setup(t);
  client.send({ type: "codex.event", sequence: 1 });
  client.send({ type: "codex.command.result", targetDeviceId: "phone", requestId: "stale" });
  assert.equal(client.status().transfer.queuedFrames, 1);
  await client.disconnect();
  await client.connect("test-token");
  t.mock.timers.tick(10_000);
  assert.equal(sent.some((frame) => frame.payload?.requestId === "stale"), false);
  assert.equal(client.status().transfer.queuedBytes, 0);
});
