---
name: relay-management
description: Configure, inspect, connect, disconnect, and diagnose the local Codex Relay connector when the user asks about Relay, remote Codex access, the Relay dashboard, room status, or mobile connectivity.
---

# Codex Relay management

Use the plugin's MCP tools to manage the connector. Treat Relay tokens as secrets.

## Workflow

1. For configuration requests, call `relay_open_dashboard` and give the returned local URL to the user. Never ask the user to paste a Relay token into chat and never pass a token to another tool.
2. For state questions, call `relay_get_status` before answering. Explain the Relay and App Server states separately if either is not ready.
3. For connection requests, call `relay_connect`. If it fails, call `relay_diagnostics` and report the concrete failed check.
4. For a connection test, call `relay_test_connection`; this verifies the `host.hello` / `host.welcome` handshake without keeping the test socket connected.
5. For disconnect requests, call `relay_disconnect`. Do not delete configuration.
6. Use `relay_update_config` only for non-secret fields explicitly supplied by the user. Direct token entry or rotation to the dashboard.

## Safety

- Do not enable remote approvals or expand the project whitelist unless the user explicitly requests that change.
- Prefer read-only mode for first-time setup or an unverified Relay.
- Only give the complete loopback dashboard URL to the current user for opening it. Do not extract, repeat, log, or share its fragment access key; never display Relay tokens or unredacted connector internals.
- A configured token does not prove the Relay is reachable; distinguish configuration, authentication, and live connection states.
