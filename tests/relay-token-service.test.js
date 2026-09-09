import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ConfigStore } from "../server/config-store.js";
import { RelayTokenService } from "../server/relay-token-service.js";

test("refreshes an expiring token once and persists the rotated credential", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-refresh-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "refresh-space" } }, {
    connectToken: "old-token-".padEnd(43, "x"),
    expiresAt: Date.now() + 1_000,
    endpointGrant: "grant-".padEnd(43, "g"),
    grantExpiresAt: Date.now() + 86_400_000,
    tokenEndpoint: "http://127.0.0.1:8788/api/connect-tokens/refresh",
  });
  const identity = await store.endpointIdentity();
  let calls = 0;
  let request;
  const fetch = async (_url, options) => {
    calls += 1;
    request = JSON.parse(options.body);
    const canonical = [
      "relay-connect-token-v1",
      request.proof.requestId,
      request.proof.issuedAt,
      request.proof.nonce,
      request.endpointGrant,
    ].join("\n");
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(identity.publicKey, "base64url")]),
      format: "der",
      type: "spki",
    });
    assert.equal(
      crypto.verify(null, Buffer.from(canonical), publicKey, Buffer.from(request.proof.signature, "base64url")),
      true,
    );
    return new Response(JSON.stringify({
      code: 200,
      data: { connectToken: "new-token-".padEnd(43, "n"), expiresAt: Date.now() + 600_000 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const service = new RelayTokenService(store, { info() {} }, { fetch });
  const [first, second] = await Promise.all([service.usableToken(), service.usableToken()]);
  assert.equal(first, second);
  assert.equal(first, "new-token-".padEnd(43, "n"));
  assert.equal(calls, 1);
  assert.equal((await store.relayCredential()).connectToken, first);
  assert.equal(request.endpointGrant, "grant-".padEnd(43, "g"));
});

test("force refreshes a token when expiry metadata is unavailable", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-force-refresh-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "force-refresh-space" } }, {
    connectToken: "old-token-".padEnd(43, "x"),
    endpointGrant: "grant-".padEnd(43, "g"),
    grantExpiresAt: Date.now() + 86_400_000,
    tokenEndpoint: "http://127.0.0.1:8788/api/connect-tokens/refresh",
  });
  let calls = 0;
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        code: 200,
        data: { connectToken: "rotated-token-".padEnd(43, "r"), expiresAt: Date.now() + 600_000 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(await service.usableToken({ force: true }), "rotated-token-".padEnd(43, "r"));
  assert.equal(calls, 1);
});

test("refreshes a grant-only credential before the first handshake", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-grant-only-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "grant-only-space" } }, {
    endpointGrant: "grant-only-0123456789",
    grantExpiresAt: Date.now() + 86_400_000,
  });
  let calls = 0;
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        code: 200,
        data: { connectToken: "grant-token-".padEnd(43, "g"), expiresAt: Date.now() + 600_000 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(await service.usableToken(), "grant-token-".padEnd(43, "g"));
  assert.equal(calls, 1);
  const credential = await store.relayCredential();
  assert.equal(credential.endpointGrant, "grant-only-0123456789");
  assert.equal(credential.connectToken, "grant-token-".padEnd(43, "g"));
});

test("uses an unsaved Grant for a draft refresh without writing into the selected Space", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-refresh-draft-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "other-space" } }, {
    connectToken: "other-space-token-".padEnd(43, "o"),
    endpointGrant: "other-space-grant-0123456789",
  });
  await store.update({ relay: { spaceId: "draft-space" } });
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => new Response(JSON.stringify({
      code: 200,
      data: {
        connectToken: "draft-refresh-token-".padEnd(43, "d"),
        expiresAt: Date.now() + 600_000,
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  const refreshed = await service.usableCredential({
    credential: { endpointGrant: "draft-grant-0123456789" },
  });
  assert.equal(refreshed.connectToken, "draft-refresh-token-".padEnd(43, "d"));
  assert.equal(refreshed.endpointGrant, "draft-grant-0123456789");
  assert.equal(await store.relayCredential(), null);

  await store.update({ relay: { spaceId: "other-space" } });
  const other = await store.relayCredential();
  assert.equal(other.connectToken, "other-space-token-".padEnd(43, "o"));
  assert.equal(other.endpointGrant, "other-space-grant-0123456789");
});

test("does not inherit a persisted Grant for a replacement token-only draft", async () => {
  const { store } = refreshFixture({
    credential: {
      connectToken: "persisted-token-".padEnd(43, "p"),
      expiresAt: Date.now() + 86_400_000,
      endpointGrant: "persisted-grant-0123456789",
      grantExpiresAt: Date.now() + 86_400_000,
    },
  });
  let refreshCalls = 0;
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => {
      refreshCalls += 1;
      throw new Error("replacement token must not use the old Grant");
    },
  });

  const replacement = "replacement-token-".padEnd(43, "r");
  const result = await service.usableCredential({
    credential: { connectToken: replacement },
    persist: false,
  });
  assert.equal(result.connectToken, replacement);
  assert.equal(result.endpointGrant, undefined);
  assert.equal(refreshCalls, 0);
});

