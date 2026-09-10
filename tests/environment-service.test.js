import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EnvironmentService, inspectExecutable, migrationView } from '../server/environment-service.js';
import { environmentIsStale, describeEnvironmentError } from '../web/src/lib/environment.js';

const exec = promisify(execFile);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-environment-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'codex');
  await fs.writeFile(executable, '#!/bin/sh\nprintf "codex-cli 0.153.4\\n"\n', { mode: 0o700 });
  const config = { codex: { executable: 'codex', connectionMode: 'managed' } };
  let status = { state: 'error', connectionMode: 'managed', lastError: 'spawn codex ENOENT' };
  let updates = 0;
  const service = {
    configStore: { configDir: root, get: () => structuredClone(config) },
    appServer: { status: () => status },
    status: async () => ({ appServer: status, relay: { state: 'connected' }, connector: { startedAt: new Date().toISOString() } }),
    updateConfig: async patch => { updates++; Object.assign(config.codex, patch.codex); },
  };
  const run = async (command, args, options) => {
    if (command === '/bin/ps') {
      if (args[0] === '-axo') return { stdout: '123 1 /app/codex app-server -c api_key=secret-fixture\n' };
      return { stdout: `codex app-server CODEX_HOME=${root} API_KEY=secret-fixture` };
    }
    return exec(command, args, options);
  };
  const inspector = new EnvironmentService(service, { env: { PATH: '/no-such-bin', CODEX_CLI_PATH: executable, CODEX_HOME: root }, platform: 'linux', sharedRoot: path.join(root, 'shared'), pluginRoot: root, exec: run });
  return { root, executable, config, service, inspector, updates: () => updates, setStatus: value => { status = value; } };
}

test('minimal launchd PATH detects a verified absolute replacement without changing config', async t => {
  const f = await fixture(t);
  const result = await f.inspector.inspect();
  assert.equal(result.executable.state, 'error');
  assert.equal(result.executable.candidate.path, f.executable);
  assert.equal(result.actions.repair.enabled, true);
  assert.equal(f.updates(), 0);
  assert.equal(f.config.codex.executable, 'codex');
  assert.equal(result.relay.state, 'connected');
  assert.equal(result.sharing.state, 'not_enabled');
  assert.equal(result.actions.migrate.enabled, false);
  assert.equal(JSON.stringify(result).includes('secret-fixture'), false);
  assert.equal(result.processes.items[0].scope, 'same');
});

test('repairs only the verified candidate, preserving other configuration fields', async t => {
  const f = await fixture(t);
  f.config.codex.defaultWorkingDirectory = '/keep';
  await assert.rejects(f.inspector.repairExecutable({ configured: 'codex', candidate: '/bin/sh' }), { code: 'ENVIRONMENT_CHANGED' });
  assert.equal(f.updates(), 0);
  const result = await f.inspector.repairExecutable({ configured: 'codex', candidate: f.executable });
  assert.equal(result.saved, true);
  assert.equal(f.config.codex.executable, f.executable);
  assert.equal(f.config.codex.defaultWorkingDirectory, '/keep');
  assert.equal(result.environment.executable.state, 'ok');
  assert.equal(result.environment.actions.repair.enabled, false);
});

test('ready or shared backends cannot be restarted as a side effect of path repair', async t => {
  const f = await fixture(t);
  for (const status of [{ state: 'ready', connectionMode: 'managed' }, { state: 'error', connectionMode: 'shared' }]) {
    f.setStatus(status);
    await assert.rejects(f.inspector.repairExecutable({ configured: 'codex', candidate: f.executable }), { code: 'REPAIR_NOT_AVAILABLE' });
  }
  assert.equal(f.updates(), 0);
});

