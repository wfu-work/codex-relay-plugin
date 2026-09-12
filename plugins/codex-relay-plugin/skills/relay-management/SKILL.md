---
name: relay-management
description: Configure, inspect, connect, disconnect, and diagnose the local Codex Relay connector when the user asks about Relay, remote Codex access, the Relay dashboard, Space status, or mobile connectivity.
---

# Codex Relay management

Use the plugin's MCP tools to manage the connector. Treat Relay tokens as secrets.

## Workflow

1. For configuration requests, call `relay_open_dashboard` and give the returned local URL to the user. Never ask the user to paste a Relay token into chat and never pass a token to another tool.
2. For state questions, call `relay_get_status` before answering. Explain the Relay and App Server states separately if either is not ready.
3. For connection requests, call `relay_connect`. If it fails, call `relay_diagnostics` and report the concrete failed check.
4. For a connection test, call `relay_test_connection`; this verifies the Protocol v1 `connect.hello` / `connect.welcome` handshake without keeping the test socket connected.
5. For disconnect requests, call `relay_disconnect`. Do not delete configuration.
6. Use `relay_update_config` only for non-secret fields explicitly supplied by the user. Direct token entry or rotation to the dashboard.

## Dashboard recovery actions

When the user needs to recover a connection, open the local dashboard and use
its **运行环境 → 运行维护** panel. The panel provides authenticated controls
to restart the plugin-managed App Server or Relay channel. The plugin always
owns its local App Server process; no desktop migration or shared Socket setup
is required.

## Safety

- Do not enable remote approvals or expand the project whitelist unless the user explicitly requests that change.
- Prefer read-only mode for first-time setup or an unverified Relay.
- Only give the complete loopback dashboard URL to the current user for opening it. Do not extract, repeat, log, or share its fragment access key; never display Relay tokens or unredacted connector internals.
- A configured token does not prove the Relay is reachable; distinguish configuration, authentication, and live connection states.
