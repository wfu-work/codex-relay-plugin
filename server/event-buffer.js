export class EventBuffer {
  #items = [];
  #sequence = 0;

  constructor(limit = 1000) {
    this.limit = limit;
  }

  nextSequence() {
    this.#sequence += 1;
    return this.#sequence;
  }

  push(event) {
    this.#items.push(event);
    if (this.#items.length > this.limit) this.#items.shift();
    return event;
  }

  after(lastSequence) {
    const sequence = Number(lastSequence || 0);
    if (!this.#items.length) return [];
    const first = this.#items[0].sequence;
    if (sequence < first - 1) return null;
    return this.#items.filter((item) => item.sequence > sequence);
  }

  latestSequence() {
    return this.#sequence;
  }

  clear() {
    this.#items.length = 0;
    this.#sequence = 0;
  }
}

