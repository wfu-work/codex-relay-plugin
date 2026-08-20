import assert from "node:assert/strict";
import test from "node:test";
import { DashboardServer } from "../server/dashboard-server.js";
import { Logger } from "../server/logger.js";

test("dashboard is local, bearer-protected, and does not expose its key in status", async (t) => {
  const logger = new Logger();
  const service = {
    logger,
    configStore: { publicConfig: async () => ({ relay: { tokenConfigured: false } }) },
    status: async () => ({ connector: { state: "running" } }),
    diagnostics: async () => ({ checks: [] }),
  };
  const dashboard = new DashboardServer(service, logger);
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
});
