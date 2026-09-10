import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppServerClient } from '../server/app-server-client.js';
import { SharedAppServerTransport } from '../server/app-server-transport.js';

// Real Codex + MCP elicitation, no account/model call. A second client must
// never turn the desktop's delayed acceptance into an unsolicited decline.
if (process.argv[2] === 'mcp') {
  const server = new McpServer({ name: 'fixture', version: '1' });
  server.registerTool('ask', { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: JSON.stringify(await server.server.elicitInput({ message: 'Fixture choice', requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } } })) }] }));
  await server.connect(new StdioServerTransport());
} else {
  const dir = await fs.mkdtemp('/tmp/recodex-interaction-');
  await fs.mkdir(`${dir}/home`);
  const endpoint = `unix://${dir}/rpc.sock`;
  const proc = spawn(process.env.CODEX_TEST_BINARY || '/Applications/ChatGPT.app/Contents/Resources/codex', ['app-server', '--listen', endpoint], { env: { ...process.env, CODEX_HOME: `${dir}/home` }, stdio: 'ignore' });
  const exited = new Promise(resolve => proc.once('exit', resolve));
  const desktop = new SharedAppServerTransport(endpoint, { connectTimeoutMs: 1000 });
  desktop.on('closed', () => {});
  const pending = new Map(), timers = new Set(), approvals = [], resolved = [];
  let id = 0, desktopRequests = 0, responseDelay = 200;
  desktop.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.method && message.id !== undefined) {
      assert.equal(message.method, 'mcpServer/elicitation/request');
      desktopRequests++;
      const timer = setTimeout(() => {
        timers.delete(timer);
        desktop.send(JSON.stringify({ id: message.id, result: { action: 'accept', content: { ok: true } } }));
      }, responseDelay);
      timers.add(timer);
    } else if (pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timer);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    }
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`timeout: ${method}`)); }, 15000);
    pending.set(n, { resolve, reject, timer });
    desktop.send(JSON.stringify({ id: n, method, params }));
  });
  const relay = new AppServerClient({ get: () => ({ codex: { connectionMode: 'shared', appServerEndpoint: endpoint } }) }, { info() {}, warn() {}, error() {} });
  relay.on('approval', value => approvals.push(value));
  relay.on('interactionResolved', value => resolved.push(value));
  try {
    for (let attempt = 0;; attempt++) {
      try { await desktop.open(); break; }
      catch (error) { if (attempt > 40) throw error; await desktop.close(); await new Promise(r => setTimeout(r, 100)); }
    }
    await rpc('initialize', { clientInfo: { name: 'desktop_fixture', version: '1' }, capabilities: { experimentalApi: true } });
    desktop.send(JSON.stringify({ method: 'initialized', params: {} }));
    await relay.start();
    const { thread } = await rpc('thread/start', { cwd: dir, config: { 'mcp_servers.fixture': { command: process.execPath, args: [fileURLToPath(import.meta.url), 'mcp'] } } });
    await rpc('thread/inject_items', { threadId: thread.id, items: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fixture' }] }] });
    await relay.subscribeThread(thread.id);
    await rpc('mcpServerStatus/list', { threadId: thread.id });
    const result = await rpc('mcpServer/tool/call', { threadId: thread.id, server: 'fixture', tool: 'ask', arguments: {} });
    assert.deepEqual(JSON.parse(result.content[0].text), { action: 'accept', content: { ok: true } });
    assert.equal(desktopRequests, 1);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].kind, 'desktop');
    assert.equal(approvals[0].canRespond, false);
    for (let attempt = 0; resolved.length === 0 && attempt < 100; attempt++) await new Promise(r => setTimeout(r, 10));
    assert.equal(resolved.length, 1);
    assert.equal(relay.pendingInteractions(thread.id).length, 0);
    responseDelay = 1200;
    const second = rpc('mcpServer/tool/call', { threadId: thread.id, server: 'fixture', tool: 'ask', arguments: {} });
    for (let attempt = 0; approvals.length < 2 && attempt < 100; attempt++) await new Promise(r => setTimeout(r, 10));
    assert.equal(approvals.length, 2);
    await relay.stop(); await relay.start(); await relay.subscribeThread(thread.id);
    await new Promise(r => setTimeout(r, 100));
    const pendingReplayedAfterReconnect = relay.pendingInteractions(thread.id).length > 0;
    assert.equal(pendingReplayedAfterReconnect, true, 'Codex must replay unresolved requests after resubscribe');
    assert.notEqual(relay.pendingInteractions(thread.id)[0].approvalId, approvals[1].approvalId);
    assert.equal(JSON.parse((await second).content[0].text).action, 'accept');
    console.log(JSON.stringify({ realCodex: true, desktopAcceptancePreserved: true, relayObserved: true, resolvedOnBothClients: true, pendingReplayedAfterReconnect, modelRequests: 0 }));
  } finally {
    for (const timer of timers) clearTimeout(timer);
    for (const request of pending.values()) clearTimeout(request.timer);
    await relay.stop(); await desktop.close();
    proc.kill('SIGTERM'); await exited;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
