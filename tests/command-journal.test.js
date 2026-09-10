import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { CommandRouter } from '../server/command-router.js';
import { CommandJournal } from '../server/command-journal.js';
import { defaultConfig } from '../server/config-store.js';
async function setup(t) {
  const dir = await fs.mkdtemp('/tmp/recodex-journal-test-');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const config = defaultConfig();
  Object.assign(config.relay, { spaceId: 'space', endpointId: 'host' });
  config.readOnly = false; config.permissions.startTurns = true;
  const store = { configDir: dir, get: () => config };
  let calls = 0;
  const appServer = { start: async () => {}, startTurn: async () => { calls++; return { turn: { id: 'turn' } }; } };
  const router = () => new CommandRouter({ configStore: store, appServer, service: {}, logger: { warn() {} } });
  const message = { version: 1, type: 'codex.command', requestId: 'request', deviceId: 'phone', targetDeviceId: 'host', spaceId: 'space', timestamp: new Date().toISOString(), threadId: 'thread', command: { type: 'turn.start', text: 'private prompt' } };
  return { dir, config, appServer, router, message, calls: () => calls };
}

test('durable command outcomes survive router restart without executing a turn twice', async t => {
  const f = await setup(t);
  const first = await f.router().handle(f.message);
  assert.equal(first.success, true);
  assert.deepEqual(await f.router().handle(f.message), first);
  assert.equal(f.calls(), 1);
  assert.equal((await f.router().handle({ ...f.message, command: { ...f.message.command, text: 'different' } })).error.code, 'REQUEST_ID_REUSED');
  const text = await fs.readFile(`${f.dir}/command-journal/${(await fs.readdir(`${f.dir}/command-journal`))[0]}`, 'utf8');
  assert.equal(text.includes('private prompt'), false);
  f.config.readOnly = true;
  assert.equal((await f.router().handle(f.message)).error.code, 'COMMAND_NOT_ALLOWED');
});

test('pending intent survives a crash and returns unknown instead of repeating execution', async t => {
  const f = await setup(t);
  const journal = new CommandJournal(f.dir);
  await journal.begin(f.config, f.message, 'fingerprint');
  await assert.rejects(new CommandJournal(f.dir).begin(f.config, f.message, 'fingerprint'), { code: 'COMMAND_OUTCOME_UNKNOWN' });
  await assert.rejects(new CommandJournal(f.dir).begin(f.config, f.message, 'changed'), { code: 'REQUEST_ID_REUSED' });
  assert.ok(await journal.begin(f.config, { ...f.message, deviceId: 'second-phone' }, 'fingerprint'));
  f.config.codex.appServerEndpoint = 'unix:///tmp/other.sock';
  assert.ok(await journal.begin(f.config, f.message, 'fingerprint'));
});

test('unavailable journal fails closed before any mutation', async t => {
  const f = await setup(t);
  await fs.writeFile(`${f.dir}/command-journal`, 'not a directory');
  assert.equal((await f.router().handle(f.message)).success, false);
  assert.equal(f.calls(), 0);
});

test('lost write response stays unknown across restart without auto retry', async t => {
  const f = await setup(t);
  let calls = 0;
  f.appServer.startTurn = async () => { calls++; throw Object.assign(new Error('lost reply'), { code: 'APP_SERVER_UNAVAILABLE' }); };
  assert.equal((await f.router().handle(f.message)).error.code, 'COMMAND_OUTCOME_UNKNOWN');
  assert.equal((await f.router().handle(f.message)).error.code, 'COMMAND_OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
});
