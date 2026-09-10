import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { AppServerClient } from "../server/app-server-client.js";

// This opt-in integration test needs a real CLI, but no credentials or model
// requests. Neither the user's CODEX_HOME nor installed Relay is modified.
const binary = process.argv[2] || "codex";
const root = await mkdtemp(path.join(process.platform === "win32" ? os.tmpdir() : "/tmp", "recodex-shared-"));
const home = path.join(root, "home");
const cwd = path.join(root, "project");
await mkdir(home); await mkdir(cwd);
await writeFile(path.join(home, "config.toml"), 'approval_policy = "never"\nsandbox_mode = "read-only"\n');
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const endpoint = process.platform === "win32" ? `ws://127.0.0.1:${port}` : `unix://${path.join(root, "server.sock")}`;
const backend = spawn(binary, ["app-server", "--listen", endpoint], { cwd, env: { ...process.env, CODEX_HOME: home }, stdio: "ignore" });
let spawnError;
backend.on("error", error => { spawnError = error; });
const makeClient = () => new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: endpoint, executable: "/unused-in-shared-mode", defaultWorkingDirectory: cwd } }) }, { info() {}, warn() {}, error() {} }, { connectTimeoutMs: 500 });
const a = makeClient(), b = makeClient();
try {
  const deadline = Date.now() + 10000;
  while (true) {
    if (spawnError) throw spawnError;
    try { await a.checkAvailability(); break; }
    catch (error) { if (Date.now() > deadline) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  await Promise.all([a.start(), b.start()]);
  assert.equal(a.status().ownsProcess, false);
  const { thread } = await a.createThread({ cwd });
  // Empty threads have no rollout yet. Seed history through the documented
  // injection API without starting a turn or making a model request.
  await a.request("thread/inject_items", { threadId: thread.id, items: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Isolated transport smoke fixture." }] },
  ] });
  await b.subscribeThread(thread.id);
  const events = [];
  b.on("notification", (method, params) => events.push({ method, params }));
  await a.stop();
  assert.equal(backend.exitCode, null);
  assert.equal((await b.readThreadStatus(thread.id)).thread.id, thread.id);
  await a.start();
  await a.subscribeThread(thread.id);
  await a.request("thread/name/set", { threadId: thread.id, name: "Shared connection smoke test" });
  const eventDeadline = Date.now() + 3000;
  while (!events.some(e => e.method === "thread/name/updated") && Date.now() < eventDeadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(events.some(e => e.method === "thread/name/updated"));
  console.log(JSON.stringify({ passed: true, transport: a.status().transport, version: a.status().version, sharedProcessSurvivedClientStop: backend.exitCode === null, subscriptionsRestored: a.status().subscribedThreads === 1 }));
} finally {
  await Promise.allSettled([a.stop(), b.stop()]);
  if (backend.pid && backend.exitCode === null && backend.signalCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => backend.kill("SIGKILL"), 3000);
    backend.once("exit", () => { clearTimeout(timer); resolve(); });
    backend.kill("SIGTERM");
  });
  await rm(root, { recursive: true, force: true });
}
