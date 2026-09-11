import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { checkCompatibility, defaultManifest, digest } from "./shared-backend-manager.js";

export async function preparationFingerprint(context) {
  const hash = createHash("sha256");
  for (const file of [path.join(context.configDir, "config.json"), ...["package.json", ".codex-plugin/plugin.json", "server/agent-cli.js", "server/shared-backend-cli.js", "server/migration-cli.js", "ui/index.html"].map(file => path.join(context.pluginRoot, file))]) {
    hash.update(file).update("\0").update(await fs.readFile(file)).update("\0");
  }
  hash.update(context.codexHome);
  return hash.digest("hex");
}

export async function inspectPreparation(context, { environment, checkpoint = async () => {}, onProgress = async () => {}, verify = checkCompatibility, platform = process.platform } = {}) {
  const checks = [];
  const add = async (id, title, state, detail, scope = "prepare") => {
    checks.push({ id, title, state, detail, scope });
    await onProgress({ checks: [...checks] });
    await checkpoint();
  };
  await add("platform", "系统支持", platform === "darwin" ? "passed" : "blocked", platform === "darwin" ? "macOS 支持生成共享后端准备包" : "迁移准备目前仅支持 macOS");
  const env = await environment.inspect(true);
  await checkpoint();
  await add("executable", "Codex 执行路径", env.executable.state === "ok" && !env.executable.needsRepair ? "passed" : "blocked", env.executable.state === "ok" && !env.executable.needsRepair ? "已使用验证过的完整路径" : "请先修复执行路径，再准备迁移");
  let fingerprint = null;
  try {
    const installed = JSON.parse(await fs.readFile(path.join(context.pluginRoot, "package.json"), "utf8"));
    if (installed.name === "codex-relay-plugin" && !installed.dependencies && !installed.devDependencies) fingerprint = await preparationFingerprint(context);
  }
  catch { /* Missing bundles/config are reported below, without raw file errors. */ }
  await add("plugin", "插件安装文件", fingerprint ? "passed" : "blocked", fingerprint ? "已记录当前配置与插件构建，用于检测准备期间的变化" : "安装文件或配置不完整，请先重新构建或更新插件");
  let manifest = null;
  try {
    const configured = env.executable.resolved || "";
    const desktopApp = configured.match(/^(.*\.app)\/Contents\/Resources\/codex$/)?.[1]
      || env.processes.items.find(item => item.kind === "desktop" && item.scope === "same")?.appPath || "/Applications/ChatGPT.app";
    manifest = defaultManifest(context.packageRoot, { desktopApp, codexHome: context.codexHome, relayConfig: path.join(context.configDir, "config.json"), relayAgent: path.join(context.pluginRoot, "server/agent-cli.js"), originalIcon: true });
    manifest.activationBlocked = true;
    manifest.binaryHash = await digest(manifest.binary);
    const compatibility = await verify(manifest);
    await add("versions", "桌面与 CLI 版本", "passed", `${compatibility?.desktopVersion || "当前桌面版本"} / ${compatibility?.cliVersion || "当前 CLI 版本"}，满足最低启动器兼容要求；桌面工具需单独验收`);
  } catch {
    manifest = null;
    await add("versions", "桌面与 CLI 版本", "blocked", "桌面、CLI 或安装路径不符合当前启动器要求，请更新兼容实现后重新检查");
  }
  const config = environment.service.configStore.get();
  const cwd = config.codex.defaultWorkingDirectory;
  const directories = [context.codexHome, ...(cwd ? [cwd] : [])];
  const directoriesReady = await Promise.all(directories.map(directory => fs.stat(directory).then(stat => stat.isDirectory(), () => false)));
  await add("directories", "数据与工作目录", directoriesReady.every(Boolean) ? "passed" : "blocked", directoriesReady.every(Boolean) ? "继续使用当前 Codex 数据目录；准备过程不修改任务历史" : "Codex 数据目录或默认工作目录不存在");
  const spaceReady = await fs.statfs(path.join(context.configDir, "migration")).then(stat => stat.bavail * stat.bsize >= 64 * 1024 * 1024, () => false);
  await add("space", "准备包空间", spaceReady ? "passed" : "blocked", spaceReady ? "准备目录至少有 64 MB 可用空间；正式历史备份需另行检查" : "无法确认准备目录空间，或可用空间不足 64 MB");
  const related = env.processes.items.filter(item => item.scope !== "other");
  await add("processes", "运行中的客户端", env.processes.state === "ok" ? "warning" : "blocked", env.processes.state === "ok" ? `检测到 ${related.length} 个相关进程。准备可继续；正式切换前需结束任务并重新检查占用` : "无法确认进程占用，正式切换前必须重新检查", "activation");
  const failedTools = env.migration.last?.failedPhase === "verifying_shared_runtime";
  await add("desktop_tools", "桌面工具兼容性", env.desktopTools?.state === "passed" ? "passed" : "blocked", env.desktopTools?.message || (failedTools ? "上次桌面工具验收失败，需先解决签名或工具连接兼容问题" : "尚未通过真实桌面工具验收，版本匹配不能证明两端共用可用"), "activation");
  await add("activation", "正式切换", "blocked", "本准备包尚不允许激活；准备完成后仍须解决切换阻塞并完成真实桌面验收", "activation");
  const readyToPrepare = checks.every(check => check.scope !== "prepare" || check.state !== "blocked");
  return { report: { checkedAt: new Date().toISOString(), checks, readyToPrepare, readyToActivate: false }, manifest, fingerprint };
}
