import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { checkCompatibility, defaultManifest, digest, plist, shellQuote, writePrivate } from "../server/shared-backend-manager.js";

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
await checkCompatibility(manifest);
const installed = JSON.parse(await fs.readFile(path.join(manifest.pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
if (installed.name !== "codex-relay-plugin") throw new Error("目标目录不是 codex-relay-plugin");
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const production = path.join(project, "plugins/codex-relay-plugin");
await fs.access(path.join(production, "server/shared-backend-cli.js"));
// Never overwrite an activated bundle or partial install. Preparation is inert.
await fs.mkdir(root, { mode: 0o700 });
await fs.copyFile(path.join(production, "server/shared-backend-cli.js"), path.join(root, "shared-backend-cli.js"));
await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}\n', { mode: 0o600 });
await fs.cp(production, path.join(root, "plugin"), { recursive: true });
await writePrivate(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const command = operation => `${shellQuote(manifest.node)} ${shellQuote(path.join(root, "shared-backend-cli.js"))} ${operation} --manifest ${shellQuote(path.join(root, "manifest.json"))}`;
await fs.writeFile(path.join(root, "codex-proxy"), `#!/bin/sh\nexec ${command("proxy")} "$@"\n`, { mode: 0o700 });
for (const [name, action] of [["启用共享后端.command", "activate"], ["恢复独立后端.command", "rollback"], ["查看共享状态.command", "status"]]) {
  await fs.writeFile(path.join(root, name), `#!/bin/sh\n${command(action)}\nresult=$?\nprintf '\\n按回车关闭窗口…'\nread -r reply\nexit "$result"\n`, { mode: 0o700 });
}
const app = path.join(root, "Codex Shared.app/Contents");
await fs.mkdir(path.join(app, "MacOS"), { recursive: true });
await fs.writeFile(path.join(app, "Info.plist"), plist({ CFBundleIdentifier: "com.recodex.shared-launcher", CFBundleName: "Codex Shared", CFBundleExecutable: "launch", CFBundlePackageType: "APPL", CFBundleVersion: "1", LSUIElement: true }));
await fs.writeFile(path.join(app, "MacOS/launch"), `#!/bin/sh\n${command("desktop")} >> ${shellQuote(path.join(root, "launcher.log"))} 2>&1\nresult=$?\nif [ "$result" -ne 0 ]; then\n  /usr/bin/osascript -e 'display alert "Codex Shared 未能启动" message "请先启用共享后端，并通过启动包中的“查看共享状态”检查连接；详细原因见 launcher.log。" as critical'\nfi\nexit "$result"\n`, { mode: 0o700 });
await writePrivate(path.join(root, "使用说明.txt"), `准备完成，尚未切换。\n\n1. 完成运行中的任务，完全退出桌面 Codex，停止旧 Relay。\n2. 双击“启用共享后端.command”：备份历史/配置/插件，再安装本机共享服务和插件。\n3. 打开“Codex Shared.app”。${manifest.originalIcon ? "之后也可使用原来的桌面图标（启动环境在登录后由 LaunchAgent 恢复）。" : "本启动包没有修改原图标的环境。"}\n4. 双端打开同一任务，验证输入、输出和桌面工具。\n\n回滚：退出桌面、停止 Relay，双击“恢复独立后端.command”。保留全部新历史；恢复连接字段、启动环境和本次覆盖的插件版本。\n更新桌面版本或 CLI 二进制后，共享启动会拒绝继续；需重新验证兼容性。\nCODEX_HOME：${manifest.codexHome}\n共享端点：${manifest.endpoint}\n本机服务使用实验性 Codex App Server。\n`);
console.log(JSON.stringify({ prepared: true, activated: false, root, endpoint: manifest.endpoint, codexHome: manifest.codexHome, originalIcon: manifest.originalIcon }, null, 2));
