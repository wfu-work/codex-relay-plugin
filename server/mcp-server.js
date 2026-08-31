#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getRuntime, stopRuntime } from "./runtime.js";

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
    description: "Start the local Codex App Server if configured and connect this host to Relay.",
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

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopRuntime();
    process.exit(0);
  });
}
