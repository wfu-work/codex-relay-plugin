import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { InstanceLock } from "../server/instance-lock.js";

test("allows one owner and releases the lock", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-lock-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const first = new InstanceLock(configDir);
  const second = new InstanceLock(configDir);

  await Promise.all([first.acquire(), first.acquire()]);
  await assert.rejects(() => second.acquire(), { code: "RELAY_INSTANCE_ALREADY_RUNNING" });
  await first.release();
  await second.acquire();
  await second.release();
});

test("removes a lock left by a dead process", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-lock-stale-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(configDir, "connector.lock"), JSON.stringify({ pid: 99999999 }));
  const lock = new InstanceLock(configDir);
  await lock.acquire();
  await lock.release();
});

test("recovers an old partially written lock", async (t) => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-relay-lock-partial-"));
  t.after(() => fs.rm(configDir, { recursive: true, force: true }));
  const lockPath = path.join(configDir, "connector.lock");
  await fs.writeFile(lockPath, "", "utf8");
  const old = new Date(Date.now() - 10_000);
  await fs.utimes(lockPath, old, old);
  const lock = new InstanceLock(configDir);
  await lock.acquire();
  await lock.release();
});
