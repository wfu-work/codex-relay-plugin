import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { WebSocketServer } from "ws";
import fs from "node:fs/promises";
import net from "node:net";
import { bindDesktopPipe, desktopInvocation, proxyDesktop, withDesktopConfig } from "../server/desktop-proxy.js";

test("real desktop launch flags preserve host tools, TOML values and explicit per-thread overrides", () => {
  const config = desktopInvocation(["-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled", "-c", 'mcp_servers.codex_app={command="/path with space/tool",enabled=true,env={PIPE="/tmp/desktop.sock"}}']);
  assert.equal(config["features.code_mode_host"], true);
  assert.equal(config["mcp_servers.codex_app"].env.PIPE, "/tmp/desktop.sock");
  for (const method of ["thread/start", "thread/resume", "thread/fork"]) {
    const message = { id: 1, method, params: { config: { "mcp_servers.codex_app": { enabled: false }, model: "chosen" } } };
    const forwarded = withDesktopConfig(message, config);
    assert.equal(forwarded.params.config["mcp_servers.codex_app"].enabled, false);
    assert.equal(forwarded.params.config.model, "chosen");
    assert.equal(forwarded.params.config["features.code_mode_host"], true);
    assert.equal(message.params.config["features.code_mode_host"], undefined);
  }
  const turn = { id: 2, method: "turn/start", params: { threadId: "same" } };
  assert.equal(withDesktopConfig(turn, config), turn);
  assert.deepEqual(desktopInvocation(["app-server", "--config=model=test", "--enable", "one", "--disable", "two"]), { model: "test", "features.one": true, "features.two": false });
});

test("unknown desktop launch modes fail closed; read-only CLI commands pass through", () => {
  assert.equal(desktopInvocation(["--version"]), null);
  assert.equal(desktopInvocation(["app-server", "generate-ts", "--out", "/tmp/schema"]), null);
  for (const args of [["app-server", "--new-flag"], ["app-server", "daemon", "start"], ["app-server", "-c"], ["app-server", "--listen", "stdio://"]]) assert.throws(() => desktopInvocation(args));
});

async function fixture(t) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  const input = new PassThrough(), output = new PassThrough();
  t.after(() => input.end());
  let received = "";
  output.on("data", data => { received += data; });
  return { server, input, output, endpoint: `ws://127.0.0.1:${server.address().port}`, received: () => received };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
async function until(check) { const end = Date.now() + 3000; while (!check()) { if (Date.now() > end) throw new Error("timeout"); await tick(); } }

test("proxy preserves RPC ids, notifications and approvals; stdin EOF closes only its socket", async t => {
  const f = await fixture(t);
  const messages = [];
  f.server.on("connection", socket => socket.on("message", raw => { messages.push(JSON.parse(raw)); socket.send(raw); }));
  const done = proxyDesktop({ ...f, config: { "mcp_servers.codex_app": { command: "/tool" } } });
  f.input.write('{"id":"init:1","method":"initialize","params":{}}\n');
  f.input.write('{"method":"initialized","params":{}}\n');
  f.input.write('{"id":4,"method":"thread/start","params":{}}\n');
  f.input.write('{"id":99,"result":{"decision":"accept"}}\n');
  await until(() => f.received().split("\n").length === 5);
  assert.equal(messages[0].id, "init:1");
  assert.equal(messages[2].params.config["mcp_servers.codex_app"].command, "/tool");
  assert.deepEqual(messages[3], { id: 99, result: { decision: "accept" } });
  f.input.end();
  await done;
  assert.equal(f.server.address().port > 0, true);
});

test("backend loss fails the desktop pipe without replaying uncertain writes", async t => {
  const f = await fixture(t);
  let requests = 0;
  f.server.on("connection", socket => socket.on("message", () => { requests++; socket.terminate(); }));
  const done = proxyDesktop({ ...f, config: {} });
  f.input.write('{"id":1,"method":"turn/start","params":{}}\n');
  await assert.rejects(done, /关闭|closed|reset/);
  assert.equal(requests, 1);
});

test("stable desktop pipe changes only after the prior desktop closes", async t => {
  if (process.platform === "win32") return t.skip("Unix sockets");
  const root = await fs.mkdtemp("/tmp/shared-pipe-");
  const first = net.createServer(socket => socket.end()), second = net.createServer(socket => socket.end());
  t.after(async () => {
    await Promise.all([first, second].map(server => new Promise(resolve => server.close(resolve))));
    await fs.rm(root, { recursive: true, force: true });
  });
  await new Promise(resolve => first.listen(`${root}/first.sock`, resolve));
  await new Promise(resolve => second.listen(`${root}/second.sock`, resolve));
  const config = name => ({ "mcp_servers.codex_app": { enabled: true, env: { CODEX_APP_TOOLS_PIPE_PATH: `${root}/${name}.sock` } } });
  const normalized = await bindDesktopPipe(root, config("first"));
  assert.equal(normalized["mcp_servers.codex_app"].env.CODEX_APP_TOOLS_PIPE_PATH, `${root}/desktop-tools.sock`);
  await assert.rejects(bindDesktopPipe(root, config("second")), /已有桌面/);
  await new Promise(resolve => first.close(resolve));
  await bindDesktopPipe(root, config("second"));
  assert.equal(await fs.readlink(`${root}/desktop-tools.sock`), `${root}/second.sock`);
  await assert.rejects(bindDesktopPipe(root, {}), /未提供/);
  await fs.writeFile(`${root}/plain.sock`, "regular file");
  await assert.rejects(bindDesktopPipe(root, config("plain")), /无效/);
});
