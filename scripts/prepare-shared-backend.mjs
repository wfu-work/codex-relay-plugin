import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { defaultManifest, digest } from "../server/shared-backend-manager.js";
import { prepareSharedBackend } from "../server/shared-backend-prepare.js";

const options = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--original-icon") options.originalIcon = true;
  else if (["--root", "--codex-home", "--relay-config", "--relay-agent", "--desktop-app", "--desktop-profile"].includes(args[i]) && args[i + 1]) options[args[i].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[++i];
  else throw new Error("用法：prepare-shared-backend.mjs --relay-agent /已安装插件/server/agent-cli.js [--root /安装目录] [--original-icon]");
}
if (!path.isAbsolute(options.relayAgent || "")) throw new Error("请用 --relay-agent 指定当前已安装插件的绝对路径");
const root = path.resolve(options.root || path.join(os.homedir(), "Library/Application Support/Recodex Shared Backend"));
const manifest = defaultManifest(root, options);
manifest.binaryHash = await digest(manifest.binary);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log(JSON.stringify({ prepared: true, ...await prepareSharedBackend(manifest, path.join(project, "plugins/codex-relay-plugin")) }, null, 2));
