import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
  console.log(`生产 MCP 冒烟测试通过（${actualTools.length} 个工具）`);
} finally {
  await client.close().catch(() => {});
  await rm(configDir, { recursive: true, force: true });
}
