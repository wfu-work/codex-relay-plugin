import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { EventEmitter } from "node:events";
import { DesktopBridge, extractRemoteControlResult, inspectRemoteControl, installOfficialStandalone, remoteControlPaths, runRemoteControl } from "../server/remote-control.js";

test("parses official Remote Control JSON and human output without exposing arbitrary text", () => {
  assert.deepEqual(extractRemoteControlResult('{"status":"running","websocket_url":"wss://example.invalid/session"}'), {
    state: "running", pairingCode: null, endpoint: "wss://example.invalid/session", message: '{"status":"running","websocket_url":"wss://example.invalid/session"}',
  });
  assert.equal(extractRemoteControlResult("Pairing code: ABCD-1234").pairingCode, "ABCD-1234");
  assert.equal(extractRemoteControlResult("token=do-not-publish\n").message, "token=[REDACTED]");
});

test("official detection distinguishes standalone CLI from desktop control socket", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "remote-control-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binary = path.join(root, "codex");
  await fs.writeFile(binary, "", { mode: 0o700 });
  const result = await inspectRemoteControl({ home: root, executable: binary, socketPath: path.join(root, "missing.sock"), run: async () => ({ stdout: "codex-cli 0.154.0", stderr: "" }) });
  assert.equal(result.official.installed, true);
  assert.equal(result.official.state, "available");
  assert.equal(result.official.attachable, false);
  assert.equal(result.bridge.attachable, false);
  assert.match(result.bridge.reason, /官方 Remote Control|授权|端点/);
});

test("official detection reports API-key mode as authorization-required without exposing the key", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "remote-auth-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binary = remoteControlPaths(root).executable;
  await fs.mkdir(path.dirname(binary), { recursive: true });
  await fs.writeFile(binary, "", { mode: 0o700 });
  const secret = "sk-test-do-not-leak";
  await fs.mkdir(path.join(root, ".codex"), { recursive: true });
  await fs.writeFile(path.join(root, ".codex", "auth.json"), JSON.stringify({ OPENAI_API_KEY: secret }));
  const result = await inspectRemoteControl({ home: root, executable: binary, socketPath: path.join(root, "missing.sock"), run: async () => ({ stdout: "codex-cli 0.154.0", stderr: "" }) });
  assert.equal(result.official.authMode, "api_key");
  assert.equal(result.official.state, "auth_required");
  assert.match(result.official.reason, /API Key/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});

test("Remote Control commands are explicit and fail safely when standalone is absent", async () => {
  const paths = remoteControlPaths("/tmp/remote-control-test-home");
  assert.match(paths.executable, /packages\/standalone\/current\/codex$/);
  await assert.rejects(runRemoteControl("start", { home: "/tmp/remote-control-test-home" }), { code: "REMOTE_CONTROL_UNAVAILABLE" });
});

test("maps the official API-key authentication limitation to an actionable error", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "remote-auth-run-"));
  const binary = remoteControlPaths(root).executable;
  const secret = "sk-run-do-not-leak";
  await fs.mkdir(path.dirname(binary), { recursive: true });
  await fs.writeFile(binary, "", { mode: 0o700 });
  await fs.mkdir(path.join(root, ".codex"), { recursive: true });
  await fs.writeFile(path.join(root, ".codex", "auth.json"), JSON.stringify({ OPENAI_API_KEY: secret }));
  try {
    await assert.rejects(runRemoteControl("start", { home: root, executable: binary, run: async () => { throw new Error("must not invoke official CLI in API-key mode"); } }), { code: "REMOTE_CONTROL_AUTH_REQUIRED", message: /ChatGPT 账号授权/ });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("official installation is fixed to the official URL and reports completion", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "remote-install-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = remoteControlPaths(root).executable;
  let called = false;
  const fakeSpawn = () => {
    called = true;
    const child = new EventEmitter();
    child.stdin = { end: async () => { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, "", { mode: 0o700 }); setImmediate(() => child.emit("exit", 0, null)); } };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    return child;
  };
  const result = await installOfficialStandalone({ home: root, proxy: false, fetchImpl: async url => ({ ok: true, text: async () => `#!/bin/sh\necho official ${url}` }), spawnImpl: fakeSpawn });
  assert.equal(called, true);
  assert.equal(result.installed, true);
  await assert.rejects(installOfficialStandalone({ home: root, installerUrl: "https://example.invalid/install.sh", fetchImpl: async () => ({}) }), { code: "REMOTE_CONTROL_INSTALL_URL_INVALID" });
});

test("desktop bridge only connects an owned local endpoint", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-bridge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const socket = path.join(root, "bridge.sock");
  const server = await new Promise(resolve => {
    const value = net.createServer().listen(socket, () => resolve(value));
  });
  t.after(() => server.close());
  const transport = { on() {}, async open() {}, async close() {} };
  const bridge = new DesktopBridge(`unix://${socket}`, { transportFactory: () => transport });
  assert.equal((await bridge.inspect()).attachable, true);
  assert.equal((await bridge.connect()).state, "ready");
  await bridge.close();
});
