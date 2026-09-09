import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DashboardServer } from "../server/dashboard-server.js";
import { Logger } from "../server/logger.js";

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
