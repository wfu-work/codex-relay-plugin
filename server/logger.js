import { EventEmitter } from "node:events";
import { nowIso, redact } from "./utils.js";

export class Logger extends EventEmitter {
  #entries = [];

  constructor(limit = 300) {
    super();
    this.limit = limit;
  }

  log(level, component, message, data) {
    const entry = {
      timestamp: nowIso(),
      level,
      component,
      message: redact(String(message)),
      ...(data === undefined ? {} : { data: redact(data) }),
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.shift();
    this.emit("entry", entry);
    return entry;
  }

  info(component, message, data) {
    return this.log("info", component, message, data);
  }

  warn(component, message, data) {
    return this.log("warn", component, message, data);
  }

  error(component, message, data) {
    return this.log("error", component, message, data);
  }

  list(limit = 100) {
    return this.#entries.slice(-Math.max(1, Math.min(limit, this.limit)));
  }

  clear() {
    this.#entries.length = 0;
  }
}
