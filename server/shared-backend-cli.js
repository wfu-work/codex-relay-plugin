import path from "node:path";
import { spawn } from "node:child_process";
import { bindDesktopPipe, desktopInvocation, proxyDesktop, refreshDesktopTools } from "./desktop-proxy.js";
import { activate, backendStatus, checkCompatibility, openDesktop, readJson, rollback, runService, waitReady } from "./shared-backend-manager.js";

const [command, flag, manifestPath, ...args] = process.argv.slice(2);
try {
  if (flag !== "--manifest" || !path.isAbsolute(manifestPath || "")) throw new Error("用法：shared-backend-cli.js <activate|status|desktop|rollback|service|proxy> --manifest /绝对路径/manifest.json");
  const manifest = await readJson(manifestPath);
  if (path.dirname(manifestPath) !== manifest.root) throw new Error("启动包位置已改变，请重新生成启动包");
  if (command === "service") await runService(manifest);
  else if (command === "activate") console.log(JSON.stringify(await activate(manifest), null, 2));
  else if (command === "status") console.log(JSON.stringify(await backendStatus(manifest), null, 2));
  else if (command === "rollback") console.log(JSON.stringify(await rollback(manifest), null, 2));
  else if (command === "desktop") await openDesktop(manifest);
  else if (command === "proxy") {
    const overrides = desktopInvocation(args);
    if (overrides === null) {
      // Other CLI functions retain the installed official executable.
      const env = { ...process.env };
      delete env.CODEX_CLI_PATH;
      const child = spawn(manifest.binary, args, { env, stdio: "inherit" });
      for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
      process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
    } else {
      await checkCompatibility(manifest);
      await waitReady(manifest);
      // Stdin closing only releases this subscription; the service owns Codex.
      const config = await bindDesktopPipe(manifest.root, overrides);
      await refreshDesktopTools(manifest.endpoint);
      await proxyDesktop({ endpoint: manifest.endpoint, config });
    }
  } else throw new Error("未知共享后端操作");
} catch (error) {
  // Avoid exposing spawn args / desktop MCP environment in errors.
  console.error(error.code ? `共享后端操作失败 (${error.code})` : error.message);
  process.exitCode = 1;
}
