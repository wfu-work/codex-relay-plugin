import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MigrationPreparation, runPreparationJob } from '../server/migration-preparation.js';
import { inspectPreparation, preparationFingerprint } from '../server/migration-preflight.js';
import { prepareSharedBackend } from '../server/shared-backend-prepare.js';
import { activate, readJson, writePrivate } from '../server/shared-backend-manager.js';

async function fixture(t) {
  const root = await fs.mkdtemp('/tmp/relay-prep-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configDir = path.join(root, 'config');
  const pluginRoot = path.join(root, 'plugin');
  const codexHome = path.join(root, 'home');
  const binary = path.join(root, 'Codex.app/Contents/Resources/codex');
  await fs.mkdir(codexHome);
  await writePrivate(binary, 'fake codex');
  await writePrivate(path.join(configDir, 'config.json'), JSON.stringify({ codex: { executable: binary }, relay: { secret: 'never-return-this' } }));
  for (const [name, data] of Object.entries({ 'package.json': '{"name":"codex-relay-plugin","type":"module"}', '.codex-plugin/plugin.json': '{"name":"codex-relay-plugin","version":"fixture"}', 'server/agent-cli.js': 'agent', 'server/shared-backend-cli.js': 'bundle', 'server/migration-cli.js': 'worker', 'ui/index.html': 'UI' })) await writePrivate(path.join(pluginRoot, name), data);
  const env = { executable: { state: 'ok', needsRepair: false, resolved: binary }, processes: { state: 'ok', items: [{ kind: 'backend', pid: 123, scope: 'same' }] }, migration: { last: { failedPhase: 'verifying_shared_runtime' } } };
  const environment = { service: { configStore: { configDir, get: () => ({ codex: {} }) } }, pluginRoot, codexHome, sharedRoot: path.join(root, 'old'), inspect: async () => env };
  let launches = 0;
  const controller = new MigrationPreparation(environment, { launch: async () => { launches++; } });
  const id = randomUUID();
  const context = controller.context(id);
  const inspect = (ctx, options) => inspectPreparation(ctx, { ...options, platform: 'darwin', verify: async () => {} });
  const run = (overrides = {}) => runPreparationJob(configDir, id, { createEnvironment: async () => environment, inspect, verify: async () => {}, ...overrides });
  return { root, configDir, pluginRoot, codexHome, env, environment, controller, id, context, inspect, run, launches: () => launches };
}

test('preflight distinguishes preparation from desktop validation and never returns configuration secrets', async t => {
  const f = await fixture(t);
  await f.controller.start('check', f.id);
  await f.run();
  const { job } = await f.controller.status();
  assert.equal(job.phase, 'complete');
  assert.equal(job.report.readyToPrepare, true);
  assert.equal(job.report.readyToActivate, false);
  assert.equal(job.report.checks.find(c => c.id === 'desktop_tools').state, 'blocked');
  assert.equal(JSON.stringify(job).includes('never-return-this'), false);
  assert.equal(JSON.stringify(job).includes('owner'), false);
  assert.equal(await fs.readdir(f.codexHome).then(files => files.length), 0);
});

test('duplicate submissions are idempotent and another operation cannot start while one is active', async t => {
  const f = await fixture(t);
  await f.controller.start('check', f.id);
  await f.controller.start('check', f.id);
  assert.equal(f.launches(), 1);
  await assert.rejects(f.controller.start('prepare', randomUUID()), { code: 'MIGRATION_BUSY' });
  await assert.rejects(f.controller.start('prepare', f.id), { code: 'INVALID_JOB' });
  await assert.rejects(f.controller.start('prepare', '../outside'), { code: 'INVALID_JOB' });
  await f.run();
  await f.controller.start('check', f.id);
  assert.equal(f.launches(), 1);
});

test('ready package is atomic, remains inactive, and keeps live config and older migration records intact', async t => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.configDir, 'config.json'), 'utf8');
  await writePrivate(path.join(f.environment.sharedRoot, 'migration-result.json'), '{"phase":"failed","backup":"keep"}');
  await f.controller.start('prepare', f.id);
  await f.run();
  const record = await f.controller.latest();
  assert.equal(record.phase, 'complete');
  assert.equal(record.artifact.activated, false);
  const manifest = await readJson(path.join(f.context.packageRoot, 'manifest.json'));
  assert.equal(manifest.root, f.context.packageRoot);
  assert.equal(manifest.activationBlocked, true);
  await assert.rejects(activate(manifest), /尚未通过桌面工具/);
  assert.equal(await fs.readFile(path.join(f.configDir, 'config.json'), 'utf8'), before);
  assert.deepEqual(await readJson(path.join(f.environment.sharedRoot, 'migration-result.json')), { phase: 'failed', backup: 'keep' });
  assert.equal((await fs.stat(f.context.packageRoot)).mode & 0o777, 0o700);
  assert.equal((await fs.readdir(path.dirname(f.context.packageRoot))).some(name => name.includes('.preparing-')), false);
  assert.equal(JSON.stringify(await readJson(path.join(f.context.packageRoot, 'manifest.json'))).includes('never-return-this'), false);
});

