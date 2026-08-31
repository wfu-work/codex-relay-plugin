import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestPath = path.join(projectRoot, ".codex-plugin", "plugin.json");
const TIMESTAMP_PATTERN = /^\d{14}$/;

/**
 * Format a Date as the UTC cachebuster format used by Codex plugin versions.
 */
export function formatUtcTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function parseUtcTimestamp(timestamp) {
  if (!TIMESTAMP_PATTERN.test(timestamp)) {
    throw new Error(`版本时间戳必须是 14 位 UTC 数字：${timestamp}`);
  }

  const date = new Date(
    Date.UTC(
      Number(timestamp.slice(0, 4)),
      Number(timestamp.slice(4, 6)) - 1,
      Number(timestamp.slice(6, 8)),
      Number(timestamp.slice(8, 10)),
      Number(timestamp.slice(10, 12)),
      Number(timestamp.slice(12, 14)),
    ),
  );
  if (formatUtcTimestamp(date) !== timestamp) {
    throw new Error(`版本时间戳不是有效的 UTC 时间：${timestamp}`);
  }
  return date;
}

function nextUtcTimestamp(timestamp) {
  return formatUtcTimestamp(new Date(parseUtcTimestamp(timestamp).getTime() + 1000));
}

/**
 * Keep the semantic version prefix and replace all build metadata with one
 * Codex cachebuster. A repeated publish in the same second advances by one
 * second so it still produces a new version.
 */
export function createReleaseVersion(currentVersion, timestamp = formatUtcTimestamp(new Date())) {
  if (typeof currentVersion !== "string" || !currentVersion.trim()) {
    throw new Error("插件清单中的 version 必须是非空字符串");
  }

  const versionPrefix = currentVersion.split("+", 1)[0];
  if (!versionPrefix) {
    throw new Error(`插件版本缺少基础版本号：${currentVersion}`);
  }

  let cachebuster = String(timestamp).trim();
  parseUtcTimestamp(cachebuster);
  let nextVersion = `${versionPrefix}+codex.${cachebuster}`;
  if (nextVersion === currentVersion) {
    cachebuster = nextUtcTimestamp(cachebuster);
    nextVersion = `${versionPrefix}+codex.${cachebuster}`;
  }
  return nextVersion;
}

/**
 * Update only the top-level manifest version while preserving the file's
 * existing formatting and escaped Unicode representation.
 */
export function updateManifestSource(source, timestamp) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new Error(`插件清单不是有效 JSON：${error.message}`);
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("插件清单必须是 JSON 对象");
  }

  const currentVersion = manifest.version;
  const nextVersion = createReleaseVersion(currentVersion, timestamp);
  const matches = [...source.matchAll(/"version"\s*:\s*"([^"]*)"/g)];
  if (matches.length !== 1) {
    throw new Error(`插件清单应包含且仅包含一个 version 字段，实际找到 ${matches.length} 个`);
  }

  const match = matches[0];
  const valueStart = match.index + match[0].indexOf(match[1]);
  const valueEnd = valueStart + match[1].length;
  const updatedSource = `${source.slice(0, valueStart)}${nextVersion}${source.slice(valueEnd)}`;

  try {
    JSON.parse(updatedSource);
  } catch (error) {
    throw new Error(`更新后的插件清单不是有效 JSON：${error.message}`);
  }

  return {
    source: updatedSource,
    previousVersion: currentVersion,
    nextVersion,
  };
}

export async function updateVersion(manifestPath = defaultManifestPath) {
  const source = await readFile(manifestPath, "utf8");
  const timestamp = process.env.VERSION_TIMESTAMP?.trim() || formatUtcTimestamp(new Date());
  const result = updateManifestSource(source, timestamp);
  await writeFile(manifestPath, result.source, "utf8");
  console.log(`已更新插件版本：${result.previousVersion} -> ${result.nextVersion}`);
  return result;
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    await updateVersion();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
