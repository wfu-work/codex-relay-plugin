import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig } from "../server/config-store.js";
import { EventBuffer } from "../server/event-buffer.js";
import { eventEnvelope, normalizeCodexNotification, validateRelayCommand, validateRelayWelcome } from "../server/protocol.js";

function fixture(command = { type: "thread.list" }) {
  const config = defaultConfig();
  config.relay.roomId = "room-1";
  config.relay.deviceId = "host-1";
  return {
    config,
    message: {
      version: 1,
      type: "codex.command",
      requestId: "req-1",
      roomId: "room-1",
      deviceId: "phone-1",
      targetDeviceId: "host-1",
      timestamp: new Date().toISOString(),
      command,
    },
  };
}

test("validates a targeted, current command", () => {
  const { config, message } = fixture();
  assert.equal(validateRelayCommand(message, config), message);
});

test("rejects commands targeted to another host", () => {
  const { config, message } = fixture();
  message.targetDeviceId = "host-2";
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
  const welcome = { version: 1, type: "host.welcome", connectionId: "connection-1" };
  assert.equal(validateRelayWelcome(welcome), welcome);
  assert.throws(() => validateRelayWelcome({ ...welcome, version: 2 }), { code: "PROTOCOL_VERSION_UNSUPPORTED" });
  assert.throws(() => validateRelayWelcome({ version: 1, type: "host.welcome" }), { code: "INVALID_MESSAGE" });
});

test("only explicitly supported Codex notifications are relayable", () => {
  assert.equal(normalizeCodexNotification("account/updated", { email: "private@example.com" }), null);
  assert.deepEqual(normalizeCodexNotification("item/agentMessage/delta", { delta: "hello" }), {
    type: "message.assistant.delta",
    sourceMethod: "item/agentMessage/delta",
    data: { delta: "hello" },
  });
});
