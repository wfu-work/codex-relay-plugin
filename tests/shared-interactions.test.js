import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { AppServerClient } from '../server/app-server-client.js';
import { PendingInteractions } from '../server/pending-interactions.js';
const logger = { info() {}, warn() {}, error() {} };
async function until(check) { for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); } throw new Error('timed out'); }
async function setup(t, handle = () => ({})) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const received = [];
  wss.on('connection', socket => socket.on('message', raw => {
    const message = JSON.parse(raw); received.push(message);
    if (message.id === undefined || !message.method) return;
    const value = message.method === 'initialize' ? { userAgent: 'fixture' } : handle(message);
    socket.send(JSON.stringify({ id: message.id, ...(value?.error ? value : { result: value }) }));
  }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const config = { readOnly: false, permissions: { respondToApprovals: true }, codex: { connectionMode: 'shared', appServerEndpoint: `ws://127.0.0.1:${server.address().port}` } };
  const client = new AppServerClient({ get: () => config }, logger, { interruptRetryMs: 120, interruptPollMs: 5 });
  t.after(async () => { await client.stop(); for (const socket of wss.clients) socket.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); });
  await client.start();
  return { client, config, received, send: message => [...wss.clients][0].send(JSON.stringify(message)) };
}

test('shared observer never rejects desktop requests and removes them on desktop resolution', async t => {
  const { client, received, send } = await setup(t);
  send({ id: 71, method: 'mcpServer/elicitation/request', params: { threadId: 'thread', secret: 'not-for-mobile' } });
  send({ id: 72, method: 'account/refresh', params: { secret: 'not-for-mobile' } });
  await until(() => client.pendingInteractions('thread').length === 1);
  assert.equal(client.pendingInteractions('thread')[0].kind, 'desktop');
  assert.equal(JSON.stringify(client.pendingInteractions('thread')).includes('not-for-mobile'), false);
  assert.equal(received.some(m => m.id === 71 || m.id === 72), false);
  send({ method: 'serverRequest/resolved', params: { threadId: 'thread', requestId: 71 } });
  await until(() => client.pendingInteractions('thread').length === 0);
});

test('user input is validated, submitted once, closed by backend, and old ids cannot answer reused requests', async t => {
  const { client, received, send } = await setup(t);
  const request = { id: 80, method: 'item/tool/requestUserInput', params: { threadId: 'thread', turnId: 'turn', questions: [{ id: 'q', question: 'Choose' }] } };
  send(request);
  await until(() => client.pendingInteractions('thread').length === 1);
  const { approvalId } = client.pendingInteractions('thread')[0];
  assert.throws(() => client.respondToUserInput(approvalId, {}), /完整/);
  const answers = { q: { answers: ['yes'] } };
  assert.equal(client.respondToUserInput(approvalId, answers).status, 'submitted');
  assert.throws(() => client.respondToUserInput(approvalId, answers), /已提交/);
  await until(() => received.some(m => m.id === 80));
  assert.deepEqual(received.find(m => m.id === 80).result, { answers });
  assert.equal(client.pendingInteractions('thread')[0].responding, true);
  send({ method: 'serverRequest/resolved', params: { threadId: 'thread', requestId: 80 } });
  await until(() => client.pendingInteractions('thread').length === 0);
  send(request); await until(() => client.pendingInteractions('thread').length === 1);
  assert.notEqual(client.pendingInteractions('thread')[0].approvalId, approvalId);
  assert.throws(() => client.respondToUserInput(approvalId, answers), /已经处理/);
});

test('approval decisions respect advertised options and default permissions', () => {
  const interactions = new PendingInteractions();
  const entry = interactions.add({ id: 1, method: 'item/commandExecution/requestApproval', params: { availableDecisions: ['decline'], threadId: 'thread' } });
  assert.throws(() => interactions.validateResponse(entry, { decision: 'accept' }, 'approval'), /不支持/);
  assert.equal(interactions.public(entry, {}).canRespond, false);
  assert.equal(interactions.public(entry, { readOnly: true, permissions: { respondToApprovals: true } }).canRespond, false);
  assert.deepEqual(interactions.validateResponse(entry, { decision: 'decline' }, 'approval'), { decision: 'decline' });
  assert.equal(interactions.resolve('1', 'thread').length, 0, 'numeric and string request ids differ');
});

test('early stop polls until turn is active, deduplicates simultaneous callers and returns only requested', async t => {
  let polls = 0, interrupts = 0;
  const { client } = await setup(t, m => {
    if (m.method === 'thread/turns/list') return { data: ++polls < 2 ? [] : [{ id: 'turn', status: 'inProgress' }] };
    if (m.method === 'turn/interrupt') { interrupts++; return interrupts === 1 ? { error: { message: 'no active turn to interrupt' } } : {}; }
    return {};
  });
  const results = await Promise.all([client.interruptTurn({ threadId: 'thread', turnId: 'turn' }), client.interruptTurn({ threadId: 'thread', turnId: 'turn' })]);
  assert.equal(results[0].status, 'requested');
  assert.deepEqual(results[0], results[1]);
  assert.equal(interrupts, 2);
});

test('a stale stop never interrupts a newer turn, and already completed turns remain completed', async t => {
  let turns = [{ id: 'new', status: 'inProgress' }];
  const { client, received } = await setup(t, m => m.method === 'thread/turns/list' ? { data: turns } : {});
  await assert.rejects(client.interruptTurn({ threadId: 'thread', turnId: 'old' }), { code: 'TURN_CHANGED' });
  turns = [{ id: 'old', status: 'completed' }];
  assert.equal((await client.interruptTurn({ threadId: 'thread', turnId: 'old' })).turnStatus, 'completed');
  assert.equal(received.some(m => m.method === 'turn/interrupt'), false);
});
