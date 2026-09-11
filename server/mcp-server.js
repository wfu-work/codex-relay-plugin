#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ensureAgent } from "./agent-launcher.js";
import { getRuntime, stopRuntime } from "./runtime.js";

await ensureAgent();
const { service, dashboard } = await getRuntime();
const server = new Server(
  { name: "codex-relay-plugin", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const tools = [
  {
    name: "relay_open_dashboard",
    description: "Return the authenticated local-only Codex Relay configuration dashboard URL.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_get_status",
    description: "Get Relay, Connector, App Server, Space, and security status without exposing secrets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_connect",
    description: "Prepare the configured managed or shared Codex App Server connection and connect this host to Relay.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_disconnect",
    description: "Disconnect this host from Relay without deleting configuration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_test_connection",
    description: "Open a temporary Relay connection and verify the Protocol v1 connect.hello/connect.welcome authentication handshake.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_update_config",
    description: "Update non-secret Relay configuration. Enter or rotate the token in the local dashboard, not in chat.",
    inputSchema: {
      type: "object",
      properties: {
        relayUrl: { type: "string", description: "Relay WebSocket URL." },
        spaceId: { type: "string", description: "Relay Space ID." },
        endpointId: { type: "string", description: "Relay Endpoint ID bound to the Connect Token." },
        deviceName: { type: "string" },
        autoConnect: { type: "boolean" },
        connectionMode: { type: "string", enum: ["managed", "shared"], description: "Manage a private process or attach to an existing shared backend." },
        appServerEndpoint: { type: "string", description: "Local shared App Server ws://, wss:// or unix:// endpoint; no credentials." },
        readOnly: { type: "boolean" },
        allowedProjects: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "relay_diagnostics",
    description: "Run local Codex availability and configuration checks and return redacted logs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_remote_control_status",
    description: "Detect the official Codex Remote Control installation and the authorized desktop bridge without exposing credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_remote_control_start",
    description: "Start the official Codex Remote Control daemon when its standalone installation is available.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_remote_control_install",
    description: "Install the official Codex standalone runtime from the fixed official installer URL after an explicit user request.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_remote_control_pair",
    description: "Request a short-lived official Remote Control pairing code; the code is returned only to this caller.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "relay_remote_control_stop",
    description: "Stop the official Codex Remote Control daemon started for this user.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  try {
    let result;
    switch (request.params.name) {
      case "relay_open_dashboard":
        result = {
          url: dashboard.url(),
          note: "This URL contains a process-scoped local access key. Do not share it. It is reachable only from this computer.",
        };
        break;
      case "relay_get_status":
        result = await service.status();
        break;
      case "relay_connect":
        result = await service.connect();
        break;
      case "relay_disconnect":
        result = await service.disconnect();
        break;
      case "relay_test_connection":
        result = await service.testConnection();
        break;
      case "relay_update_config":
        result = await service.updateConfig({
          ...(args.connectionMode !== undefined || args.appServerEndpoint !== undefined ? { codex: {
            ...(args.connectionMode !== undefined ? { connectionMode: args.connectionMode } : {}),
            ...(args.appServerEndpoint !== undefined ? { appServerEndpoint: args.appServerEndpoint } : {}),
          } } : {}),
          ...(args.relayUrl !== undefined || args.spaceId !== undefined || args.endpointId !== undefined || args.deviceName !== undefined || args.autoConnect !== undefined
            ? {
                relay: {
                  ...(args.relayUrl !== undefined ? { url: args.relayUrl } : {}),
                  ...(args.spaceId !== undefined ? { spaceId: args.spaceId } : {}),
                  ...(args.endpointId !== undefined ? { endpointId: args.endpointId } : {}),
                  ...(args.deviceName !== undefined ? { deviceName: args.deviceName } : {}),
                  ...(args.autoConnect !== undefined ? { autoConnect: args.autoConnect } : {}),
                },
              }
            : {}),
          ...(args.readOnly !== undefined ? { readOnly: args.readOnly } : {}),
          ...(args.allowedProjects !== undefined ? { allowedProjects: args.allowedProjects } : {}),
        });
        break;
      case "relay_diagnostics":
        result = await service.diagnostics();
        break;
      case "relay_remote_control_status":
        result = await service.remoteControlStatus();
        break;
      case "relay_remote_control_start":
        result = await service.remoteControlStart();
        break;
      case "relay_remote_control_install":
        result = await service.remoteControlInstall();
        break;
      case "relay_remote_control_pair":
        result = await service.remoteControlPair();
        break;
      case "relay_remote_control_stop":
        result = await service.remoteControlStop();
        break;
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ code: error.code || "INTERNAL_ERROR", message: error.message }, null, 2) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopRuntime();
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, shutdown);
// Codex closes the MCP stdio pipe when it reloads a plugin. Treat that as a
// real lifecycle event so the owner releases its lock, Dashboard and children.
process.stdin.once("close", shutdown);
process.stdin.once("end", shutdown);
