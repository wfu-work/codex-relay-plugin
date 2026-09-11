import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { verifyDesktopCompatibility, readDesktopCompatibility } from '../server/desktop-compatibility.js';

async function fixture(t) {
  const configDir = await fs.mkdtemp('/tmp/desktop-proof-');
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const environment = { service: { configStore: { configDir } } };
  let target = { pid: 123, appPath: '/fixture/Codex.app', pipe: '/private/pipe', fingerprint: 'generation-one' };
  let probes = 0;
  const options = { platform: 'darwin', discover: async () => target, verifyRuntime: async () => ({ verified: true, teamId: '2DC432GLL2', identifier: 'node' }), probe: async () => { probes++; return { code: 'passed', toolCount: 24 }; } };
  return { environment, options, configDir, probes: () => probes, setTarget: next => { target = next; } };
}

test('a valid official signature never substitutes for a successful desktop handshake', async t => {
  const f = await fixture(t);
  const result = await verifyDesktopCompatibility(f.environment, { ...f.options, probe: async () => ({ code: 'handshake_failed', raw: 'must-not-leak' }) });
  assert.equal(result.state, 'blocked');
  assert.equal(result.runtime.verified, true);
  const visible = await readDesktopCompatibility(f.environment, f.options);
  assert.equal(visible.state, 'blocked');
  assert.equal(visible.signatureVerified, true);
  assert.match(visible.message, /外部启动方式不兼容/);
  assert.equal(JSON.stringify(visible).includes('must-not-leak'), false);
  assert.equal(JSON.stringify(result).includes('/private/pipe'), false);
});

test('successful catalog proof expires after a desktop restart, install change or ten minutes', async t => {
  const f = await fixture(t);
  const result = await verifyDesktopCompatibility(f.environment, f.options);
  assert.equal(result.scope, 'isolated_shared_backend_tool_catalog');
  assert.equal(result.modelRequests, 0);
  assert.equal((await readDesktopCompatibility(f.environment, f.options)).state, 'passed');
  assert.equal((await readDesktopCompatibility(f.environment, { ...f.options, now: Date.parse(result.expiresAt) + 1 })).state, 'stale');
  f.setTarget({ pid: 456, pipe: '/new', fingerprint: 'generation-two' });
  assert.equal((await readDesktopCompatibility(f.environment, f.options)).state, 'stale');
});

test('missing desktop, ambiguous target and invalid signature cannot launch a probe', async t => {
  const f = await fixture(t);
  f.setTarget(null);
  assert.equal((await verifyDesktopCompatibility(f.environment, f.options)).code, 'no_desktop');
  f.setTarget({ pid: 123, pipe: null });
  assert.equal((await verifyDesktopCompatibility(f.environment, f.options)).code, 'no_pipe');
  f.setTarget({ pid: 123, pipe: '/private/pipe', fingerprint: 'one' });
  assert.equal((await verifyDesktopCompatibility(f.environment, { ...f.options, verifyRuntime: async () => { throw Error('wrong team'); } })).code, 'invalid_signature');
  assert.equal(f.probes(), 0);
});

test('desktop changing during probe invalidates a successful handshake', async t => {
  const f = await fixture(t);
  const result = await verifyDesktopCompatibility(f.environment, { ...f.options, probe: async () => { f.setTarget(null); return { code: 'passed', toolCount: 24 }; } });
  assert.equal(result.code, 'changed');
  assert.equal(result.state, 'blocked');
});

test('cancellation propagates to the preparation worker without publishing a successful proof', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyDesktopCompatibility(f.environment, { ...f.options, probe: async () => { throw Object.assign(Error('cancelled'), { code: 'PREPARATION_CANCELLED' }); } }), { code: 'PREPARATION_CANCELLED' });
  assert.equal(await readDesktopCompatibility(f.environment, f.options), null);
});

test('errors are bounded and incomplete catalogs cannot enable shared mode', async t => {
  const f = await fixture(t);
  const result = await verifyDesktopCompatibility(f.environment, { ...f.options, probe: async () => { throw Error('api_key=private-output'); } });
  assert.equal(result.code, 'failed');
  assert.equal(JSON.stringify(result).includes('private-output'), false);
  const partial = await verifyDesktopCompatibility(f.environment, { ...f.options, probe: async () => ({ code: 'incomplete_catalog', toolCount: 2 }) });
  assert.equal(partial.state, 'blocked');
});

test('a missing tool socket does not skip signature verification or report it as invalid', async t => {
  const f = await fixture(t);
  f.setTarget({ pid: 123, appPath: '/fixture/Codex.app', pipe: null, fingerprint: 'no-socket' });
  const result = await verifyDesktopCompatibility(f.environment, f.options);
  assert.equal(result.code, 'no_pipe');
  assert.equal(result.runtime.verified, true);
  assert.equal(f.probes(), 0);
  const visible = await readDesktopCompatibility(f.environment, f.options);
  assert.equal(visible.signatureState, 'passed');
  assert.equal(visible.state, 'blocked');
});

