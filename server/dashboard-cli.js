#!/usr/bin/env node
import { ensureAgent } from "./agent-launcher.js";
import { getRuntime, stopRuntime } from "./runtime.js";

await ensureAgent();
const runtime = await getRuntime();
const { dashboard } = runtime;
console.log(`Codex Relay dashboard: ${dashboard.url()}`);
if (runtime.remote) process.exit(0);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopRuntime();
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, shutdown);
process.stdin.once("close", shutdown);
process.stdin.once("end", shutdown);
