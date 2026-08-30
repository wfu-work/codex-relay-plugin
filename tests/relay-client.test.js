import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { defaultConfig } from "../server/config-store.js";
import { RelayClient } from "../server/relay-client.js";

test("blocks targeted sends when Relay does not advertise directed routing", async (t) => {
  const previousWebSocket = globalThis.WebSocket;
  const sent = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    #listeners = new Map();

    constructor(url) {
      this.url = url;
      queueMicrotask(() => this.#emit("open", {}));
    }

    addEventListener(type, listener) {
      const listeners = this.#listeners.get(type) || [];
      listeners.push(listener);
      this.#listeners.set(type, listeners);
    }

    send(payload) {
      sent.push(JSON.parse(payload));
      if (sent.length !== 1) return;
      const hello = sent[0];
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.#emit("message", {
          data: JSON.stringify({
            version: 1,
            type: "connect.welcome",
            requestId: hello.requestId,
            connectionId: "connection-test",
            sessionId: "session-test",
            spaceId: hello.spaceId,
            endpointId: hello.endpointId,
            maxFrameSize: 1024 * 1024,
            features: ["streams", "ack"],
          }),
        });
      });
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.#emit("close", { code: 1000 });
    }

    #emit(type, event) {
      for (const listener of this.#listeners.get(type) || []) listener(event);
    }
  }
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => {
    globalThis.WebSocket = previousWebSocket;
  });

  const pair = generateKeyPairSync("ed25519");
  const publicKey = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" })).subarray(-32).toString("base64url");
  const privateKey = Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" })).toString("base64url");
  const config = defaultConfig();
  config.relay.url = "ws://127.0.0.1:8788/v1/connect";
  config.relay.spaceId = "space-test";
  const store = { get: () => structuredClone(config), endpointIdentity: async () => ({ publicKey, privateKey }) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} });
  t.after(() => client.disconnect("test complete"));

  await client.connect("connect-token-test");
  assert.deepEqual(client.status().features, ["streams", "ack"]);
  assert.equal(
    client.send({
      type: "codex.command.result",
      requestId: "request-test",
      targetDeviceId: "mobile-test",
      result: { ok: true },
    }),
    false,
  );
  assert.equal(client.status().lastError, "当前 Relay 套餐不支持定向转发，敏感命令未发送");
  assert.equal(sent.length, 1);
});
