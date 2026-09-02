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
  config.relay.endpointId = "cli-endpoint-test";
  const store = { get: () => structuredClone(config), endpointIdentity: async () => ({ publicKey, privateKey }) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} });
  t.after(() => client.disconnect("test complete"));

  await client.connect("connect-token-test");
  assert.deepEqual(client.status().features, ["streams", "ack"]);
  assert.equal(sent[0].endpointId, "cli-endpoint-test");
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

test("requires a Relay Endpoint ID before opening a connection", async () => {
  const config = defaultConfig();
  config.relay.url = "ws://127.0.0.1:8788/v1/connect";
  config.relay.spaceId = "space-test";
  const store = { get: () => structuredClone(config) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} });
  await assert.rejects(() => client.connect("connect-token-test"), { code: "CONFIG_INCOMPLETE" });
  await assert.rejects(() => client.test("connect-token-test"), { code: "CONFIG_INCOMPLETE" });
});

test("rejects a welcome for a different Relay Endpoint ID during a connection test", async (t) => {
  const previousWebSocket = globalThis.WebSocket;
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    #listeners = new Map();

    constructor() {
      queueMicrotask(() => this.#emit("open", {}));
    }

    addEventListener(type, listener) {
      const listeners = this.#listeners.get(type) || [];
      listeners.push(listener);
      this.#listeners.set(type, listeners);
    }

    send(payload) {
      const hello = JSON.parse(payload);
      queueMicrotask(() => this.#emit("message", {
        data: JSON.stringify({
          version: 1,
          type: "connect.welcome",
          requestId: hello.requestId,
          connectionId: "connection-test",
          sessionId: "session-test",
          spaceId: hello.spaceId,
          endpointId: "cli-another-endpoint",
          maxFrameSize: 1024 * 1024,
        }),
      }));
    }

    close() {
      this.readyState = 3;
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
  config.relay.endpointId = "cli-endpoint-test";
  const store = { get: () => structuredClone(config), endpointIdentity: async () => ({ publicKey, privateKey }) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} });

  await assert.rejects(() => client.test("connect-token-test"), { code: "INVALID_MESSAGE" });
});

test("deduplicates concurrent connects and waits for manual disconnect", async (t) => {
  const previousWebSocket = globalThis.WebSocket;
  let socketCount = 0;
  class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    #listeners = new Map();

    constructor() {
      socketCount += 1;
      queueMicrotask(() => this.#emit("open", {}));
    }

    addEventListener(type, listener) {
      const listeners = this.#listeners.get(type) || [];
      listeners.push(listener);
      this.#listeners.set(type, listeners);
    }

    send(payload) {
      const hello = JSON.parse(payload);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.#emit("message", {
          data: JSON.stringify({
            version: 1,
            type: "connect.welcome",
            requestId: hello.requestId,
            connectionId: "connection-deduplicated",
            sessionId: "session-deduplicated",
            spaceId: hello.spaceId,
            endpointId: hello.endpointId,
            maxFrameSize: 1024 * 1024,
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
  config.relay.endpointId = "cli-endpoint-test";
  const store = { get: () => structuredClone(config), endpointIdentity: async () => ({ publicKey, privateKey }) };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} });

  await Promise.all([client.connect("connect-token-test"), client.connect("connect-token-test")]);
  assert.equal(socketCount, 1);
  const result = await client.test("connect-token-test");
  assert.equal(result.reused, true);
  await client.disconnect("test complete");
  assert.equal(client.status().state, "disconnected");
});

test("refreshes a stale token after auth.invalid_token when an Endpoint Grant is available", async (t) => {
  const previousWebSocket = globalThis.WebSocket;
  let socketCount = 0;
  const hellos = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    #listeners = new Map();

    constructor() {
      socketCount += 1;
      queueMicrotask(() => this.#emit("open", {}));
    }

    addEventListener(type, listener) {
      const listeners = this.#listeners.get(type) || [];
      listeners.push(listener);
      this.#listeners.set(type, listeners);
    }

    send(payload) {
      const hello = JSON.parse(payload);
      hellos.push(hello);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        if (socketCount === 1) {
          this.#emit("message", {
            data: JSON.stringify({
              version: 1,
              type: "relay.error",
              code: "auth.invalid_token",
              message: "connect token is unavailable",
            }),
          });
          this.close();
          return;
        }
        this.#emit("message", {
          data: JSON.stringify({
            version: 1,
            type: "connect.welcome",
            requestId: hello.requestId,
            connectionId: "connection-refreshed",
            sessionId: "session-refreshed",
            spaceId: hello.spaceId,
            endpointId: hello.endpointId,
            maxFrameSize: 1024 * 1024,
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
  config.relay.endpointId = "cli-endpoint-test";
  const store = {
    get: () => structuredClone(config),
    endpointIdentity: async () => ({ publicKey, privateKey }),
    relayCredential: async () => ({ connectToken: "stale-token", endpointGrant: "grant-test" }),
  };
  let refreshRequested = false;
  const tokenService = {
    usableToken: async ({ force, credential }) => {
      if (force) {
        refreshRequested = true;
        return "refreshed-token";
      }
      return credential?.connectToken || "stale-token";
    },
  };
  const client = new RelayClient(store, { info() {}, warn() {}, error() {} }, { tokenService });
  t.after(() => client.disconnect("test complete"));

  await assert.rejects(
    () => client.connect({ connectToken: "stale-token", endpointGrant: "grant-test" }),
    { code: "auth.invalid_token" },
  );
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  assert.equal(refreshRequested, true);
  assert.equal(client.status().state, "connected");
  assert.equal(hellos.at(-1).token, "refreshed-token");
});
