import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig } from "../server/config-store.js";
import { EventBuffer } from "../server/event-buffer.js";
import { commandResult, eventEnvelope, extractContext, normalizeCodexNotification, validateRelayCommand, validateRelayWelcome, wrapRelayFrame, unwrapRelayFrame } from "../server/protocol.js";

function fixture(command = { type: "thread.list" }) {
  const config = defaultConfig();
  config.relay.spaceId = "space-1";
  config.relay.endpointId = "endpoint-1";
  config.relay.deviceId = "host-1";
  return {
    config,
    message: {
      version: 1,
      type: "codex.command",
      requestId: "req-1",
      spaceId: "space-1",
      deviceId: "phone-1",
      targetDeviceId: "endpoint-1",
      timestamp: new Date().toISOString(),
      command,
    },
  };
}

test("validates a targeted, current command", () => {
  const { config, message } = fixture();
  assert.equal(validateRelayCommand(message, config), message);
});

test("allows model discovery while Relay is read-only", () => {
  const { config, message } = fixture({ type: "model.list" });
  config.readOnly = true;
  assert.equal(validateRelayCommand(message, config), message);
});

test("allows selected-thread status polling while Relay is read-only", () => {
  const { config, message } = fixture({ type: "thread.status", threadId: "thread-1" });
  config.readOnly = true;
  assert.equal(validateRelayCommand(message, config), message);
});

test("allows historical thread subscription while Relay is read-only", () => {
  const { config, message } = fixture({ type: "thread.resume", threadId: "thread-1" });
  config.readOnly = true;
  assert.equal(validateRelayCommand(message, config), message);
});

test("rejects commands targeted to another endpoint", () => {
  const { config, message } = fixture();
  message.targetDeviceId = "endpoint-2";
  assert.throws(() => validateRelayCommand(message, config), { code: "DEVICE_NOT_TARGETED" });
});

test("read-only mode rejects write commands", () => {
  const { config, message } = fixture({ type: "turn.start", text: "hello" });
  config.readOnly = true;
  assert.throws(() => validateRelayCommand(message, config), { code: "COMMAND_NOT_ALLOWED" });
});

test("rejects stale commands", () => {
  const { config, message } = fixture();
  message.timestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  assert.throws(() => validateRelayCommand(message, config), { code: "MESSAGE_EXPIRED" });
});

test("event envelopes have monotonic sequences and host identity", () => {
  const { config } = fixture();
  const buffer = new EventBuffer();
  const first = eventEnvelope(config, buffer, { type: "turn.started" }, { threadId: "thread-1" });
  const second = eventEnvelope(config, buffer, { type: "message.assistant.delta" });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(first.deviceId, "host-1");
  assert.equal(first.threadId, "thread-1");
});

test("validates the relay welcome protocol and connection identity", () => {
  const welcome = {
    version: 1,
    type: "connect.welcome",
    connectionId: "connection-1",
    sessionId: "session-1",
    spaceId: "space-1",
    endpointId: "endpoint-1",
    maxFrameSize: 1024 * 1024,
  };
  assert.equal(validateRelayWelcome(welcome), welcome);
  assert.throws(() => validateRelayWelcome({ ...welcome, version: 2 }), { code: "PROTOCOL_VERSION_UNSUPPORTED" });
  assert.throws(() => validateRelayWelcome({ version: 1, type: "host.welcome", connectionId: "connection-1" }), { code: "INVALID_MESSAGE" });
  assert.throws(() => validateRelayWelcome({ version: 1, type: "connect.welcome", connectionId: "connection-1" }), { code: "INVALID_MESSAGE" });
});

test("wraps product messages in the transport envelope and unwraps them", () => {
  const { config, message } = fixture();
  const wrapped = wrapRelayFrame(message, config);
  assert.equal(wrapped.type, "stream.message");
  assert.equal(wrapped.streamId, "codex");
  assert.equal(wrapped.to, "endpoint-1");
  assert.equal(wrapped.from, "endpoint-1");
  const unwrapped = unwrapRelayFrame(wrapped);
  assert.equal(unwrapped.type, "codex.command");
  assert.equal(unwrapped.deviceId, "endpoint-1");
  assert.equal(unwrapped.targetDeviceId, "endpoint-1");
});

test("routes command results back to the requesting endpoint", () => {
  const { config } = fixture();
  const result = commandResult(config, "req-1", { ok: true }, "phone-1");
  assert.equal(result.targetDeviceId, "phone-1");
  assert.equal(wrapRelayFrame(result, config).to, "phone-1");
});

test("only explicitly supported Codex notifications are relayable", () => {
  assert.equal(normalizeCodexNotification("account/updated", { email: "private@example.com" }), null);
  assert.deepEqual(normalizeCodexNotification("item/agentMessage/delta", { delta: "hello" }), {
    type: "message.assistant.delta",
    sourceMethod: "item/agentMessage/delta",
    data: { delta: "hello" },
  });
});

test("forwards current queue and turn diff notifications for live timeline sync", () => {
  assert.equal(
    normalizeCodexNotification("thread/queue/changed", { threadId: "thread-1" }).type,
    "thread.queue.changed",
  );
  assert.equal(
    normalizeCodexNotification("turn/diff/updated", {
      threadId: "thread-1",
      turnId: "turn-1",
      diff: "diff",
    }).type,
    "diff.updated",
  );
});

test("drops unsupported notification aliases and requires canonical context fields", () => {
  assert.equal(normalizeCodexNotification("item/agentMessage/textDelta", { delta: "hello" }), null);
  assert.equal(normalizeCodexNotification("processing/heartbeat", {}), null);
  assert.equal(normalizeCodexNotification("thread/status_changed", { thread_id: "thread-1" }), null);
  assert.equal(normalizeCodexNotification("item.agentMessage.delta", { delta: "hello" }), null);
  assert.deepEqual(extractContext({ threadId: "thread-1", turnId: "turn-1" }), {
    threadId: "thread-1",
    turnId: "turn-1",
  });
  const legacyContext = extractContext({ thread_id: "thread-1", turn_id: "turn-1" });
  assert.equal(legacyContext.threadId, undefined);
  assert.equal(legacyContext.turnId, undefined);
});
