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
