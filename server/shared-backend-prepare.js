import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkCompatibility, digest, plist, shellQuote, writePrivate } from "./shared-backend-manager.js";

// Preparation only writes a new, inactive package. It never edits live
// configuration, launchd, the installed plugin, or the user's history.
export async function prepareSharedBackend(manifest, production, { checkpoint = async () => {}, verify = checkCompatibility } = {}) {
  await checkpoint();
  await verify(manifest);
  if (await fs.lstat(manifest.root).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) {
    throw new Error("准备包目录已存在，请创建新的准备包，原目录保持不变");
  }
  const installed = JSON.parse(await fs.readFile(path.join(manifest.pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  if (installed.name !== "codex-relay-plugin") throw new Error("目标目录不是 codex-relay-plugin");
  const bundle = path.join(production, "server/shared-backend-cli.js");
  const bundleHash = await digest(bundle);
  const stage = `${manifest.root}.preparing-${randomUUID().slice(0, 8)}`;
  await fs.mkdir(stage, { recursive: false, mode: 0o700 });
  try {
    await fs.copyFile(bundle, path.join(stage, "shared-backend-cli.js"));
    await fs.writeFile(path.join(stage, "package.json"), '{"type":"module"}\n', { mode: 0o600 });
    await fs.cp(production, path.join(stage, "plugin"), { recursive: true, filter: async () => { await checkpoint(); return true; } });
    await writePrivate(path.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const command = operation => `${shellQuote(manifest.node)} ${shellQuote(path.join(manifest.root, "shared-backend-cli.js"))} ${operation} --manifest ${shellQuote(path.join(manifest.root, "manifest.json"))}`;
    await fs.writeFile(path.join(stage, "codex-proxy"), `#!/bin/sh\nexec ${command("proxy")} "$@"\n`, { mode: 0o700 });
    for (const [name, action] of [["启用共享后端.command", "activate"], ["恢复独立后端.command", "rollback"], ["查看共享状态.command", "status"]]) {
      await fs.writeFile(path.join(stage, name), `#!/bin/sh\n${command(action)}\nresult=$?\nprintf '\\n按回车关闭窗口…'\nread -r reply\nexit "$result"\n`, { mode: 0o700 });
    }
    const app = path.join(stage, "Codex Shared.app/Contents");
    await fs.mkdir(path.join(app, "MacOS"), { recursive: true });
    await fs.writeFile(path.join(app, "Info.plist"), plist({ CFBundleIdentifier: "com.recodex.shared-launcher", CFBundleName: "Codex Shared", CFBundleExecutable: "launch", CFBundlePackageType: "APPL", CFBundleVersion: "1", LSUIElement: true }));
    await fs.writeFile(path.join(app, "MacOS/launch"), `#!/bin/sh\n${command("desktop")} >> ${shellQuote(path.join(manifest.root, "launcher.log"))} 2>&1\nresult=$?\nif [ "$result" -ne 0 ]; then\n  /usr/bin/osascript -e 'display alert "Codex Shared 未能启动" message "请先检查准备包的兼容性与共享服务状态；详细原因见 launcher.log。" as critical'\nfi\nexit "$result"\n`, { mode: 0o700 });
    await writePrivate(path.join(stage, "使用说明.txt"), `准备完成，尚未切换。\n\n准备包不会修改当前连接、结束进程或复制任务历史。\n桌面与 CLI 版本匹配不代表桌面工具的签名兼容性已通过。请先解决控制台检查报告中的切换阻塞，再进行正式验收。\n启用脚本会检查占用，备份历史、配置与插件，然后启动共享服务。回滚只恢复连接设置与本次替换的插件，保留新任务历史。\n原桌面图标启动：${manifest.originalIcon ? "启用后保持原图标" : "使用 Codex Shared.app"}\nCODEX_HOME：${manifest.codexHome}\n共享端点：${manifest.endpoint}\n`);
    await checkpoint();
    if (await digest(bundle) !== bundleHash || await digest(path.join(stage, "shared-backend-cli.js")) !== bundleHash) throw new Error("准备期间插件构建发生变化，请重新检查");
    await verify(manifest);
    await checkpoint();
    // A completed directory is only published after all files are ready.
    // Jobs use unique destinations; existing activation/history is untouched.
    await fs.rename(stage, manifest.root);
    return { root: manifest.root, endpoint: manifest.endpoint, codexHome: manifest.codexHome, createdAt: new Date().toISOString(), activated: false };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
