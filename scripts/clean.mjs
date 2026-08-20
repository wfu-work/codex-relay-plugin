import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "plugins", "codex-relay-plugin");

if (path.dirname(outputRoot) !== path.join(projectRoot, "plugins")) {
  throw new Error(`拒绝清理非预期目录：${outputRoot}`);
}

await rm(outputRoot, { recursive: true, force: true });
console.log("已清理生产构建目录：plugins/codex-relay-plugin");
