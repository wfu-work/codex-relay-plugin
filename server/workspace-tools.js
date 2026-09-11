import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RelayError } from "./errors.js";
import { safeProjectPath } from "./utils.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "build",
  ".dart_tool",
  "dist",
  ".cache",
  ".next",
  "coverage",
]);
const MAX_DEPTH = 8;
const MAX_RESULTS = 100;
const MAX_SKILLS = 200;
const MAX_DESCRIPTION = 360;

function text(value, fallback = "") {
  const result = typeof value === "string" ? value.trim() : "";
  return result || fallback;
}

function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function assertWorkspaceRoot(cwd, allowedProjects) {
  const root = safeProjectPath(text(cwd), allowedProjects);
  if (!root) throw new RelayError("PROJECT_NOT_ALLOWED", "该工作区不在远程访问白名单中");
  return root;
}

function relativeReference(root, value) {
  const raw = text(value).replaceAll("\\", path.sep);
  if (!raw || path.isAbsolute(raw)) throw new RelayError("INVALID_MESSAGE", "工作区引用必须是相对路径");
  const resolved = path.resolve(root, raw);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RelayError("PROJECT_NOT_ALLOWED", "工作区引用超出当前项目范围");
  }
  return { absolute: resolved, relative: relative.split(path.sep).join("/") };
}

export async function searchWorkspace({ cwd, query = "", kind = "all", limit, cursor, allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  const wantedKind = ["file", "directory", "all"].includes(kind) ? kind : "all";
  const needle = text(query).toLowerCase().slice(0, 160);
  const pageSize = boundedInteger(limit, 40, MAX_RESULTS);
  const start = Number.isSafeInteger(Number(cursor)) && Number(cursor) >= 0 ? Number(cursor) : 0;
  const result = [];
  let visited = 0;

  async function visit(directory, depth) {
    if (depth > MAX_DEPTH || result.length >= pageSize + 1) return;
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (error.code === "ENOENT" || error.code === "EACCES") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const entryKind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
      if ((wantedKind === "all" || wantedKind === entryKind) && (!needle || relative.toLowerCase().includes(needle))) {
        if (visited >= start && result.length < pageSize + 1) {
          let size;
          if (entryKind === "file") {
            try { size = (await fs.stat(absolute)).size; } catch { /* best effort */ }
          }
          result.push({ path: relative, name: entry.name, kind: entryKind, ...(size === undefined ? {} : { size }) });
        }
        visited += 1;
      }
      if (entry.isDirectory()) await visit(absolute, depth + 1);
        if (result.length >= pageSize + 1) return;
    }
  }
  await visit(root, 0);
  const hasMore = result.length > pageSize;
  const data = result.slice(0, pageSize);
  return { data, ...(hasMore ? { nextCursor: String(start + data.length) } : {}) };
}

function descriptionFromMarkdown(markdown) {
  const body = markdown.replace(/^---[\s\S]*?---\s*/u, "").trim();
  const paragraph = body.split(/\n\s*\n/u).map((item) => item.replace(/^#+\s*/u, "").replace(/\s+/gu, " ").trim()).find(Boolean);
  return (paragraph || "").slice(0, MAX_DESCRIPTION);
}

async function readSkillDirectory(parent, name, source) {
  const directory = path.join(parent, name);
  let stat;
  try { stat = await fs.stat(directory); } catch { return null; }
  if (!stat.isDirectory() || name.startsWith(".")) return null;
  try {
    const markdown = await fs.readFile(path.join(directory, "SKILL.md"), "utf8");
    return { name, description: descriptionFromMarkdown(markdown), source, path: directory };
  } catch { return null; }
}

export async function listSkills({ cwd, allowedProjects, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") }) {
  const roots = [];
  if (cwd) {
    const workspace = assertWorkspaceRoot(cwd, allowedProjects);
    roots.push({ path: path.join(workspace, ".codex", "skills"), source: "workspace" });
  }
  roots.push({ path: path.join(codexHome, "skills"), source: "global" });
  const skills = new Map();
  for (const root of roots) {
    let entries;
    try { entries = await fs.readdir(root.path, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkillDirectory(root.path, entry.name, root.source);
      if (skill && !skills.has(skill.name)) skills.set(skill.name, skill);
    }
  }
  return { data: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_SKILLS) };
}

export async function resolveWorkspaceReferences({ cwd, references = [], allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  if (!Array.isArray(references) || references.length > 20) throw new RelayError("INVALID_MESSAGE", "工作区引用数量无效");
  const resolved = [];
  for (const value of references) {
    const ref = relativeReference(root, value?.path ?? value);
    try { await fs.access(ref.absolute); } catch { throw new RelayError("WORKSPACE_REFERENCE_NOT_FOUND", `找不到工作区引用：${ref.relative}`); }
    resolved.push(ref);
  }
  return resolved;
}

export async function resolveSkills({ cwd, skills = [], allowedProjects, codexHome }) {
  if (!Array.isArray(skills) || skills.length > 20) throw new RelayError("INVALID_MESSAGE", "技能选择数量无效");
  const listed = await listSkills({ cwd, allowedProjects, codexHome });
  const byName = new Map(listed.data.map((skill) => [skill.name, skill]));
  return skills.map((value) => {
    const name = text(value?.name ?? value);
    const skill = byName.get(name);
    if (!skill) throw new RelayError("SKILL_NOT_FOUND", `找不到技能：${name}`);
    return skill;
  });
}

export function buildTurnContext(references, skills) {
  const lines = [];
  if (references.length) lines.push("工作区引用：", ...references.map((item) => `- ${item.relative}`));
  if (skills.length) lines.push("启用技能：", ...skills.map((item) => `- ${item.name}`));
  return lines.length ? `${lines.join("\n")}\n\n` : "";
}
