import assert from "node:assert/strict";
import test from "node:test";
import { OutboundQueue } from "../server/outbound-queue.js";
import { ResourceCache } from "../server/resource-cache.js";

test("outbound pacing counts UTF-8 bytes and preserves order with bounded memory", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const queue = new OutboundQueue({ bytesPerSecond: 1000, maxBytes: 5000 });
  t.after(() => queue.clear());
  const sent = [];
  const send = (data) => sent.push({ data, at: Date.now() });
  queue.enqueue("好".repeat(1000), send);
  queue.enqueue("next", send);
  assert.equal(sent.length, 1);
  t.mock.timers.tick(2999);
  assert.equal(sent.length, 1);
  t.mock.timers.tick(1);
  assert.equal(sent[1].at - sent[0].at, 3000);
  assert.equal(sent[1].data, "next");
  let rejected;
  assert.equal(queue.enqueue("x".repeat(5001), send, (error) => { rejected = error; }), false);
  assert.equal(rejected.code, "RELAY_BACKPRESSURE");
  assert.equal(queue.status().queuedBytes, 0);
});

test("cooldown bounds waiting time and disconnect clears queued data", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const queue = new OutboundQueue();
  const sent = [], errors = [];
  const enqueue = (data) => queue.enqueue(data, (s) => sent.push(s), (e) => errors.push(e.code));
  queue.pause(60_000);
  enqueue("old-read");
  t.mock.timers.tick(25_000);
  assert.deepEqual(errors, ["RELAY_BACKPRESSURE"]);
  enqueue("old-image");
  queue.clear();
  assert.deepEqual(errors, ["RELAY_BACKPRESSURE", "RELAY_UNAVAILABLE"]);
  t.mock.timers.tick(60_000);
  assert.deepEqual(sent, []);
  enqueue("new-read");
  assert.deepEqual(sent, ["new-read"]);
});

test("image cache shares concurrent/repeated uploads, expires, and isolates endpoints", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const cache = new ResourceCache(2);
  let uploads = 0;
  const upload = async () => ({ resourceUrl: `http://relay.test/${++uploads}`, expiresAt: new Date(Date.now() + 300_000).toISOString() });
  const get = (context = "endpoint-1", data = "same-image") => cache.get(context, "image/png", Buffer.from(data), upload);
  const first = await Promise.all([get(), get(), get()]);
  assert.equal(uploads, 1);
  assert.deepEqual(first[0], first[2]);
  await get();
  assert.equal(uploads, 1);
  t.mock.timers.tick(241_000);
  await get();
  assert.equal(uploads, 2);
  await get("endpoint-2");
  await get("endpoint-2", "new-image");
  assert.equal(uploads, 4);
  await get(); // bounded cache evicted endpoint-1
  assert.equal(uploads, 5);
});

test("failed image uploads can be retried", async () => {
  const cache = new ResourceCache();
  await assert.rejects(cache.get("space", "image/png", Buffer.from("x"), async () => { throw new Error("offline"); }));
  const ready = await cache.get("space", "image/png", Buffer.from("x"), async () => ({ resourceUrl: "http://relay.test/image" }));
  assert.equal(ready.resourceUrl, "http://relay.test/image");
});
