#!/usr/bin/env node
import { getRuntime, stopRuntime } from "./runtime.js";

try {
  const runtime = await getRuntime();
  if (runtime.remote) {
    // Another agent won the race. This process must not keep a duplicate
    // dashboard or connector alive.
    process.exit(0);
  }
} catch (error) {
  console.error(`[codex-relay-agent] ${error.message}`);
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopRuntime().catch((error) => console.error(`[codex-relay-agent] shutdown: ${error.message}`));
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => shutdown(0));
}

// Deliberately do not subscribe to stdin close/end. The agent is detached and
// must survive MCP reloads and Dashboard CLI exits.