test('cancellation cleans partial files and remains visible after constructing a new controller', async t => {
  const f = await fixture(t);
  await f.controller.start('prepare', f.id);
  await f.run({ prepare: async (manifest, production, options) => {
    let checkpoints = 0;
    return prepareSharedBackend(manifest, production, { ...options, checkpoint: async () => {
      if (++checkpoints === 3) await f.controller.cancel(f.id);
      await options.checkpoint();
    } });
  } });
  const restarted = new MigrationPreparation(f.environment, { launch: async () => {} });
  assert.equal((await restarted.status()).job.phase, 'cancelled');
  assert.equal((await fs.readdir(path.dirname(f.context.packageRoot))).length, 0);
  assert.equal((await restarted.status()).prepared, null);
});

test('a changed config during packaging rejects publication and leaves the changed config intact', async t => {
  const f = await fixture(t);
  await f.controller.start('prepare', f.id);
  await f.run({ prepare: async (manifest, production, options) => {
    let checks = 0;
    return prepareSharedBackend(manifest, production, { ...options, verify: async value => {
      if (++checks === 2) await writePrivate(path.join(f.configDir, 'config.json'), '{"codex":{"executable":"new-user-choice"}}');
      await options.verify(value);
    } });
  } });
  const { job } = await f.controller.status();
  assert.equal(job.phase, 'failed');
  assert.match(job.error, /配置或插件已变化/);
  assert.equal((await fs.readdir(path.dirname(f.context.packageRoot))).length, 0);
  assert.equal((await readJson(path.join(f.configDir, 'config.json'))).codex.executable, 'new-user-choice');
});

test('invalid preparation conditions finish blocked instead of leaving an indefinite loading state', async t => {
  const f = await fixture(t);
  f.env.executable.needsRepair = true;
  await f.controller.start('prepare', f.id);
  let prepared = false;
  await f.run({ prepare: async () => { prepared = true; } });
  assert.equal((await f.controller.status()).job.phase, 'blocked');
  assert.equal(prepared, false);
});

test('process exit and spawn failures are recoverable and cannot be shown as a completed preparation', async t => {
  const f = await fixture(t);
  await f.controller.start('prepare', f.id);
  const file = path.join(f.configDir, 'migration/jobs', `${f.id}.json`);
  const record = await readJson(file);
  const partial = `${f.context.packageRoot}.preparing-12345678`;
  await writePrivate(path.join(partial, 'partial.js'), 'incomplete');
  await writePrivate(path.join(f.context.packageRoot, 'finished.txt'), 'preserve published files');
  await writePrivate(file, JSON.stringify({ ...record, phase: 'packaging', owner: { pid: 2147483647, identity: 'old' } }));
  assert.equal((await f.controller.status()).job.phase, 'interrupted');
  await assert.rejects(fs.access(partial));
  assert.equal(await fs.readFile(path.join(f.context.packageRoot, 'finished.txt'), 'utf8'), 'preserve published files');
  const failing = new MigrationPreparation(f.environment, { launch: async () => { throw new Error('secret spawn internals'); } });
  const result = await failing.start('check', randomUUID());
  assert.equal(result.phase, 'failed');
  assert.equal(result.error.includes('secret'), false);
});

test('existing directories are never overwritten during preparation', async t => {
  const f = await fixture(t);
  await f.controller.start('check', f.id);
  const result = await f.inspect(f.context, { environment: f.environment });
  await writePrivate(path.join(f.context.packageRoot, 'keep.txt'), 'original');
  await assert.rejects(prepareSharedBackend(result.manifest, f.pluginRoot, { verify: async () => {} }), /目录已存在/);
  assert.equal(await fs.readFile(path.join(f.context.packageRoot, 'keep.txt'), 'utf8'), 'original');
});

test('completed jobs are not rerun by duplicate worker launches', async t => {
  const f = await fixture(t);
  await f.controller.start('check', f.id);
  await f.run();
  const before = await f.controller.latest();
  await f.run({ inspect: async () => { throw new Error('must not run'); } });
  assert.deepEqual(await f.controller.latest(), before);
});

test('source fingerprint detects config and same-version plugin replacement', async t => {
  const f = await fixture(t);
  const initial = await preparationFingerprint(f.context);
  await fs.writeFile(path.join(f.pluginRoot, 'server/agent-cli.js'), 'new build, same version');
  assert.notEqual(await preparationFingerprint(f.context), initial);
});

test('desktop compatibility runs as a persistent job and cannot generate or activate a package', async t => {
  const f = await fixture(t);
  await f.controller.start('verify-desktop', f.id);
  await f.run({ verifyDesktop: async () => ({ checkedAt: new Date().toISOString(), state: 'blocked', runtime: { verified: true }, message: 'real handshake rejected' }), prepare: async () => { throw Error('must not prepare'); } });
  const result = await f.controller.status();
  assert.equal(result.job.phase, 'blocked');
  assert.equal(result.job.report.checks[0].state, 'passed');
  assert.equal(result.job.report.checks[1].state, 'blocked');
  assert.equal(result.job.report.readyToActivate, false);
  assert.equal(result.prepared, null);
});
