import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(projectRoot, ".codex-plugin", "plugin.json"), "utf8"));
const outputRoot = path.join(projectRoot, "plugins", manifest.name);
const expectedOutput = path.join(projectRoot, "plugins", "codex-relay-plugin");

if (outputRoot !== expectedOutput) {
  throw new Error(`拒绝写入非预期构建目录：${outputRoot}`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, ".codex-plugin"), { recursive: true });
await mkdir(path.join(outputRoot, "server"), { recursive: true });

for (const directory of ["assets", "ui", "schemas", "skills"]) {
  await cp(path.join(projectRoot, directory), path.join(outputRoot, directory), { recursive: true });
}

for (const file of [".mcp.json", "README.md", "LICENSE"]) {
  await cp(path.join(projectRoot, file), path.join(outputRoot, file));
}
await cp(
  path.join(projectRoot, ".codex-plugin", "plugin.json"),
  path.join(outputRoot, ".codex-plugin", "plugin.json"),
);

const sharedBuildOptions = {
  absWorkingDir: projectRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
};

await Promise.all([
  build({
    ...sharedBuildOptions,
    entryPoints: ["server/mcp-server.js"],
    outfile: path.join(outputRoot, "server", "mcp-server.js"),
  }),
  build({
    ...sharedBuildOptions,
    entryPoints: ["server/dashboard-cli.js"],
    outfile: path.join(outputRoot, "server", "dashboard-cli.js"),
  }),
]);

const productionPackage = {
  name: manifest.name,
  version: manifest.version,
  private: true,
  type: "module",
  description: manifest.description,
  engines: { node: ">=22" },
};
await writeFile(path.join(outputRoot, "package.json"), `${JSON.stringify(productionPackage, null, 2)}\n`, "utf8");

console.log(`生产插件已生成：${path.relative(projectRoot, outputRoot)}`);
