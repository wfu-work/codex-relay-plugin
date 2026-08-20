import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function nowIso() {
  return new Date().toISOString();
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function parseJson(value, label = "JSON") {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} 解析失败：${error.message}`);
  }
}

export function redact(value) {
  if (typeof value === "string") {
    return value
      .replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]")
      .replace(/("?(?:token|secret|authorization|api[_-]?key)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[REDACTED]");
  }
  return JSON.parse(redact(JSON.stringify(value)));
}

export function normalizeRelayUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Relay 地址必须使用 ws:// 或 wss://");
  }
  if (!url.hostname) throw new Error("Relay 地址缺少主机名");
  return url.toString();
}

export function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "localhost"].includes(hostname);
}

export function safeProjectPath(projectPath, allowedProjects) {
  if (!projectPath) return null;
  const candidate = path.resolve(projectPath);
  if (!allowedProjects?.length) return candidate;
  const allowed = allowedProjects.some((root) => {
    const normalizedRoot = path.resolve(root);
    const relative = path.relative(normalizedRoot, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  return allowed ? candidate : null;
}

export function filterThreadList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((thread) => Boolean(thread?.cwd && safeProjectPath(thread.cwd, allowedProjects))),
  };
}
