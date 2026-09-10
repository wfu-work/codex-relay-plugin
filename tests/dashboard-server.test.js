import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DashboardServer } from "../server/dashboard-server.js";
import { Logger } from "../server/logger.js";
import { randomUUID } from "node:crypto";

test("dashboard is local, bearer-protected, and does not expose its key in status", async (t) => {
  const logger = new Logger();
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-dashboard-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const service = {
    logger,
    configStore: { configDir, publicConfig: async () => ({ relay: { tokenConfigured: false } }) },
    status: async () => ({ connector: { state: "running" } }),
    diagnostics: async () => ({ checks: [] }),
  };
  // Use an ephemeral port so the test is isolated from a developer's local
  // `make dev` Relay instance listening on the default dashboard port.
  const dashboard = new DashboardServer(service, logger, { port: 0 });
  const url = await dashboard.start();
  t.after(() => dashboard.stop());

  const parsed = new URL(url);
  const key = new URLSearchParams(parsed.hash.slice(1)).get("key");
  const origin = parsed.origin;
  assert.ok(key);
  assert.deepEqual(dashboard.status(), { state: "running" });

  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Codex Relay/);

  const unauthorized = await fetch(`${origin}/api/status`);
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`${origin}/api/status`, { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { connector: { state: "running" } });
  const sessionCookie = authorized.headers.get("set-cookie");
  assert.match(sessionCookie, /codex_relay_session=/);

  const direct = await fetch(`${origin}/api/status`, { headers: { Cookie: sessionCookie.split(";", 1)[0] } });
  assert.equal(direct.status, 200);
  assert.deepEqual(await direct.json(), { connector: { state: "running" } });
});

test("dashboard session survives a new server instance", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-dashboard-restart-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const service = {
    logger: new Logger(),
    configStore: { configDir, publicConfig: async () => ({ relay: { tokenConfigured: true } }) },
    status: async () => ({ connector: { state: "running" } }),
    diagnostics: async () => ({ checks: [] }),
  };
  const first = new DashboardServer(service, service.logger, { port: 0 });
  const firstUrl = await first.start();
  const firstKey = new URLSearchParams(new URL(firstUrl).hash.slice(1)).get("key");
  const paired = await fetch(`${new URL(firstUrl).origin}/api/status`, { headers: { Authorization: `Bearer ${firstKey}` } });
  const cookie = paired.headers.get("set-cookie").split(";", 1)[0];
  await first.stop();

  const second = new DashboardServer(service, service.logger, { port: 0 });
  const secondUrl = await second.start();
  t.after(() => second.stop());
  const direct = await fetch(`${new URL(secondUrl).origin}/api/status`, { headers: { Cookie: cookie } });
  assert.equal(direct.status, 200);
});

test("environment actions require dashboard authentication and only pass expected repair fields", async t => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-environment-api-'));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  let mutations = 0;
  const environment = {
    inspect: async force => ({ checked: true, force: Boolean(force) }),
    repairExecutable: async body => {
      mutations++;
      assert.deepEqual(body, { configured: 'codex', candidate: '/verified/codex' });
      return { saved: true };
    },
  };
  const dashboard = new DashboardServer({ configStore: { configDir } }, new Logger(), { port: 0, environment });
  const url = new URL(await dashboard.start());
  t.after(() => dashboard.stop());
  const headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get('key')}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${url.origin}/api/environment`)).status, 401);
  assert.equal((await fetch(`${url.origin}/api/environment/repair-executable`, { method: 'POST' })).status, 401);
  assert.equal(mutations, 0);
  const check = await fetch(`${url.origin}/api/environment/check`, { method: 'POST', headers });
  assert.deepEqual(await check.json(), { checked: true, force: true });
  const repair = await fetch(`${url.origin}/api/environment/repair-executable`, { method: 'POST', headers, body: JSON.stringify({ configured: 'codex', candidate: '/verified/codex', command: 'untrusted-extra' }) });
  assert.deepEqual(await repair.json(), { saved: true });
  assert.equal(mutations, 1);
  assert.equal((await fetch(`${url.origin}/api/environment/migrate`, { method: 'POST', headers })).status, 404);
});

test('migration preparation APIs require authentication, filter input, and cannot activate a backend', async t => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-preparation-api-'));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const id = randomUUID();
  const calls = [];
  const preparation = {
    status: async () => ({ job: { id, phase: 'checking' }, prepared: null }),
    start: async (...args) => { calls.push(args); return { id, phase: 'queued' }; },
    cancel: async (...args) => { calls.push(args); return { id, cancelRequested: true }; },
  };
  const dashboard = new DashboardServer({ configStore: { configDir } }, new Logger(), { port: 0, preparation });
  const url = new URL(await dashboard.start());
  t.after(() => dashboard.stop());
  const headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get('key')}`, 'Content-Type': 'application/json' };
  for (const action of ['check', 'prepare', 'verify-desktop', 'cancel', 'activate']) assert.equal((await fetch(`${url.origin}/api/environment/migration/${action}`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${url.origin}/api/environment/migration/status`)).status, 401);
  assert.equal(calls.length, 0);
  const submitted = await fetch(`${url.origin}/api/environment/migration/prepare`, { method: 'POST', headers, body: JSON.stringify({ requestId: id, root: '/malicious', command: 'arbitrary shell', force: true }) });
  assert.equal(submitted.status, 202);
  assert.deepEqual(calls, [['prepare', id]]);
  const cancelled = await fetch(`${url.origin}/api/environment/migration/cancel`, { method: 'POST', headers, body: JSON.stringify({ id, pid: 123 }) });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(calls[1], [id]);
  assert.equal((await fetch(`${url.origin}/api/environment/migration/status`, { headers })).status, 200);
  assert.equal((await fetch(`${url.origin}/api/environment/migration/activate`, { method: 'POST', headers })).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await fetch(`${url.origin}/api/environment/migration/verify-desktop`, { method: 'POST', headers, body: JSON.stringify({ requestId: id, pipe: '/untrusted', command: '/bin/sh' }) })).status, 202);
  assert.deepEqual(calls[2], ['verify-desktop', id]);
});
