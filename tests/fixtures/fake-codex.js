#!/usr/bin/env node
import readline from "node:readline";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.test\n");
  process.exit(0);
}

if (!process.argv.includes("app-server")) process.exit(2);

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let result = {};
  if (message.method === "initialize") result = { userAgent: "fake-codex" };
  if (message.method === "thread/list") result = { data: [] };
  if (message.method === "model/list") result = {
    data: [{ model: "remote-model", displayName: "Remote Model", isDefault: true }],
    nextCursor: null,
  };
  if (message.method === "turn/start") result = { received: message.params };
  if (message.method === "turn/steer") result = { received: message.params };
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
});
