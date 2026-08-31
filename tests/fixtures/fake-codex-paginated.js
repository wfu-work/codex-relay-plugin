#!/usr/bin/env node
import readline from "node:readline";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.paginated-test\n");
  process.exit(0);
}

if (!process.argv.includes("app-server")) process.exit(2);

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let response;
  switch (message.method) {
    case "initialize":
      response = { userAgent: "fake-paginated-codex" };
      break;
    case "thread/read":
      response = message.params.includeTurns
        ? { error: { message: "paginated threads do not support thread/read(includeTurns=true)" } }
        : { result: { thread: { id: message.params.threadId, cwd: "/workspace/demo", turns: [] } } };
      break;
    case "thread/turns/list":
      response = {
        result: {
          data: [{
            id: "turn-1",
            status: "completed",
            itemsView: "full",
            items: [{ type: "agentMessage", id: "item-1", text: "分页历史加载成功" }],
          }],
          nextCursor: null,
        },
      };
      break;
    default:
      response = { result: {} };
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, ...response })}\n`);
});
