export class EventBuffer {
  #items = [];
  #sequence = 0;
  #bytes = 0;
  #droppedThrough = 0;

  constructor(limit = 1000, options = {}) {
    this.limit = Math.max(1, Number(limit) || 1000);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024);
    this.maxEventBytes = Math.max(1, Number(options.maxEventBytes) || 2 * 1024 * 1024);
  }

  nextSequence() {
    this.#sequence += 1;
    return this.#sequence;
  }

  push(event) {
    const bytes = byteSize(event);
    // Keep the sequence monotonic even when one pathological event is too
    // large to retain. A subsequent sync will detect the gap and request a
    // snapshot instead of allowing one object to consume the whole heap.
    if (bytes > this.maxEventBytes) {
      this.#droppedThrough = Math.max(this.#droppedThrough, event.sequence || this.#sequence);
      return event;
    }
    this.#items.push(event);
    this.#bytes += bytes;
    while (this.#items.length > this.limit || this.#bytes > this.maxBytes) {
      const removed = this.#items.shift();
      this.#bytes -= byteSize(removed);
      this.#droppedThrough = Math.max(this.#droppedThrough, removed.sequence || 0);
    }
    return event;
  }

  after(lastSequence) {
    const sequence = Number(lastSequence || 0);
    if (sequence < this.#droppedThrough) return null;
    if (!this.#items.length) return [];
    const first = this.#items[0].sequence;
    if (sequence < first - 1) return null;
    return this.#items.filter((item) => item.sequence > sequence);
  }

  latestSequence() {
    return this.#sequence;
  }

  invalidateReplay() {
    this.#items.length = 0;
    this.#bytes = 0;
    this.#droppedThrough = this.nextSequence();
  }

  clear() {
    this.#items.length = 0;
    this.#sequence = 0;
    this.#bytes = 0;
    this.#droppedThrough = 0;
  }

  get size() { return this.#items.length; }
  get bytes() { return this.#bytes; }
}

function byteSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}
