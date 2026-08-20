#!/usr/bin/env node
import { getRuntime, stopRuntime } from "./runtime.js";

const { dashboard } = await getRuntime();
console.log(`Codex Relay dashboard: ${dashboard.url()}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopRuntime();
    process.exit(0);
  });
}

