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
