import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DesktopProjectPins } from "../server/desktop-project-pins.js";
import { AppServerClient } from "../server/app-server-client.js";
import { Logger } from "../server/logger.js";
import { filterProjectList } from "../server/utils.js";

async function fixture(t) {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-project-pins-"));
  t.after(() => fs.rm(codexHome, { recursive: true, force: true }));
  const file = path.join(codexHome, ".codex-global-state.json");
  return { codexHome, file, write: (state) => fs.writeFile(file, JSON.stringify(state)) };
}

test("projects get exact desktop pins and order without exposing other preferences", async (t) => {
  const { codexHome, write } = await fixture(t);
  await write({ "pinned-project-ids": ["b", "a", "b", "unknown"], unrelated: "private" });
  const pins = new DesktopProjectPins({ codexHome });
  const result = { data: [{ id: "a", position: 8 }, { id: "c", position: 0 }, { id: "b", position: 2 }], nextCursor: "next" };
  assert.deepEqual(await pins.enrich(result), {
    data: [
      { id: "a", position: 8, isPinned: true, pinnedPosition: 1 },
      { id: "c", position: 0, isPinned: false, pinnedPosition: null },
      { id: "b", position: 2, isPinned: true, pinnedPosition: 0 },
    ],
    nextCursor: "next",
  });
  assert.equal(Object.hasOwn(result.data[0], "isPinned"), false);
});

test("refresh keeps the last valid pins through transient failures and accepts unpinning", async (t) => {
  const { codexHome, file, write } = await fixture(t);
  const pins = new DesktopProjectPins({ codexHome });
  const catalog = { data: [{ id: "a" }] };
  assert.equal((await pins.enrich(catalog)).data[0].isPinned, false);
  await write({ "pinned-project-ids": ["a"] });
  assert.equal((await pins.enrich(catalog)).data[0].isPinned, true);
  for (const content of ['{"pinned-project-ids":', '{"pinned-project-ids":[42]}', '[]']) {
    await fs.writeFile(file, content);
    assert.equal((await pins.enrich(catalog)).data[0].isPinned, true);
  }
  await fs.unlink(file);
  assert.equal((await pins.enrich(catalog)).data[0].isPinned, true);
  await write({ "pinned-project-ids": [] });
  assert.equal((await pins.enrich(catalog)).data[0].isPinned, false);
  await write({ "pinned-project-ids": ["a"] });
  await pins.enrich(catalog);
  await write({});
  assert.equal((await pins.enrich(catalog)).data[0].isPinned, false);
});

test("App Server enriches all catalog pages and explicit cursors before allowlist filtering", async (t) => {
  const { codexHome, write } = await fixture(t);
  await write({ "pinned-project-ids": ["b", "a"] });
  const client = new AppServerClient({ get: () => ({ codex: {} }) }, new Logger(), { codexHome });
  const calls = [];
  client.request = async (method, params) => {
    calls.push([method, params.cursor]);
    return params.cursor == null
      ? { data: [{ id: "a", position: 2, roots: [{ path: "/allowed/a" }] }], nextCursor: "page2" }
      : { data: [{ id: "b", position: 1, roots: [{ path: "/private/b" }] }], nextCursor: null };
  };
  const result = await client.listProjects();
  assert.deepEqual(calls, [["project/list", null], ["project/list", "page2"]]);
  assert.deepEqual(result.data.map(({ id, isPinned, pinnedPosition }) => [id, isPinned, pinnedPosition]),
    [["b", true, 0], ["a", true, 1]]);
  assert.equal(result.nextCursor, null);
  const filtered = filterProjectList(result, ["/allowed"]);
  assert.deepEqual(filtered.data.map(({ id }) => id), ["a"]);
  assert.equal(filtered.data[0].isPinned, true);

  await write({ "pinned-project-ids": [] });
  const page = await client.listProjects({ cursor: "page2" });
  assert.equal(page.data[0].id, "b");
  assert.equal(page.data[0].isPinned, false);
  assert.equal(page.data[0].pinnedPosition, null);
});
