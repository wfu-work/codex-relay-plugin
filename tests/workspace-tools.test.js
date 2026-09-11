import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listSkills, resolveSkills, resolveWorkspaceReferences, searchWorkspace } from "../server/workspace-tools.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relay-workspace-"));
  await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "readme");
  await fs.writeFile(path.join(root, "src", "main.dart"), "main");
  await fs.writeFile(path.join(root, "src", "nested", "util.dart"), "util");
  await fs.writeFile(path.join(root, "node_modules", "ignored.js"), "ignored");
  await fs.mkdir(path.join(root, ".codex", "skills", "review"), { recursive: true });
  await fs.writeFile(path.join(root, ".codex", "skills", "review", "SKILL.md"), "---\nname: review\n---\nReview changed files carefully.\n");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "relay-codex-home-"));
  await fs.mkdir(path.join(home, "skills", "global"), { recursive: true });
  await fs.writeFile(path.join(home, "skills", "global", "SKILL.md"), "# Global helper\nUse the helper.\n");
  return { root, home, cleanup: () => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(home, { recursive: true, force: true }),
  ]) };
}

test("workspace search enforces roots, ignores generated directories, and paginates", async () => {
  const f = await fixture();
  try {
    const page = await searchWorkspace({ cwd: f.root, query: ".dart", limit: 1, allowedProjects: [f.root] });
    assert.equal(page.data.length, 1);
    assert.ok(page.nextCursor);
    const next = await searchWorkspace({ cwd: f.root, query: ".dart", limit: 10, cursor: page.nextCursor, allowedProjects: [f.root] });
    assert.equal(next.data.some((item) => item.path.includes("node_modules")), false);
    await assert.rejects(() => searchWorkspace({ cwd: path.dirname(f.root), allowedProjects: [f.root] }), /白名单/);
  } finally { await f.cleanup(); }
});

test("skills merge workspace and global entries and references stay relative", async () => {
  const f = await fixture();
  try {
    const skills = await listSkills({ cwd: f.root, codexHome: f.home, allowedProjects: [f.root] });
    assert.deepEqual(skills.data.map((item) => item.name), ["global", "review"]);
    const resolved = await resolveSkills({ cwd: f.root, skills: ["review"], codexHome: f.home, allowedProjects: [f.root] });
    assert.equal(resolved[0].source, "workspace");
    const refs = await resolveWorkspaceReferences({ cwd: f.root, references: ["src/main.dart", "src"], allowedProjects: [f.root] });
    assert.deepEqual(refs.map((item) => item.relative), ["src/main.dart", "src"]);
    await assert.rejects(() => resolveWorkspaceReferences({ cwd: f.root, references: ["../secret"], allowedProjects: [f.root] }), /超出/);
  } finally { await f.cleanup(); }
});