test('saving a valid path does not claim that a failed reconnect succeeded', async t => {
  const f = await fixture(t);
  f.service.updateConfig = async patch => { Object.assign(f.config.codex, patch.codex); throw new Error('network failed'); };
  const result = await f.inspector.repairExecutable({ configured: 'codex', candidate: f.executable });
  assert.equal(result.saved, true);
  assert.ok(result.connectionError);
  assert.equal(result.environment.backend.state, 'error');
});

test('a changed configuration during diagnosis is not overwritten', async t => {
  const f = await fixture(t);
  const original = f.service.status;
  f.service.status = async () => { f.config.codex.executable = '/new-user-choice'; return original(); };
  await assert.rejects(f.inspector.repairExecutable({ configured: 'codex', candidate: f.executable }), { code: 'ENVIRONMENT_CHANGED' });
  assert.equal(f.updates(), 0);
});

test('rejects programs that do not identify as Codex and handles missing installations', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.executable, '#!/bin/sh\nprintf "not codex\\n"\n', { mode: 0o700 });
  const result = await inspectExecutable(f.executable, { platform: 'linux', env: { PATH: '' } });
  assert.equal(result.candidate, null);
  assert.equal(result.needsRepair, false);
});

test('historical verification and activation records never establish current desktop readiness', async t => {
  const f = await fixture(t);
  const shared = path.join(f.root, 'shared');
  await fs.mkdir(shared);
  await fs.writeFile(path.join(shared, 'manifest.json'), JSON.stringify({ relayConfig: path.join(f.root, 'config.json'), codexHome: f.root }));
  await fs.writeFile(path.join(shared, 'migration-result.json'), JSON.stringify({ phase: 'complete', success: true, checks: { desktopTools: true }, accessKey: 'must-not-leak', environment: { TOKEN: 'must-not-leak' } }));
  await fs.writeFile(path.join(shared, 'activation.json'), JSON.stringify({ phase: 'active', previousCodex: { TOKEN: 'must-not-leak' } }));
  f.setStatus({ state: 'ready', connectionMode: 'shared' });
  const result = await f.inspector.inspect();
  assert.equal(result.migration.last.checks.desktopTools, true);
  assert.equal(result.sharing.state, 'unverified');
  assert.equal(result.desktopTools.state, 'unchecked');
  assert.equal(result.actions.migrate.enabled, false);
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
  await fs.writeFile(path.join(shared, 'migration-result.json'), 'invalid json');
  assert.equal((await f.inspector.inspect(true)).migration.state, 'unreadable');
});

test('migration results from a different Relay data directory are not presented as local history', () => {
  const view = migrationView({ relayConfig: '/other/config.json', codexHome: '/home' }, { phase: 'failed', error: 'different task' }, null, '/current', '/home');
  assert.equal(view.state, 'different_environment');
  assert.equal(view.last, null);
});

test('failed process checks retain unknown state and concurrent environment reads share one check', async t => {
  const f = await fixture(t);
  let calls = 0;
  f.inspector.exec = async () => { calls++; throw new Error('not available'); };
  const [a, b] = await Promise.all([f.inspector.inspect(), f.inspector.inspect()]);
  assert.equal(a, b);
  assert.equal(a.processes.state, 'error');
  assert.equal(a.desktop.running, null);
  const before = calls;
  await f.inspector.inspect();
  assert.equal(calls, before);
});

test('expired, invalid and failed checks cannot remain visually healthy', () => {
  const environment = { checkedAt: '2026-09-10T00:00:00Z', staleAfterMs: 60000 };
  const now = Date.parse(environment.checkedAt);
  assert.equal(environmentIsStale(environment, now + 1000), false);
  assert.equal(environmentIsStale(environment, now + 61000), true);
  assert.equal(environmentIsStale(environment, now, true), true);
  assert.equal(environmentIsStale({ checkedAt: 'bad date' }, now), true);
  assert.match(describeEnvironmentError('spawn codex ENOENT'), /执行路径/);
  assert.match(describeEnvironmentError('thread already has an active writer'), /共用后端/);
});
