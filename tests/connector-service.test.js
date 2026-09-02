import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorService } from "../server/connector-service.js";
import { defaultConfig } from "../server/config-store.js";

test("event access checks use the metadata status read without blocking deltas", async () => {
  const config = defaultConfig();
  config.allowedProjects = ["/workspace/allowed"];
  const appServer = new EventEmitter();
  const relay = new EventEmitter();
  const calls = [];
  appServer.readThreadStatus = async (threadId) => {
    calls.push(["status", threadId]);
    return { thread: { id: threadId, cwd: "/workspace/allowed/demo", status: { type: "active" } } };
  };
  appServer.readThread = async (threadId) => {
    calls.push(["read", threadId]);
    return { thread: { id: threadId, cwd: "/workspace/allowed/demo" } };
  };
  relay.send = (message) => {
    calls.push(["send", message.event?.type]);
    return true;
  };

  const service = new ConnectorService({
    configStore: { get: () => config },
    appServer,
    relay,
    logger: { info() {}, warn() {}, error() {} },
  });
  appServer.emit("notification", "item/agentMessage/delta", {
    threadId: "thread-1",
    turnId: "turn-1",
    delta: "hello",
  });
  await service.eventQueue;

  assert.deepEqual(calls, [
    ["status", "thread-1"],
    ["send", "message.assistant.delta"],
  ]);
});
