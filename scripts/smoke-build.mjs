import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readRuntimeInfo } from "../server/runtime.js";
import { WebSocketServer } from "ws";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "plugins", "codex-relay-plugin");
const configDir = await mkdtemp(path.join(os.tmpdir(), "codex-relay-build-"));
const expectedTools = [
  "relay_open_dashboard",
  "relay_get_status",
  "relay_connect",
  "relay_disconnect",
  "relay_test_connection",
  "relay_update_config",
  "relay_diagnostics",
  "relay_remote_control_status",
  "relay_remote_control_start",
  "relay_remote_control_install",
  "relay_remote_control_pair",
  "relay_remote_control_stop",
].sort();

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(buildRoot, "server", "mcp-server.js")],
  cwd: buildRoot,
  env: {
    ...process.env,
    CODEX_RELAY_CONFIG_DIR: configDir,
    // Keep the smoke process isolated from a developer's local dashboard on
    // the default port while preserving 3210 for normal runtime usage.
    CODEX_RELAY_DASHBOARD_PORT: "0",
  },
  stderr: "pipe",
});
const client = new Client({ name: "codex-relay-build-smoke", version: "1.0.0" });
let sharedBackend;

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const actualTools = listed.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
    throw new Error(`MCP 工具列表不匹配：${actualTools.join(", ")}`);
  }

  const status = await client.callTool({ name: "relay_get_status", arguments: {} });
  if (status.isError || !status.content?.some((item) => item.type === "text")) {
    throw new Error("relay_get_status 没有返回有效文本结果");
  }
  const remoteStatus = await client.callTool({ name: "relay_remote_control_status", arguments: {} });
  if (remoteStatus.isError || !remoteStatus.content?.some((item) => item.type === "text")) {
    throw new Error("relay_remote_control_status 没有返回有效文本结果");
  }
  sharedBackend = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise(resolve => sharedBackend.once("listening", resolve));
  const configured = await client.callTool({ name: "relay_update_config", arguments: {
    connectionMode: "shared", appServerEndpoint: `ws://127.0.0.1:${sharedBackend.address().port}`,
  } });
  if (configured.isError) throw new Error("生产包无法保存共享后端配置");
  const diagnostics = await client.callTool({ name: "relay_diagnostics", arguments: {} });
  const data = JSON.parse(diagnostics.content.find(item => item.type === "text").text);
  if (diagnostics.isError || !data.checks.some(check => check.name === "codex" && check.ok && check.connectionMode === "shared")) {
    throw new Error("生产包共享 WebSocket 连接诊断失败");
  }
  console.log(`生产 MCP 冒烟测试通过（${actualTools.length} 个工具）`);
} finally {
  await client.close().catch(() => {});
  if (sharedBackend) {
    for (const socket of sharedBackend.clients) socket.terminate();
    await new Promise(resolve => sharedBackend.close(resolve));
  }
  const agent = await readRuntimeInfo(configDir);
  if (agent?.pid && agent.pid !== process.pid) {
    try { process.kill(agent.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  await rm(configDir, { recursive: true, force: true });
}
