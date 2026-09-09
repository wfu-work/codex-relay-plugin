import { createHash } from "node:crypto";

// URLs are scoped to the Relay/Space/Endpoint, and are reused only before
// their server-issued expiry. Concurrent copies of an image share one upload.
export class ResourceCache {
  #entries = new Map();

  constructor(maxEntries = 256) { this.maxEntries = maxEntries; }

  get(context, mime, bytes, upload) {
    const key = createHash("sha256").update(JSON.stringify([context, mime])).update(bytes).digest("hex");
    const cached = this.#entries.get(key);
    if (cached && (cached.pending || cached.expiresAt > Date.now() + 60_000)) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached.promise;
    }
    const entry = { pending: true, expiresAt: 0, promise: null };
    entry.promise = Promise.resolve().then(upload).then((ready) => {
      entry.pending = false;
      entry.expiresAt = typeof ready?.expiresAt === "number" ? ready.expiresAt : Date.parse(ready?.expiresAt);
      if (!ready?.resourceUrl || !(entry.expiresAt > Date.now() + 60_000)) {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
      }
      return ready;
    }, (error) => {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
      throw error;
    });
    this.#entries.set(key, entry);
    while (this.#entries.size > this.maxEntries) this.#entries.delete(this.#entries.keys().next().value);
    return entry.promise;
  }
}
