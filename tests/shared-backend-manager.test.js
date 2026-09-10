import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupData, defaultManifest, patchRelay, plist, processConflicts, restoreRelay, serviceDefinition, shellQuote } from "../server/shared-backend-manager.js";

test("switching mode and rolling back preserve credentials, permissions and later edits", () => {
  const original = { relay: { spaceId: "space", token: "fixture-only" }, codex: { executable: "/codex" }, allowedProjects: ["/old"], readOnly: true };
  const active = patchRelay(original, "unix:///tmp/shared.sock");
  assert.equal(active.readOnly, true);
  assert.deepEqual(active.relay, original.relay);
  const changed = { ...active, allowedProjects: ["/old", "/new"], codex: { ...active.codex, defaultWorkingDirectory: "/new" } };
  const restored = restoreRelay(changed, original.codex);
  assert.deepEqual(restored.allowedProjects, ["/old", "/new"]);
  assert.deepEqual(restored.codex, { executable: "/codex", defaultWorkingDirectory: "/new" });
  assert.equal(original.codex.connectionMode, undefined);
});

test("process guard detects desktop, configured CLI and relay without exposing arguments", () => {
  const conflicts = processConflicts('100 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n101 100 /app/codex -c features.code_mode_host=true app-server -c secret=fixture\n102 1 /usr/bin/node /cache/server/agent-cli.js\n103 1 /app/codex app-server proxy\n104 1 /app/codex app-server --listen unix:///tmp/rpc.sock\n');
  assert.deepEqual(conflicts, [{ pid: 100, kind: "desktop" }, { pid: 101, kind: "backend" }, { pid: 102, kind: "relay" }, { pid: 104, kind: "backend" }]);
  assert.deepEqual(processConflicts("104 1 /app/codex app-server", [104]), []);
  assert.deepEqual(processConflicts("105 100 /Applications/ChatGPT.app/Contents/Frameworks/Codex (Service).app/Contents/MacOS/Codex (Service) --type=utility"), []);
});

test("backup captures persistent history/databases without changing originals or copying caches", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shared-backup-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  await fs.mkdir(path.join(home, "sessions"), { recursive: true });
  await fs.mkdir(path.join(home, "plugins"));
  await fs.writeFile(path.join(home, "sessions/history.jsonl"), "history");
  await fs.writeFile(path.join(home, "plugins/cache"), "cached");
  await fs.writeFile(path.join(home, "state_5.sqlite"), "database");
  await fs.writeFile(path.join(home, "auth.json"), "fixture credential");
  const relayConfig = path.join(root, "relay.json");
  await fs.writeFile(relayConfig, "{}");
  const backup = path.join(root, "backup");
  await backupData({ codexHome: home, relayConfig }, backup);
  assert.equal(await fs.readFile(path.join(backup, "codex/sessions/history.jsonl"), "utf8"), "history");
  assert.equal(await fs.readFile(path.join(backup, "codex/state_5.sqlite"), "utf8"), "database");
  await assert.rejects(fs.access(path.join(backup, "codex/plugins")));
  await fs.writeFile(path.join(home, "sessions/history.jsonl"), "new history");
  assert.equal(await fs.readFile(path.join(backup, "codex/sessions/history.jsonl"), "utf8"), "history");
  assert.equal((await fs.stat(backup)).mode & 0o777, 0o700);
});

test("launchd and shell entries preserve paths containing spaces and metacharacters", async t => {
  assert.equal(await promisify(execFile)("/bin/sh", ["-c", `printf '%s' ${shellQuote("hello ' & $(false)")}`]).then(result => result.stdout), "hello ' & $(false)");
  const manifest = defaultManifest("/tmp/Shared & Backend");
  const definition = serviceDefinition(manifest);
  assert.equal(definition.RunAtLoad, true);
  assert.equal(definition.KeepAlive.SuccessfulExit, false);
  assert.equal(definition.ProgramArguments[1], "/tmp/Shared & Backend/shared-backend-cli.js");
  assert.ok(plist(definition).includes("Shared &amp; Backend"));
  assert.throws(() => defaultManifest(`/tmp/${"a".repeat(100)}`), /过长/);
  if (process.platform === "darwin") {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shared-plist-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, "launch.plist");
    await fs.writeFile(file, plist(definition));
    await promisify(execFile)("/usr/bin/plutil", ["-lint", file]);
  }
});
