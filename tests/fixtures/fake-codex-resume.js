#!/usr/bin/env node
import readline from "node:readline";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.resume-test\n");
  process.exit(0);
}

if (!process.argv.includes("app-server")) process.exit(2);

let resumed = false;
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { userAgent: "fake-resume-codex" } })}\n`);
    return;
  }
  if (message.method === "thread/resume") {
    resumed = true;
    process.stdout.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: { thread: { id: message.params.threadId, status: { type: "idle" } } },
    })}\n`);
    return;
  }
  if (message.method === "turn/start" && !resumed) {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32000, message: "thread not found: thread-historical" },
    })}\n`);
    return;
  }
  const result = message.method === "turn/start"
    ? { received: message.params }
    : {};
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
});
