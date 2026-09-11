import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sharedTasksIdle, replaceRuntime } from '../server/shared-runtime-repair.js';
import { defaultManifest, serviceDefinition, writePrivate } from '../server/shared-backend-manager.js';

test('runtime repair refuses active, approval, input and unknown task states', async () => {
  for (const status of [{ type: 'active', activeFlags: [] }, { type: 'active', activeFlags: ['waitingOnApproval'] }, { type: 'active', activeFlags: ['waitingOnUserInput'] }, { type: 'systemError' }, undefined]) {
    const client = { request: async method => method === 'thread/loaded/list' ? { data: ['task'] } : { thread: { status } } };
    assert.equal(await sharedTasksIdle(client), false);
  }
});

test('runtime repair checks every loaded task page without resuming a task', async () => {
  const calls = [];
  const client = { request: async (method, params) => {
    calls.push(method);
    if (method === 'thread/loaded/list') return params.cursor ? { data: ['busy'] } : { data: ['idle'], nextCursor: 'page2' };
    assert.equal(params.includeTurns, false);
    return { thread: { status: { type: params.threadId === 'idle' ? 'idle' : 'active' } } };
  } };
  assert.equal(await sharedTasksIdle(client), false);
  assert.deepEqual(calls, ['thread/loaded/list', 'thread/read', 'thread/loaded/list', 'thread/read']);
});

test('runtime repair rejects incomplete inventory and repeated cursors', async () => {
  assert.equal(await sharedTasksIdle({ request: async () => ({}) }), false);
  assert.equal(await sharedTasksIdle({ request: async () => ({ data: [], nextCursor: 'loop' }) }), false);
  assert.equal(await sharedTasksIdle({ request: async () => ({ data: [] }) }), true);
  await assert.rejects(sharedTasksIdle({ request: async () => { throw Error('timeout'); } }), /timeout/);
});

async function fixture(t, failBootstrap = false) {
  const root = await fs.mkdtemp('/tmp/runtime-repair-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = { ...defaultManifest(root), node: '/usr/local/bin/node', launchAgent: path.join(root, 'service.plist') };
  const plugin = path.join(root, 'plugin');
  const original = { 'manifest.json': JSON.stringify(manifest), 'shared-backend-cli.js': 'old manager', 'codex-proxy': 'old proxy', 'service.plist': 'old service', 'history.jsonl': 'preserved history', 'config.json': 'preserved config' };
  for (const [name, value] of Object.entries(original)) await writePrivate(path.join(root, name), value);
  await writePrivate(path.join(plugin, 'server/shared-backend-cli.js'), 'new manager');
  const runtime = { pid: 888, identity: 'original' };
  let running = true, boots = 0, opens = 0;
  const operations = [];
  const dependencies = {
    ownedRuntime: async () => running ? runtime : null,
    waitReady: async () => {}, openDesktop: async () => { opens++; },
    exec: async (command, args) => {
      if (command.endsWith('plutil')) return { stdout: JSON.stringify({ ...serviceDefinition(manifest), ProgramArguments: [manifest.node, ...serviceDefinition(manifest).ProgramArguments.slice(1)] }) };
      if (command.endsWith('/ps')) return { stdout: '777' };
      operations.push(args[0]);
      if (args[0] === 'print') { if (!running) throw Error('not loaded'); return { stdout: '\n pid = 777\n' }; }
      if (args[0] === 'bootout') running = false;
      if (args[0] === 'bootstrap') { if (++boots === 1 && failBootstrap) throw Error('bootstrap failed'); running = true; }
      return { stdout: '' };
    },
  };
  return { root, manifest, plugin, original, runtime, operations, dependencies, opens: () => opens };
}

test('runtime repair replaces only the registered launcher and preserves history/config', async t => {
  const f = await fixture(t);
  await replaceRuntime(f.manifest, f.plugin, f.runtime, f.dependencies);
  assert.equal((JSON.parse(await fs.readFile(path.join(f.root, 'manifest.json'), 'utf8'))).node, '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node');
  assert.equal(await fs.readFile(path.join(f.root, 'shared-backend-cli.js'), 'utf8'), 'new manager');
  assert.equal(await fs.readFile(path.join(f.root, 'history.jsonl'), 'utf8'), f.original['history.jsonl']);
  assert.equal(await fs.readFile(path.join(f.root, 'config.json'), 'utf8'), f.original['config.json']);
  assert.deepEqual(f.operations, ['print', 'bootout', 'bootstrap']);
  assert.equal(f.opens(), 1);
});

test('a failed replacement restores the original launcher and reopens the old service', async t => {
  const f = await fixture(t, true);
  await assert.rejects(replaceRuntime(f.manifest, f.plugin, f.runtime, f.dependencies), /bootstrap failed/);
  for (const [name, value] of Object.entries(f.original)) assert.equal(await fs.readFile(path.join(f.root, name), 'utf8'), value);
  assert.equal(f.opens(), 1);
});

test('runtime repair cannot stop a process that is outside the registered service', async t => {
  const f = await fixture(t);
  const run = f.dependencies.exec;
  f.dependencies.exec = async (command, args) => command.endsWith('/ps') ? { stdout: '999' } : run(command, args);
  await assert.rejects(replaceRuntime(f.manifest, f.plugin, f.runtime, f.dependencies), /不属于/);
  assert.deepEqual(f.operations, ['print']);
  assert.equal(await fs.readFile(path.join(f.root, 'shared-backend-cli.js'), 'utf8'), 'old manager');
});
