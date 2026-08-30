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