test("does not apply a refresh response after the Grant changes", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-refresh-context-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "refresh-context-space" } }, {
    connectToken: "old-context-token-".padEnd(43, "x"),
    expiresAt: Date.now() + 1_000,
    endpointGrant: "old-context-grant-0123456789",
    grantExpiresAt: Date.now() + 86_400_000,
  });
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => {
      await waiting;
      return new Response(JSON.stringify({
        code: 200,
        data: { connectToken: "stale-context-token-".padEnd(43, "s"), expiresAt: Date.now() + 600_000 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const refresh = service.usableToken();
  await new Promise((resolve) => setImmediate(resolve));
  await store.update({}, {
    endpointGrant: "new-context-grant-0123456789",
    grantExpiresAt: Date.now() + 86_400_000,
  });
  release();
  await assert.rejects(refresh, { code: "AUTH_CONTEXT_CHANGED" });
  const credential = await store.relayCredential();
  assert.equal(credential.endpointGrant, "new-context-grant-0123456789");
  assert.notEqual(credential.connectToken, "stale-context-token-".padEnd(43, "s"));
});

test("keeps a persisted Grant usable when an old environment token is present", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-refresh-env-"));
  t.after(async () => {
    delete process.env.CODEX_RELAY_TOKEN;
    await fs.rm(configDir, { recursive: true, force: true });
  });
  const store = new ConfigStore({ configDir });
  await store.load();
  await store.update({ relay: { url: "ws://127.0.0.1:8788/v1/connect", spaceId: "refresh-env-space" } }, {
    connectToken: "persisted-old-token-".padEnd(43, "o"),
    expiresAt: Date.now() + 60_000,
    endpointGrant: "refresh-env-grant-0123456789",
    grantExpiresAt: Date.now() + 86_400_000,
  });
  process.env.CODEX_RELAY_TOKEN = "environment-old-token";
  let calls = 0;
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        code: 200,
        data: {
          connectToken: "environment-rotated-token-".padEnd(43, "r"),
          expiresAt: Date.now() + 600_000,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const refreshed = await service.usableCredential();
  assert.equal(refreshed.connectToken, "environment-rotated-token-".padEnd(43, "r"));
  assert.equal(refreshed.endpointGrant, "refresh-env-grant-0123456789");
  assert.ok(refreshed.expiresAt > Date.now());
  assert.equal(calls, 1);

  // A subsequent connection owner that reads the authoritative store must see
  // the rotated value, not the stale process-level override.
  const persisted = await store.persistedRelayCredential();
  assert.equal(persisted.connectToken, refreshed.connectToken);
  assert.equal(persisted.endpointGrant, refreshed.endpointGrant);
  assert.equal(persisted.expiresAt, refreshed.expiresAt);
});

test("does not require a persistence API for an ephemeral draft refresh", async () => {
  const { store, identity } = refreshFixture({
    credential: { endpointGrant: "ephemeral-grant-0123456789" },
  });
  let updateCalled = false;
  store.updateRelayCredential = async () => {
    updateCalled = true;
    throw new Error("ephemeral refresh must not persist");
  };
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => new Response(JSON.stringify({
      code: 200,
      data: {
        connectToken: "ephemeral-token-".padEnd(43, "e"),
        expiresAt: Date.now() + 600_000,
      },
    }), { status: 200 }),
  });

  const result = await service.usableCredential({
    credential: { endpointGrant: "ephemeral-grant-0123456789" },
    persist: false,
  });
  assert.equal(result.connectToken, "ephemeral-token-".padEnd(43, "e"));
  assert.equal(result.endpointGrant, "ephemeral-grant-0123456789");
  assert.equal(updateCalled, false);
  assert.ok(identity.publicKey);
});

test("classifies refresh throttling and server failures as retryable", async () => {
  for (const [status, envelopeCode] of [[429, 429], [503, 503]]) {
    const { store } = refreshFixture({
      credential: {
        connectToken: "retry-token-".padEnd(43, "t"),
        expiresAt: Date.now() + 1_000,
        endpointGrant: "retry-grant-0123456789",
        grantExpiresAt: Date.now() + 86_400_000,
      },
    });
    const service = new RelayTokenService(store, { info() {} }, {
      fetch: async () => new Response(JSON.stringify({
        code: envelopeCode,
        msg: "temporary relay failure",
      }), {
        status,
        headers: { "retry-after": "2" },
      }),
    });
    await assert.rejects(
      service.usableCredential({ force: true }),
      (error) => {
        assert.equal(error.code, "RELAY_RETRYABLE");
        assert.equal(error.details.retryable, true);
        assert.equal(error.details.retryAfterMs, 2_000);
        return true;
      },
    );
  }
});

test("rejects a refresh response whose identity context does not match", async () => {
  const { store } = refreshFixture({
    credential: {
      connectToken: "context-token-".padEnd(43, "t"),
      expiresAt: Date.now() + 1_000,
      endpointGrant: "context-grant-0123456789",
      grantExpiresAt: Date.now() + 86_400_000,
    },
  });
  const service = new RelayTokenService(store, { info() {} }, {
    fetch: async () => new Response(JSON.stringify({
      code: 200,
      data: {
        connectToken: "context-new-token-".padEnd(43, "n"),
        expiresAt: Date.now() + 600_000,
        spaceId: "another-space",
      },
    }), { status: 200 }),
  });
  await assert.rejects(service.usableCredential({ force: true }), { code: "AUTH_CONTEXT_CHANGED" });
});

test("rejects missing or expired grant expiry metadata", async () => {
  for (const grantExpiresAt of [Date.now() - 1, "not-a-timestamp", Number.MAX_SAFE_INTEGER + 1]) {
    const { store } = refreshFixture({
      credential: {
        connectToken: "grant-expiry-token-".padEnd(43, "t"),
        expiresAt: Date.now() + 1_000,
        endpointGrant: "grant-expiry-0123456789",
        grantExpiresAt: Date.now() + 86_400_000,
      },
    });
    const service = new RelayTokenService(store, { info() {} }, {
      fetch: async () => new Response(JSON.stringify({
        code: 200,
        data: {
          connectToken: "grant-expiry-new-".padEnd(43, "n"),
          expiresAt: Date.now() + 600_000,
          grantExpiresAt,
        },
      }), { status: 200 }),
    });
    await assert.rejects(service.usableCredential({ force: true }), { code: "INVALID_MESSAGE" });
  }
});

test("applies the runtime Token Endpoint trust boundary", async () => {
  const cases = [
    ["http://relay.example.com/api/connect-tokens/refresh", "auth.refresh_invalid"],
    ["https://relay.example.com/api/connect-tokens/refresh?grant=secret", "auth.refresh_invalid"],
    ["https://user:password@relay.example.com/api/connect-tokens/refresh", "auth.refresh_invalid"],
  ];
  for (const [tokenEndpoint, code] of cases) {
    const { store } = refreshFixture({
      credential: {
        connectToken: "endpoint-token-".padEnd(43, "t"),
        expiresAt: Date.now() + 1_000,
        endpointGrant: "endpoint-grant-0123456789",
        grantExpiresAt: Date.now() + 86_400_000,
        tokenEndpoint,
      },
    });
    let fetched = false;
    const service = new RelayTokenService(store, { info() {} }, {
      fetch: async () => {
        fetched = true;
        return new Response();
      },
    });
    await assert.rejects(service.usableCredential({ force: true }), { code });
    assert.equal(fetched, false);
  }
});

function refreshFixture({ credential }) {
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = Buffer.from(pair.publicKey.export({ format: "der", type: "spki" }))
    .subarray(-32)
    .toString("base64url");
  const privateKey = Buffer.from(pair.privateKey.export({ format: "der", type: "pkcs8" }))
    .toString("base64url");
  const config = {
    relay: {
      url: "ws://127.0.0.1:8788/v1/connect",
      spaceId: "fixture-space",
      endpointId: "fixture-endpoint",
      endpointType: "bridge",
    },
  };
  const store = {
    get: () => structuredClone(config),
    endpointIdentity: async () => ({ publicKey, privateKey }),
    relayCredential: async () => ({ ...credential }),
  };
  return { store, identity: { publicKey, privateKey } };
}
