import { RelayError } from "./errors.js";

// Pace both history responses and resource uploads. Counting the encoded
// bytes includes base64 and protocol overhead. A large frame is sent intact,
// then the next frame waits for that frame's share of the byte budget.
export class OutboundQueue {
  #entries = [];
  #bytes = 0;
  #timer = null;
  #nextSendAt = 0;

  constructor({ bytesPerSecond = 512 * 1024, maxBytes = 16 * 1024 * 1024,
    maxEntries = 512, maxWaitMs = 25_000 } = {}) {
    Object.assign(this, { bytesPerSecond, maxBytes, maxEntries, maxWaitMs });
  }

  status() {
    return { queuedBytes: this.#bytes, queuedFrames: this.#entries.length, bytesPerSecond: this.bytesPerSecond };
  }

  enqueue(encoded, send, reject = () => {}) {
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (this.#bytes + bytes > this.maxBytes || this.#entries.length >= this.maxEntries) {
      reject(new RelayError("RELAY_BACKPRESSURE", "Relay 发送队列已满，请稍后同步"));
      return false;
    }
    this.#entries.push({ encoded, bytes, send, reject, expiresAt: Date.now() + this.maxWaitMs });
    this.#bytes += bytes;
    this.#drain();
    return true;
  }

  pause(ms) {
    this.#nextSendAt = Math.max(this.#nextSendAt, Date.now() + ms);
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#drain();
  }

  clear(error = new RelayError("RELAY_UNAVAILABLE", "Relay 连接已断开")) {
    clearTimeout(this.#timer);
    this.#timer = null;
    const entries = this.#entries.splice(0);
    this.#bytes = 0;
    for (const entry of entries) entry.reject(error);
    // Keep the pacing deadline across reconnects, so rotation cannot create
    // another burst. No queued command is replayed on a different connection.
  }

  #drain() {
    if (this.#timer) return;
    while (this.#entries.length) {
      const entry = this.#entries[0];
      const now = Date.now();
      if (entry.expiresAt <= now) {
        this.#entries.shift();
        this.#bytes -= entry.bytes;
        entry.reject(new RelayError("RELAY_BACKPRESSURE", "Relay 发送排队超时，请重新同步"));
        continue;
      }
      if (this.#nextSendAt > now) {
        this.#timer = setTimeout(() => {
          this.#timer = null;
          this.#drain();
        }, Math.min(this.#nextSendAt, entry.expiresAt) - now);
        this.#timer.unref?.();
        return;
      }
      this.#entries.shift();
      this.#bytes -= entry.bytes;
      this.#nextSendAt = now + Math.max(34, Math.ceil(entry.bytes * 1000 / this.bytesPerSecond));
      try { entry.send(entry.encoded); } catch (error) { entry.reject(error); }
    }
  }
}
