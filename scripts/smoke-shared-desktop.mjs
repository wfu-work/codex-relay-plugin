import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import readline from "node:readline";
import net from "node:net";
import { activate, backendStatus, defaultManifest, desktopToolDefinition, digest, ownedRuntime, readJson, rollback, tomlValue, waitReady, writePrivate } from "../server/shared-backend-manager.js";
import { AppServerClient } from "../server/app-server-client.js";

// Real launchd, real Codex, real MCP startup; isolated home/config/cache only.
// No desktop automation, account files, or model requests are involved.
if (process.platform !== "darwin") throw new Error("This smoke test requires macOS launchd");
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = await fs.mkdtemp("/tmp/recodex-desktop-");
const production = path.join(project, "plugins/codex-relay-plugin");
const home = path.join(root, "home");
await fs.mkdir(home);
const configText = 'approval_policy = "never"\nsandbox_mode = "read-only"\n';
await fs.writeFile(path.join(home, "config.toml"), configText);
await fs.copyFile(path.join(production, "server/shared-backend-cli.js"), path.join(root, "shared-backend-cli.js"));
await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
await fs.cp(production, path.join(root, "plugin"), { recursive: true });
await fs.cp(production, path.join(root, "installed-plugin"), { recursive: true });
const relayConfig = path.join(root, "relay/config.json");
await writePrivate(relayConfig, JSON.stringify({ relay: { spaceId: "smoke-space" }, codex: { connectionMode: "managed" }, allowedProjects: [home], readOnly: true }));
const manifest = defaultManifest(root, { codexHome: home, relayConfig, relayAgent: path.join(root, "installed-plugin/server/agent-cli.js") });
manifest.label = `com.recodex.smoke.${process.pid}`;
manifest.launchAgent = path.join(root, "service.plist");
manifest.binaryHash = await digest(manifest.binary);
const manifestPath = path.join(root, "manifest.json");
await writePrivate(manifestPath, JSON.stringify(manifest));
const logger = { info() {}, warn() {}, error() {} };
const client = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: manifest.endpoint, defaultWorkingDirectory: home } }) }, logger, { reconnectBaseMs: 100, reconnectMaxMs: 1000 });
let desktop;
let nativeHost;
const observations = {};
async function startNativeHost(marker) {
  const pipe = path.join(root, `${marker}.sock`);
  const clients = new Set();
  const server = net.createServer(socket => {
    clients.add(socket); socket.once("close", () => clients.delete(socket)); socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
        const length = buffer.readUInt32LE(0);
        const message = JSON.parse(buffer.subarray(4, 4 + length)); buffer = buffer.subarray(4 + length);
        const result = message.method === "tools/list" ? { tools: [{ name: "session_marker", namespace: "codex_app", description: "Isolated native pipe fixture", inputSchema: { type: "object", properties: {} } }] } : { success: true, contentItems: [{ type: "inputText", text: marker }] };
        const data = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
        const frame = Buffer.alloc(4 + data.length); frame.writeUInt32LE(data.length, 0); data.copy(frame, 4); socket.write(frame);
      }
    });
  });
  await new Promise(resolve => server.listen(pipe, resolve));
  return { pipe, stop: async () => { for (const socket of clients) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
async function startProxy(pipe) {
  const definition = await desktopToolDefinition(manifest);
  definition.env.CODEX_APP_TOOLS_PIPE_PATH = pipe;
  const override = `mcp_servers.codex_app=${tomlValue(definition)}`;
  const child = spawn(process.execPath, [path.join(root, "shared-backend-cli.js"), "proxy", "--manifest", manifestPath, "-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled", "-c", override], { env: { ...process.env, CODEX_HOME: home }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let next = 0;
  child.stderr.resume();
  child.stdin.on("error", () => {});
  readline.createInterface({ input: child.stdout }).on("line", line => {
    const message = JSON.parse(line), request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  const exited = new Promise(resolve => child.once("exit", code => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("proxy exited")); }
    pending.clear(); resolve(code);
  }));
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  const init = async () => { await request("initialize", { clientInfo: { name: "desktop_stdio_smoke", version: "1.0" }, capabilities: { experimentalApi: true } }); child.stdin.write('{"method":"initialized","params":{}}\n'); };
  return { child, request, init, exited, stop: async () => { child.stdin.end(); const timer = setTimeout(() => child.kill("SIGTERM"), 2000); await exited; clearTimeout(timer); } };
}
try {
  const activated = await activate(manifest);
  const firstPid = activated.pid;
  observations.launchdStarted = firstPid > 0;
  await client.start();
  const { thread: offlineThread } = await client.createThread({ cwd: home });
  await client.request("thread/inject_items", { threadId: offlineThread.id, items: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Created while desktop is offline" }] }] });
  await client.request("mcpServerStatus/list", { threadId: offlineThread.id });
  nativeHost = await startNativeHost("FIRST_DESKTOP");
  desktop = await startProxy(nativeHost.pipe);
  await desktop.init();
  await desktop.request("thread/resume", { threadId: offlineThread.id });
  await desktop.request("mcpServerStatus/list", { threadId: offlineThread.id });
  const offlineTools = await desktop.request("mcpServer/tool/call", { threadId: offlineThread.id, server: "codex_app", tool: "session_marker", arguments: {}, _meta: { threadId: offlineThread.id } });
  assert.ok(offlineTools.content.some(item => item.text === "FIRST_DESKTOP"));
  observations.offlineCreatedThreadToolsRecovered = true;
  const { thread } = await desktop.request("thread/start", { cwd: home, approvalPolicy: "never", sandbox: "read-only" });
  await desktop.request("thread/inject_items", { threadId: thread.id, items: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Shared desktop transport fixture" }] }] });
  const callMarker = () => desktop.request("mcpServer/tool/call", { threadId: thread.id, server: "codex_app", tool: "session_marker", arguments: {}, _meta: { threadId: thread.id } });
  const inventory = await desktop.request("mcpServerStatus/list", { threadId: thread.id });
  assert.ok(inventory.data?.some(server => server.name === "codex_app" && server.tools.session_marker));
  assert.ok((await callMarker()).content.some(item => item.text === "FIRST_DESKTOP"));
  observations.desktopMcpConfigApplied = true;
  await client.subscribeThread(thread.id);
  await desktop.request("mcpServerStatus/list", { threadId: thread.id });
  assert.ok((await callMarker()).content.some(item => item.text === "FIRST_DESKTOP"));
  await desktop.stop();
  assert.equal((await backendStatus(manifest)).pid, firstPid);
  observations.desktopClosePreservesBackend = true;
  await nativeHost.stop(); nativeHost = await startNativeHost("REOPENED_DESKTOP");
  desktop = await startProxy(nativeHost.pipe);
  await desktop.init();
  await desktop.request("thread/resume", { threadId: thread.id });
  const reopened = await callMarker();
  observations.loadedThreadMcpRefresh = reopened.content.some(item => item.text === "REOPENED_DESKTOP");
  assert.equal(observations.loadedThreadMcpRefresh, true);
  // A restart of the actual backend exercises launchd recovery and Relay resubscription.
  process.kill(firstPid, "SIGKILL");
  await desktop.exited;
  const deadline = Date.now() + 30000;
  while ((await ownedRuntime(manifest))?.pid === firstPid || !(await backendStatus(manifest)).ready) {
    if (Date.now() > deadline) throw new Error("launchd recovery timed out");
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const recovered = await waitReady(manifest);
  assert.notEqual(recovered.pid, firstPid);
  observations.launchdRestartedNewPid = true;
  await nativeHost.stop(); nativeHost = await startNativeHost("AFTER_RESTART");
  desktop = await startProxy(nativeHost.pipe);
  await desktop.init();
  await desktop.request("thread/resume", { threadId: thread.id });
  await desktop.request("mcpServerStatus/list", { threadId: thread.id });
  assert.ok((await callMarker()).content.some(item => item.text === "AFTER_RESTART"));
  observations.persistedThreadAndMcpRestored = true;
  await desktop.stop(); desktop = null;
  await client.stop();
  await nativeHost?.stop(); nativeHost = null;
  const changed = await readJson(relayConfig);
  changed.relay.spaceId = "edited-after-switch";
  await writePrivate(relayConfig, JSON.stringify(changed));
  await rollback(manifest);
  assert.equal((await backendStatus(manifest)).pid, null);
  const restored = await readJson(relayConfig);
  assert.equal(restored.codex.connectionMode, "managed");
  assert.equal(restored.relay.spaceId, "edited-after-switch");
  assert.equal(await fs.readFile(path.join(home, "config.toml"), "utf8"), configText);
  assert.ok((await fs.readdir(path.join(home, "sessions"))).length > 0);
  observations.rollbackPreservesNewHistoryAndSettings = true;
  console.log(JSON.stringify({ passed: true, ...observations }, null, 2));
} finally {
  await desktop?.stop().catch(() => {});
  await nativeHost?.stop().catch(() => {});
  await client.stop();
  if (await readJson(path.join(root, "activation.json"), null)) await rollback(manifest, { failedActivation: true }).catch(() => {});
  await promisify(execFile)("/bin/launchctl", ["bootout", `gui/${process.getuid()}/${manifest.label}`]).catch(() => {});
  if (!await ownedRuntime(manifest)) await fs.rm(root, { recursive: true, force: true });
  else console.error(`Smoke cleanup needs attention: ${root}`);
}
