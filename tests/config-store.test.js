import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConfigStore, defaultConfig, validateConfig } from "../server/config-store.js";

test("configuration persists with owner-only permissions", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-config-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  const updated = await store.update({
    relay: { url: "ws://127.0.0.1:8787/ws", roomId: `test-${process.pid}` },
    allowedProjects: [path.resolve(configDir)],
  });

  assert.equal(updated.relay.roomId, `test-${process.pid}`);
  assert.equal(updated.relay.tokenConfigured, false);
  const stat = await fs.stat(path.join(configDir, "config.json"));
  assert.equal(stat.mode & 0o777, 0o600);

  const reloaded = new ConfigStore({ configDir });
  await reloaded.load();
  assert.equal(reloaded.get().relay.url, "ws://127.0.0.1:8787/ws");
});

test("relay token uses the cross-platform file store and is returned to the local dashboard", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-token-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();

  const updated = await store.update({ relay: { roomId: "token-room" } }, "relay-token-value");
  assert.equal(updated.relay.token, undefined);
  assert.equal(updated.relay.tokenConfigured, true);

  const secretStat = await fs.stat(path.join(configDir, "secrets.json"));
  assert.equal(secretStat.mode & 0o777, 0o600);
  const reloaded = new ConfigStore({ configDir });
  await reloaded.load();
  assert.equal((await reloaded.publicConfig()).relay.token, undefined);
  assert.equal((await reloaded.publicConfig({ includeToken: true })).relay.token, "relay-token-value");
});

test("public relays require TLS and URL credentials are rejected", () => {
  const base = defaultConfig();
  base.relay.url = "ws://relay.example.com/ws";
  base.relay.roomId = "room";
  assert.throws(() => validateConfig(base), /wss:\/\//);
  assert.doesNotThrow(() => validateConfig({ ...base, relay: { ...base.relay, url: "wss://relay.example.com/ws" } }));
  assert.throws(
    () => validateConfig({ ...base, relay: { ...base.relay, url: "wss://user:password@relay.example.com/ws" } }),
    /用户名或密码/,
  );
});

test("configuration rejects type-confused permissions and relative working directories", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-config-invalid-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const store = new ConfigStore({ configDir });
  await store.load();
  await assert.rejects(() => store.update({ permissions: { sendMessages: "false" } }), /必须是布尔值/);
  await assert.rejects(() => store.update({ codex: { defaultWorkingDirectory: "relative/path" } }), /必须是绝对路径/);
  await assert.rejects(() => store.update({}, { token: "not-a-string" }), /Relay Token/);
});
