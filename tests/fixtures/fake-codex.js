#!/usr/bin/env node
import readline from "node:readline";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.test\n");
  process.exit(0);
}

if (!process.argv.includes("app-server")) process.exit(2);

const lines = readline.createInterface({ input: process.stdin });
const resumedThreads = new Set();
const resumeCounts = new Map();
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let result = {};
  if (message.method === "initialize") result = { userAgent: "fake-codex" };
  if (message.method === "thread/list") {
    result = message.params.cursor === "page-2"
      ? {
          data: [{ id: "thread-2", cwd: "/workspace/two" }],
          nextCursor: null,
        }
      : {
          data: [{ id: "thread-1", cwd: "/workspace/one" }],
          nextCursor: "page-2",
        };
  }
  if (message.method === "thread/resume") {
    if (message.params.threadId === "thread-active-writer") {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { message: "thread thread-active-writer already has an active writer" },
      })}\n`);
      return;
    }
    resumedThreads.add(message.params.threadId);
    resumeCounts.set(
      message.params.threadId,
      (resumeCounts.get(message.params.threadId) || 0) + 1,
    );
    result = { thread: { id: message.params.threadId } };
  }
  if (message.method === "thread/read") {
    result = {
      thread: {
        id: message.params.threadId,
        cwd: "/workspace/one",
        status: { type: "active", activeFlags: [] },
        statusProbe: message.params.includeTurns === false,
        resumed: resumedThreads.has(message.params.threadId),
        resumeCount: resumeCounts.get(message.params.threadId) || 0,
      },
    };
  }
  if (message.method === "model/list") result = {
    data: [{ model: "remote-model", displayName: "Remote Model", isDefault: true }],
    nextCursor: null,
  };
  if (message.method === "turn/start") result = { received: message.params };
  if (message.method === "turn/steer") result = { received: message.params };
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
});
