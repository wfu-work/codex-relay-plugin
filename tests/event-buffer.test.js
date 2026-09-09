import assert from "node:assert/strict";
import test from "node:test";
import { EventBuffer } from "../server/event-buffer.js";

test("EventBuffer replays retained events and reports a replay gap", () => {
  const buffer = new EventBuffer(2);
  buffer.push({ sequence: buffer.nextSequence(), value: "one" });
  buffer.push({ sequence: buffer.nextSequence(), value: "two" });
  buffer.push({ sequence: buffer.nextSequence(), value: "three" });

  assert.equal(buffer.latestSequence(), 3);
  assert.deepEqual(buffer.after(2).map((event) => event.value), ["three"]);
  assert.equal(buffer.after(0), null);
});

test("EventBuffer returns an empty replay before any events", () => {
  assert.deepEqual(new EventBuffer().after(0), []);
});

test("EventBuffer enforces a byte budget", () => {
  const buffer = new EventBuffer(100, { maxBytes: 160 });
  buffer.push({ sequence: buffer.nextSequence(), value: "a".repeat(70) });
  buffer.push({ sequence: buffer.nextSequence(), value: "b".repeat(70) });
  buffer.push({ sequence: buffer.nextSequence(), value: "c".repeat(70) });

  assert.ok(buffer.bytes <= 160);
  assert.ok(buffer.size < 3);
  assert.equal(buffer.after(0), null);
});

test("EventBuffer does not retain an oversized event", () => {
  const buffer = new EventBuffer(10, { maxEventBytes: 64 });
  const event = { sequence: buffer.nextSequence(), value: "x".repeat(200) };
  buffer.push(event);
  assert.equal(buffer.size, 0);
  assert.equal(buffer.latestSequence(), 1);
});