test('discovery recognizes the selected shared proxy, without accepting another package', async t => {
  const { default: net } = await import('node:net');
  const { default: path } = await import('node:path');
  const { desktopTarget } = await import('../server/desktop-compatibility.js');
  const { writePrivate } = await import('../server/shared-backend-manager.js');
  const f = await fixture(t);
  const root = path.join(f.configDir, 'migration/packages/abcd1234');
  const appPath = path.join(f.configDir, 'Codex.app');
  const manifest = { root, endpoint: `unix://${root}/rpc.sock`, desktopApp: appPath, codexHome: f.configDir, relayConfig: path.join(f.configDir, 'config.json') };
  await writePrivate(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  for (const file of ['codex', 'cua_node/bin/node', 'plugins/openai-bundled/plugins/codex-app-tools/server.mjs', 'plugins/openai-bundled/plugins/codex-app-tools/desktop-mcp.json']) await writePrivate(path.join(appPath, 'Contents/Resources', file), 'fixture');
  const pipe = path.join(f.configDir, 'tools.sock');
  const socket = net.createServer(); await new Promise(resolve => socket.listen(pipe, resolve));
  t.after(() => new Promise(resolve => socket.close(resolve)));
  let selectedRoot = root;
  const env = { ...f.environment, codexHome: f.configDir, inspectProcesses: async () => ({ state: 'ok', items: [{ kind: 'desktop', scope: 'same', pid: 123, appPath }] }), exec: async (_cmd, args) => ({ stdout: args[0] === '-axo' ? `456 123 /usr/bin/node ${selectedRoot}/shared-backend-cli.js proxy --manifest ${selectedRoot}/manifest.json app-server -c mcp_servers.codex_app={"env"={"CODEX_APP_TOOLS_PIPE_PATH"="${pipe}"}}` : 'identity' }) };
  env.service.configStore.get = () => ({ codex: { connectionMode: 'shared', appServerEndpoint: manifest.endpoint } });
  const target = await desktopTarget(env);
  assert.equal(target.pipe, pipe);
  assert.equal(target.connection, 'shared_proxy');
  assert.equal(target.endpoint, manifest.endpoint);
  selectedRoot += '-old';
  assert.equal((await desktopTarget(env)).pipe, null);
});

test('shared tool inspection only reads an existing task and closes its observer connection', async () => {
  const { probeSharedDesktopTools } = await import('../server/desktop-compatibility.js');
  const calls = [];
  const client = { start: async () => {}, stop: async () => calls.push('close'), request: async (method, params) => {
    calls.push(method);
    if (method === 'thread/loaded/list') return { data: ['existing-task'] };
    assert.equal(params.threadId, 'existing-task');
    assert.equal(params.detail, 'toolsAndAuthOnly');
    return { data: [{ name: 'codex_app', tools: { list_threads: {}, open_in_codex: {}, send_message_to_thread: {} } }] };
  } };
  const result = await probeSharedDesktopTools({ endpoint: 'unix:///tmp/rpc.sock', runtimeIdentity: 'live' }, { createClient: () => client });
  assert.equal(result.code, 'shared_passed');
  assert.deepEqual(calls, ['thread/loaded/list', 'mcpServerStatus/list', 'close']);
  client.request = async () => { throw Object.assign(Error('timeout'), { code: 'APP_SERVER_TIMEOUT' }); };
  assert.equal((await probeSharedDesktopTools({ endpoint: 'unix:///tmp/rpc.sock', runtimeIdentity: 'live' }, { createClient: () => client })).code, 'shared_timeout');
  assert.equal(calls.at(-1), 'close');
});

test('legacy shared service is diagnosed before a global MCP inventory can time out', async () => {
  const { probeSharedDesktopTools } = await import('../server/desktop-compatibility.js');
  const result = await probeSharedDesktopTools({ serviceRuntime: 'legacy' }, { createClient: () => { throw Error('must not connect'); } });
  assert.equal(result.code, 'shared_runtime_restart_required');
});

test('shared inventory follows pagination and does not mistake other MCP tools for desktop tools', async () => {
  const { probeSharedDesktopTools } = await import('../server/desktop-compatibility.js');
  const calls = [];
  const client = { start: async () => {}, stop: async () => {}, request: async (method, params) => {
    if (method === 'thread/loaded/list') return { data: ['existing-task'] };
    calls.push(params);
    return params.cursor ? { data: [{ name: 'codex_app', runtimeStatus: 'connected', tools: { list_threads: {}, open_in_codex: {}, send_message_to_thread: {} } }] } : { data: [{ name: 'other' }], nextCursor: 'next' };
  } };
  const target = { endpoint: 'unix:///tmp/rpc.sock', runtimeIdentity: 'live' };
  assert.equal((await probeSharedDesktopTools(target, { createClient: () => client })).code, 'shared_passed');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, 'next');
  client.request = async method => method === 'thread/loaded/list' ? { data: ['existing-task'] } : { data: [], nextCursor: 'loop' };
  assert.equal((await probeSharedDesktopTools(target, { createClient: () => client })).code, 'shared_failed');
});
