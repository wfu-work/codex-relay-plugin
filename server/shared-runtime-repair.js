import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppServerClient } from "./app-server-client.js";
import { configuredSharedManifest } from "./shared-installation.js";
import { officialNode, verifyOfficialRuntime } from "./official-runtime.js";
import { checkCompatibility, ownedRuntime, openDesktop, plist, readJson, serviceDefinition, shellQuote, waitReady, writePrivate } from "./shared-backend-manager.js";

const exec = promisify(execFile);
const quiet = { info() {}, warn() {}, error() {} };
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));

// Fail closed on unknown status, pending approval/input, pagination errors or
// unreadable tasks. Listing metadata does not resume or acquire a task writer.
export async function sharedTasksIdle(client) {
  let cursor;
  const seen = new Set();
  do {
    const result = await client.request("thread/loaded/list", { limit: 100, ...(cursor ? { cursor } : {}) }, 3000);
    if (!Array.isArray(result.data)) return false;
    for (const threadId of result.data) {
      const { thread } = await client.request("thread/read", { threadId, includeTurns: false }, 3000);
      if (!["idle", "notLoaded"].includes(thread?.status?.type)) return false;
    }
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) return false;
    seen.add(cursor);
  } while (cursor);
  return true;
}

export async function repairSharedRuntime(environment, { checkpoint = async () => {}, onProgress = async () => {}, timeoutMs = 15 * 60_000, restart = replaceRuntime } = {}) {
  const manifest = await configuredSharedManifest(environment);
  if (!manifest || (await readJson(path.join(manifest.root, "activation.json"), null))?.phase !== "active") throw new Error("未找到当前已启用的共享安装");
  await verifyOfficialRuntime(manifest.desktopApp);
  await checkCompatibility(manifest);
  const runtime = await ownedRuntime(manifest);
  if (!runtime) throw new Error("无法确认共享进程归属，请重新检查环境");
  const client = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: manifest.endpoint } }) }, quiet, { initializeTimeoutMs: 3000 });
  const deadline = Date.now() + timeoutMs;
  try {
    await client.start();
    while (Date.now() < deadline) {
      await checkpoint();
      const current = await configuredSharedManifest(environment);
      if (current?.root !== manifest.root || (await ownedRuntime(manifest))?.identity !== runtime.identity) throw new Error("共享安装或进程已变化，请重新检查");
      const processes = await environment.inspectProcesses();
      if (processes.state !== "ok") throw new Error("无法确认桌面是否退出，已停止修复");
      if (processes.items.some(p => p.kind === "desktop" && p.scope !== "other")) {
        await onProgress("等待退出 Codex 桌面；退出后自动修复并重新打开。请勿从 Flutter 发起新任务，可随时取消。");
      } else if (!(await sharedTasksIdle(client))) {
        await onProgress("等待共享任务完成；不会中断执行、待审批或待回复的任务。");
      } else {
        await checkpoint();
        const config = await readJson(manifest.relayConfig);
        if (config.codex?.connectionMode !== "shared" || config.codex.appServerEndpoint !== manifest.endpoint) throw new Error("连接配置已变化，已停止修复");
        await onProgress("正在切换到官方签名运行时；完成后自动重新打开桌面。", { committing: true });
        await checkpoint();
        await restart(manifest, environment.pluginRoot, runtime);
        return;
      }
      await pause();
    }
    throw new Error("等待退出桌面已超时，未重启共享服务；可重新提交修复");
  } finally { await client.stop().catch(() => {}); }
}

export async function replaceRuntime(manifest, pluginRoot, expectedRuntime, dependencies = {}) {
  const run = dependencies.exec || exec;
  const owned = dependencies.ownedRuntime || ownedRuntime;
  const ready = dependencies.waitReady || waitReady;
  const open = dependencies.openDesktop || openDesktop;
  const domain = `gui/${process.getuid()}`;
  const target = `${domain}/${manifest.label}`;
  // Only replace the exact registered service, with a private rollback copy.
  const definition = JSON.parse((await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", manifest.launchAgent])).stdout);
  const expectedArgs = serviceDefinition(manifest).ProgramArguments.slice(1);
  if (definition.Label !== manifest.label || JSON.stringify(definition.ProgramArguments?.slice(1)) !== JSON.stringify(expectedArgs)) throw new Error("共享服务定义已改变，拒绝覆盖");
  if ((await owned(manifest))?.identity !== expectedRuntime.identity) throw new Error("共享进程已改变，已停止修复");
  const job = (await run("/bin/launchctl", ["print", target])).stdout;
  const parent = (await run("/bin/ps", ["-p", String(expectedRuntime.pid), "-o", "ppid="])).stdout.trim();
  if (!/^\d+$/.test(parent) || job.match(/^\s*pid = (\d+)\s*$/m)?.[1] !== parent) throw new Error("共享进程不属于当前注册服务，拒绝停止其他进程");
  const repaired = { ...manifest, node: officialNode(manifest.desktopApp) };
  const cli = path.join(manifest.root, "shared-backend-cli.js");
  const manifestFile = path.join(manifest.root, "manifest.json");
  const proxy = path.join(manifest.root, "codex-proxy");
  const files = [manifestFile, cli, proxy, manifest.launchAgent];
  const backup = path.join(manifest.root, "backups", `runtime-${Date.now()}`);
  await fs.mkdir(backup, { recursive: true, mode: 0o700 });
  for (const file of files) await fs.copyFile(file, path.join(backup, path.basename(file)));
  let stopped = false;
  const stop = async () => {
    await run("/bin/launchctl", ["bootout", target]);
    const deadline = Date.now() + 10000;
    while (await owned(manifest)) {
      if (Date.now() > deadline) throw new Error("共享服务停止超时，未启动第二个后端");
      await pause();
    }
  };
  try {
    await stop(); stopped = true;
    await writePrivate(cli, await fs.readFile(path.join(pluginRoot, "server/shared-backend-cli.js")));
    await writePrivate(manifestFile, `${JSON.stringify(repaired, null, 2)}\n`);
    await writePrivate(proxy, `#!/bin/sh\nexec ${shellQuote(repaired.node)} ${shellQuote(cli)} proxy --manifest ${shellQuote(manifestFile)} "$@"\n`);
    await fs.chmod(proxy, 0o700);
    await writePrivate(manifest.launchAgent, plist(serviceDefinition(repaired)));
    await run("/bin/launchctl", ["bootstrap", domain, manifest.launchAgent]);
    await ready(repaired);
    await open(repaired);
  } catch (error) {
    if (stopped) {
      const loaded = await run("/bin/launchctl", ["print", target]).then(() => true, () => false);
      if (loaded) await stop();
      for (const file of files) await fs.copyFile(path.join(backup, path.basename(file)), file);
      await fs.chmod(proxy, 0o700);
      await run("/bin/launchctl", ["bootstrap", domain, manifest.launchAgent]);
      await ready(manifest);
      await open(manifest);
    }
    throw error;
  }
}
