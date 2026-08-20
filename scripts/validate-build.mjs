import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "plugins", "codex-relay-plugin");

const expectedFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "assets/codex-relay-logo.png",
  "assets/codex-relay-logo.svg",
  "server/mcp-server.js",
  "server/dashboard-cli.js",
  "ui/index.html",
  "schemas/relay-protocol.schema.json",
  "skills/relay-management/SKILL.md",
  "README.md",
  "LICENSE",
  "package.json",
];

await Promise.all(expectedFiles.map((file) => access(path.join(outputRoot, file))));

const sourceManifest = JSON.parse(await readFile(path.join(projectRoot, ".codex-plugin", "plugin.json"), "utf8"));
const buildManifest = JSON.parse(await readFile(path.join(outputRoot, ".codex-plugin", "plugin.json"), "utf8"));
const buildPackage = JSON.parse(await readFile(path.join(outputRoot, "package.json"), "utf8"));
const marketplace = JSON.parse(await readFile(path.join(projectRoot, ".agents", "plugins", "marketplace.json"), "utf8"));
const marketplacePlugin = marketplace.plugins?.find((plugin) => plugin.name === sourceManifest.name);

if (buildManifest.name !== sourceManifest.name || buildManifest.version !== sourceManifest.version) {
  throw new Error("生产插件清单与源码清单的名称或版本不一致");
}
if (buildPackage.dependencies || buildPackage.devDependencies) {
  throw new Error("生产插件不应依赖 node_modules");
}
if (marketplacePlugin?.source?.source !== "local" || marketplacePlugin.source.path !== "./plugins/codex-relay-plugin") {
  throw new Error("marketplace.json 没有指向生产插件目录");
}

for (const relativeFile of ["server/mcp-server.js", "server/dashboard-cli.js"]) {
  const file = path.join(outputRoot, relativeFile);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${relativeFile} 语法校验失败：\n${result.stderr || result.stdout}`);
  }
  const bundle = await readFile(file, "utf8");
  if (/^\s*import\s.+from\s+["']@modelcontextprotocol\/sdk/m.test(bundle)) {
    throw new Error(`${relativeFile} 仍包含未打包的 MCP SDK 导入`);
  }
}

console.log(`生产构建校验通过（${expectedFiles.length} 个关键文件）`);
