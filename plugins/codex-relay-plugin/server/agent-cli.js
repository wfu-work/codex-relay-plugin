#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter6 = __require("events");
    var https = __require("https");
    var http2 = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash: createHash5 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket3 = class _WebSocket extends EventEmitter6 {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket3, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket3.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket3.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket3.prototype.addEventListener = addEventListener;
    WebSocket3.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket3;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http2.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket3.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash5("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket3.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket3.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket3.CLOSED) return;
      if (websocket.readyState === WebSocket3.OPEN) {
        websocket._readyState = WebSocket3.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket3.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket3.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket3.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket3 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter6 = __require("events");
    var http2 = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash5 } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket3 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter6 {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket3,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http2.createServer((req, res) => {
            const body = http2.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash5("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http2.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http2.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// server/runtime.js
import crypto7 from "node:crypto";
import fs15 from "node:fs/promises";
import path16 from "node:path";

// server/connector-service.js
import { EventEmitter as EventEmitter5 } from "node:events";
import { randomUUID as randomUUID4 } from "node:crypto";

// server/app-server-client.js
import { EventEmitter as EventEmitter2 } from "node:events";
import fs3 from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// server/errors.js
var RelayError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
};
function asRelayError(error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof RelayError) return error;
  return new RelayError(fallbackCode, error instanceof Error ? error.message : String(error));
}

// server/app-server-transport.js
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// server/app-server-transport.js
var StdioAppServerTransport = class extends EventEmitter {
  child = null;
  lines = null;
  constructor(config) {
    super();
    this.config = config;
    this.mode = config.appServerTransport || "stdio";
  }
  get pid() {
    return this.child?.pid || null;
  }
  get writable() {
    return Boolean(this.child?.stdin?.writable);
  }
  async open() {
    const socket = this.config.appServerSocket?.replace(/^~(?=\/|$)/, os.homedir()) || "";
    if (this.mode === "unix" && !socket) {
      throw new Error("\u5171\u4EAB App Server \u672A\u914D\u7F6E Unix Socket \u8DEF\u5F84");
    }
    const args = this.mode === "unix" ? ["app-server", "proxy", "--sock", path.resolve(socket)] : ["app-server"];
    const child = spawn(this.config.executable || "codex", args, {
      cwd: this.config.defaultWorkingDirectory || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    this.child = child;
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.emit("message", line));
    child.stderr.on("data", (chunk) => this.emit("log", chunk.toString().trim()));
    child.stdin.on("error", (error) => this.emit("closed", error));
    child.on("error", (error) => this.emit("closed", error));
    child.once("exit", (code, signal) => this.emit("closed", new Error(`App Server \u5DF2\u9000\u51FA (${code ?? signal})`)));
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  }
  send(message) {
    if (!this.writable) throw new Error("Codex App Server \u8FDE\u63A5\u4E0D\u53EF\u5199");
    this.child.stdin.write(`${message}
`);
  }
  async close() {
    this.lines?.close();
    const child = this.child;
    this.child = null;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 3e3);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
};
var UnixAppServerTransport = class extends EventEmitter {
  socket = null;
  ws = null;
  config;
  constructor(config) {
    super();
    this.config = config;
  }
  get pid() {
    return null;
  }
  get writable() {
    return this.ws?.readyState === wrapper_default.OPEN;
  }
  async open() {
    const socket = String(this.config.appServerSocket || "").replace(/^~(?=\/|$)/, os.homedir());
    if (!socket) throw new Error("\u5171\u4EAB App Server \u672A\u914D\u7F6E Unix Socket \u8DEF\u5F84");
    const ws = new wrapper_default(`ws+unix://${socket}:/`, {
      perMessageDeflate: false,
      handshakeTimeout: 1e4
    });
    this.ws = ws;
    ws.on("message", (data) => {
      const text3 = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      for (const line of text3.split(/\r?\n/)) if (line.trim()) this.emit("message", line);
    });
    ws.on("error", (error) => this.emit("closed", error));
    ws.on("close", (code, reason) => this.emit("closed", new Error(`App Server Socket \u5DF2\u5173\u95ED (${code})${reason ? `\uFF1A${reason}` : ""}`)));
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        ws.off("open", onOpen);
        ws.off("error", onError);
      };
      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }
  send(message) {
    if (!this.writable) throw new Error("\u5171\u4EAB App Server \u8FDE\u63A5\u4E0D\u53EF\u5199");
    this.ws.send(message);
  }
  async close() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        ws.terminate();
        resolve();
      }, 2e3);
      ws.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.close();
    });
  }
};

// server/rollout-snapshot.js
import fs from "node:fs/promises";
import path2 from "node:path";
import os2 from "node:os";

// server/rollout-items.js
function rolloutItem(item) {
  if (!item || typeof item.id !== "string") return null;
  const common = { id: item.id };
  switch (item.type) {
    case "UserMessage":
      return { ...common, type: "userMessage", content: (item.content || []).flatMap((part) => {
        if (part.type === "text") return [{ type: "text", text: text(part.text) }];
        if (part.type === "local_image") return [{ type: "localImage", path: part.path }];
        if (part.type === "image") return [{ type: "image", url: part.image_url }];
        return [];
      }) };
    case "AgentMessage":
      return {
        ...common,
        type: "agentMessage",
        phase: item.phase,
        text: text((item.content || []).filter((part) => part.type === "Text").map((part) => part.text).join(""))
      };
    case "Reasoning":
      return { ...common, type: "reasoning", summary: (item.summary_text || []).map(text), content: [] };
    case "CommandExecution":
      return {
        ...common,
        type: "commandExecution",
        command: text(Array.isArray(item.command) ? item.command.join(" ") : item.command),
        cwd: item.cwd,
        status: item.status,
        aggregatedOutput: text(item.aggregated_output),
        exitCode: item.exit_code,
        durationMs: duration(item.duration)
      };
    case "McpToolCall":
      return {
        ...common,
        type: "mcpToolCall",
        server: item.server,
        tool: item.tool,
        status: item.status,
        result: { content: (item.result?.content || []).filter((part) => part.type === "text").map((part) => ({ type: "text", text: text(part.text) })) },
        durationMs: duration(item.duration)
      };
    case "FileChange":
      return {
        ...common,
        type: "fileChange",
        status: item.status,
        changes: Object.entries(item.changes || {}).slice(0, 128).map(([path17, change]) => ({
          path: path17,
          kind: { type: change.type, move_path: change.move_path },
          diff: text(change.unified_diff)
        }))
      };
    default:
      return null;
  }
}
function text(value) {
  if (typeof value !== "string") return "";
  return value.length > 32768 ? `${value.slice(0, 32768)}
\u2026\uFF08\u5386\u53F2\u8F93\u51FA\u5DF2\u622A\u65AD\uFF09` : value;
}
function duration(value) {
  return value && Number.isFinite(value.secs) ? Math.round(value.secs * 1e3 + (value.nanos || 0) / 1e6) : null;
}

// server/rollout-usage.js
var FIELDS = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  totalTokens: "total_tokens",
  cachedInputTokens: "cached_input_tokens",
  reasoningOutputTokens: "reasoning_output_tokens"
};
var REQUIRED = ["inputTokens", "outputTokens", "totalTokens"];
function usage(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const [key, snake] of Object.entries(FIELDS)) {
    const count = value[snake] ?? value[key];
    if (count === void 0 && !REQUIRED.includes(key)) continue;
    if (count === void 0 && REQUIRED.includes(key)) continue;
    if (!Number.isSafeInteger(count) || count < 0) return null;
    result[key] = count;
  }
  if (!REQUIRED.some((key) => result[key] !== void 0)) return null;
  return result;
}
var RolloutUsage = class {
  #total = null;
  #turns = /* @__PURE__ */ new Map();
  start(turn, modelContextWindow) {
    this.#turns.set(turn.id, {
      baseline: this.#total,
      invalid: false,
      modelContextWindow: contextWindow(modelContextWindow)
    });
    while (this.#turns.size > 12) this.#turns.delete(this.#turns.keys().next().value);
  }
  update(turn, info, updatedAt) {
    const total = usage(info?.total_token_usage ?? info?.total ?? info);
    if (!total) return false;
    const last = usage(info?.last_token_usage ?? info?.last);
    if (!turn) {
      this.#total = total;
      return false;
    }
    const state = this.#turns.get(turn.id);
    if (!state) return false;
    const previous = JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    if (!state.baseline && !state.invalid && last && REQUIRED.every((key) => total[key] === last[key])) {
      state.baseline = Object.fromEntries(Object.keys(total).map((key) => [key, 0]));
    }
    if (this.#total && REQUIRED.some((key) => total[key] < this.#total[key])) {
      state.invalid = true;
    }
    this.#total = total;
    const limit = info?.model_context_window ?? info?.modelContextWindow;
    if (limit !== void 0 && limit !== null) state.modelContextWindow = contextWindow(limit);
    turn.tokenUsage = {
      total,
      ...last ? { last } : {},
      ...state.modelContextWindow ? { modelContextWindow: state.modelContextWindow } : {},
      ...turn.tokenUsage?.updatedAt ? { updatedAt: turn.tokenUsage.updatedAt } : {}
    };
    if (state.baseline && !state.invalid) {
      const delta = {};
      for (const [key, value] of Object.entries(total)) {
        const baseline = state.baseline[key];
        if (baseline !== void 0 && value >= baseline) delta[key] = value - baseline;
      }
      if (REQUIRED.every((key) => delta[key] !== void 0)) turn.turnUsage = delta;
      else state.invalid = true;
    }
    if (state.invalid) delete turn.turnUsage;
    const changed = previous !== JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    if (changed && typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))) {
      turn.tokenUsage.updatedAt = updatedAt;
    }
    return changed;
  }
};
function contextWindow(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// server/rollout-snapshot.js
var UUID = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
var JOURNAL = new RegExp(`^rollout-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-(${UUID})(?:_${UUID})?\\.jsonl$`, "i");
var MAX_READ_BYTES = 32 * 1024 * 1024;
var MAX_LINE_BYTES = 4 * 1024 * 1024;
var MAX_TAIL_READ_BYTES = 16 * 1024 * 1024;
var RolloutSnapshots = class {
  #root;
  #index = /* @__PURE__ */ new Map();
  #indexedAt = 0;
  #indexing;
  #records = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path2.join(os2.homedir(), ".codex"), indexIntervalMs = 2e3 } = {}) {
    this.#root = path2.join(codexHome, "sessions");
    this.indexIntervalMs = indexIntervalMs;
  }
  clear() {
    this.#records.clear();
  }
  async read(thread) {
    if (!thread?.id || !thread.path || !thread.cwd) return null;
    const existing = this.#pending.get(thread.id);
    if (existing) return existing;
    const pending = this.#read(thread).catch(() => null).finally(() => this.#pending.delete(thread.id));
    this.#pending.set(thread.id, pending);
    return pending;
  }
  /**
   * Read the newest journal for a thread when the App Server index does not
   * include path/cwd metadata. This happens for a thread owned by the
   * desktop App Server: the Relay's private App Server can still emit an old
   * terminal notification, but its lightweight `thread/read` response may
   * omit the fields needed by the normal read path. The journal filename and
   * session_meta row are the stable identity for that case.
   */
  async readLatest(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return null;
    await this.#refreshIndex();
    const candidate = this.#index.get(id)?.[0];
    if (!candidate) return null;
    let meta;
    try {
      const handle = await fs.open(candidate, "r");
      try {
        const stat = await handle.stat();
        const head = Buffer.alloc(Math.min(MAX_LINE_BYTES, stat.size));
        const { bytesRead } = await handle.read(head, 0, head.length, 0);
        const end = head.indexOf(10, 0, bytesRead);
        if (end < 0) return null;
        meta = JSON.parse(head.subarray(0, end).toString("utf8"));
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
    const cwd = meta?.payload?.cwd;
    if (meta?.type !== "session_meta" || meta.payload?.id !== id || typeof cwd !== "string" || !cwd) return null;
    return await this.read({ id, path: candidate, cwd }) || this.#readTail({ id, path: candidate, cwd });
  }
  async #readTail(thread) {
    const root = await fs.realpath(this.#root);
    const original = await fs.realpath(thread.path);
    if (!inside(root, original)) return null;
    const handle = await fs.open(original, "r");
    try {
      const stat = await handle.stat();
      const start = Math.max(0, stat.size - MAX_TAIL_READ_BYTES);
      const buffer = Buffer.alloc(stat.size - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      if (!bytesRead) return null;
      const text3 = buffer.subarray(0, bytesRead).toString("utf8");
      const lines = text3.split("\n");
      if (start > 0) lines.shift();
      const record = {
        file: original,
        cwd: path2.resolve(thread.cwd),
        ino: stat.ino,
        offset: stat.size,
        remainder: Buffer.alloc(0),
        turns: [],
        current: null,
        itemCount: 0,
        updatedAt: null,
        complete: true,
        usage: new RolloutUsage()
      };
      const notifications = [];
      for (const line of lines) {
        if (!line || Buffer.byteLength(line) > MAX_LINE_BYTES) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (row.type === "session_meta") {
          if (row.payload?.id !== thread.id || path2.resolve(row.payload?.cwd || "") !== path2.resolve(thread.cwd)) {
            continue;
          }
        }
        projectRow(record, row, notifications, thread.id);
      }
      if (!record.current) return null;
      return {
        file: original,
        cwd: record.cwd,
        turns: structuredClone(record.turns),
        currentTurn: structuredClone(record.current),
        updatedAt: record.updatedAt,
        notifications,
        replaced: true
      };
    } finally {
      await handle.close();
    }
  }
  async #refreshIndex() {
    if (this.#indexing) return this.#indexing;
    if (Date.now() - this.#indexedAt < this.indexIntervalMs) return;
    this.#indexing = (async () => {
      const entries = await fs.readdir(this.#root, { recursive: true, withFileTypes: true });
      const index = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = entry.name.match(JOURNAL);
        if (!match) continue;
        const file = path2.join(entry.parentPath, entry.name);
        const files = index.get(match[1]) || [];
        files.push(file);
        index.set(match[1], files);
      }
      for (const files of index.values()) files.sort().reverse();
      this.#index = index;
      this.#indexedAt = Date.now();
    })().finally(() => {
      this.#indexing = null;
    });
    return this.#indexing;
  }
  async #read(thread) {
    const root = await fs.realpath(this.#root);
    const original = await fs.realpath(thread.path);
    if (!inside(root, original)) return null;
    await this.#refreshIndex();
    for (const candidate of this.#index.get(thread.id) || [original]) {
      const file = await fs.realpath(candidate);
      if (!inside(root, file)) continue;
      const handle = await fs.open(file, "r");
      try {
        const stat = await handle.stat();
        let record = this.#records.get(thread.id);
        const reusable = record?.file === file && record.cwd === path2.resolve(thread.cwd) && record.ino === stat.ino && stat.size >= record.offset;
        if (!reusable) {
          const head = Buffer.alloc(Math.min(MAX_LINE_BYTES, stat.size));
          const { bytesRead } = await handle.read(head, 0, head.length, 0);
          const end = head.indexOf(10);
          if (end < 0 || end >= bytesRead) continue;
          const meta = JSON.parse(head.subarray(0, end).toString("utf8"));
          if (meta.type !== "session_meta" || meta.payload?.id !== thread.id || path2.resolve(meta.payload?.cwd || "") !== path2.resolve(thread.cwd)) continue;
          if (stat.size > MAX_READ_BYTES) return null;
          record = {
            file,
            cwd: path2.resolve(thread.cwd),
            ino: stat.ino,
            offset: 0,
            remainder: Buffer.alloc(0),
            turns: [],
            current: null,
            itemCount: 0,
            updatedAt: meta.timestamp,
            complete: true,
            usage: new RolloutUsage()
          };
        }
        const notifications = [];
        if (stat.size - record.offset > MAX_READ_BYTES) return null;
        while (record.offset < stat.size) {
          const chunk = Buffer.alloc(Math.min(256 * 1024, stat.size - record.offset));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, record.offset);
          if (!bytesRead) break;
          record.offset += bytesRead;
          let buffer = Buffer.concat([record.remainder, chunk.subarray(0, bytesRead)]);
          let end;
          while ((end = buffer.indexOf(10)) >= 0) {
            const line = buffer.subarray(0, end);
            buffer = buffer.subarray(end + 1);
            if (line.length > MAX_LINE_BYTES) {
              record.complete = false;
              continue;
            }
            if (!line.length) continue;
            let row;
            try {
              row = JSON.parse(line.toString("utf8"));
            } catch {
              record.complete = false;
              continue;
            }
            projectRow(record, row, notifications, thread.id);
          }
          if (buffer.length > MAX_LINE_BYTES) return null;
          record.remainder = buffer;
        }
        this.#records.delete(thread.id);
        this.#records.set(thread.id, record);
        while (this.#records.size > 8) this.#records.delete(this.#records.keys().next().value);
        if (!record.current || !record.complete) return null;
        return {
          file,
          cwd: record.cwd,
          turns: structuredClone(record.turns),
          currentTurn: structuredClone(record.current),
          updatedAt: record.updatedAt,
          notifications: reusable ? notifications : [],
          replaced: file !== original
        };
      } finally {
        await handle.close();
      }
    }
    return null;
  }
};
function inside(root, file) {
  const relative = path2.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path2.sep}`) && !path2.isAbsolute(relative);
}
function projectRow(record, row, notifications, threadId) {
  if (row.type !== "event_msg") return;
  const event = row.payload;
  if (!event || event.thread_id && event.thread_id !== threadId) return;
  if (event.type === "task_started" && event.turn_id) {
    const turn = {
      id: event.turn_id,
      status: "inProgress",
      startedAt: event.started_at ?? Date.parse(row.timestamp) / 1e3,
      completedAt: null,
      durationMs: null,
      items: []
    };
    record.turns.push(turn);
    record.current = turn;
    record.usage.start(turn, event.model_context_window);
    if (record.turns.length > 12) {
      record.itemCount -= record.turns.shift().items.length;
    }
    notifications.push(["turn/started", { threadId, turn: { ...turn, items: [] } }]);
  } else if (event.type === "token_count") {
    const turn = event.turn_id ? record.turns.find((turn2) => turn2.id === event.turn_id) : record.current;
    if (event.turn_id && !turn) return;
    if (!event.turn_id && record.turns.filter((turn2) => turn2.status === "inProgress").length > 1) return;
    if (record.usage.update(turn, event.info, row.timestamp) && turn) {
      notifications.push(["thread/tokenUsage/updated", {
        threadId,
        turnId: turn.id,
        tokenUsage: turn.tokenUsage,
        ...turn.turnUsage ? { turnUsage: turn.turnUsage } : {}
      }]);
    }
  } else if (event.type === "item_completed" || event.type === "item_started" || event.type === "item_updated") {
    const turn = record.turns.find((turn2) => turn2.id === event.turn_id);
    const item = rolloutItem(event.item);
    if (!turn || !item) return;
    const index = turn.items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) turn.items[index] = item;
    else {
      turn.items.push(item);
      record.itemCount += 1;
    }
    while (record.itemCount > 500) {
      record.turns.find((entry) => entry.items.length)?.items.shift();
      record.itemCount -= 1;
    }
    const method = event.type.replace("item_", "item/");
    notifications.push([method, { threadId, turnId: turn.id, item }]);
  } else if (event.type === "task_complete" || event.type === "turn_aborted") {
    const activeTurns = record.turns.filter((turn2) => turn2.status === "inProgress");
    const turn = event.turn_id ? record.turns.find((candidate) => candidate.id === event.turn_id) : activeTurns.length === 1 ? activeTurns[0] : null;
    if (!turn) return;
    const finalUsageCandidates = [
      event.info,
      event.usage,
      event.tokenUsage,
      event.token_usage
    ];
    let usageUpdated = false;
    for (const candidate of finalUsageCandidates) {
      if (candidate && record.usage.update(turn, candidate, row.timestamp)) {
        usageUpdated = true;
        break;
      }
    }
    if (usageUpdated) {
      notifications.push(["thread/tokenUsage/updated", {
        threadId,
        turnId: turn.id,
        tokenUsage: turn.tokenUsage,
        ...turn.turnUsage ? { turnUsage: turn.turnUsage } : {}
      }]);
    }
    turn.status = event.type === "turn_aborted" ? "interrupted" : event.error ? "failed" : "completed";
    turn.completedAt = event.completed_at ?? Date.parse(row.timestamp) / 1e3;
    turn.durationMs = event.duration_ms ?? Math.max(0, (turn.completedAt - turn.startedAt) * 1e3);
    if (event.error) turn.error = { message: String(event.error.message || "\u4EFB\u52A1\u6267\u884C\u5931\u8D25") };
    notifications.push(["turn/completed", { threadId, turn: { ...turn, items: [] } }]);
  }
  record.updatedAt = row.timestamp || record.updatedAt;
}
function applyRolloutSnapshot(thread, snapshot, { includeTurns = false } = {}) {
  if (!snapshot) return thread;
  const turn = snapshot.currentTurn;
  const currentTurn = { ...turn, items: [] };
  const updatedAt = Date.parse(snapshot.updatedAt) / 1e3;
  return {
    ...thread,
    path: snapshot.file,
    status: { type: turn.status === "inProgress" ? "active" : "idle", activeFlags: [] },
    currentTurn,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : thread.updatedAt,
    ...includeTurns ? { turns: snapshot.turns } : {}
  };
}

// server/pending-interactions.js
import { randomUUID } from "node:crypto";
var APPROVALS = /* @__PURE__ */ new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval"]);
var INPUTS = /* @__PURE__ */ new Set(["tool/requestUserInput", "item/tool/requestUserInput"]);
var PendingInteractions = class {
  entries = /* @__PURE__ */ new Map();
  add(message) {
    const existing = [...this.entries.values()].find((entry2) => entry2.backendId === message.id && entry2.method === message.method);
    if (existing) return existing;
    const entry = { approvalId: randomUUID(), backendId: message.id, method: message.method, kind: APPROVALS.has(message.method) ? "approval" : INPUTS.has(message.method) ? "userInput" : "desktop", params: message.params || {}, createdAt: (/* @__PURE__ */ new Date()).toISOString(), responding: false };
    if (entry.kind === "desktop") entry.params = { threadId: entry.params.threadId, turnId: entry.params.turnId, itemId: entry.params.itemId };
    if (this.entries.size >= 512) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(entry.approvalId, entry);
    return entry;
  }
  get(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new RelayError("APPROVAL_EXPIRED", "\u8BF7\u6C42\u5DF2\u7ECF\u5904\u7406\u6216\u8FDE\u63A5\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u4EFB\u52A1");
    return entry;
  }
  resolve(requestId, threadId) {
    const resolved = [];
    for (const [id, entry] of this.entries) {
      if (entry.backendId === requestId && (!threadId || entry.params.threadId === threadId)) {
        this.entries.delete(id);
        resolved.push(entry);
      }
    }
    return resolved;
  }
  clearThread(threadId, turnId) {
    const removed = [];
    for (const [id, entry] of this.entries) if (entry.params.threadId === threadId && (!turnId || entry.params.turnId === turnId)) {
      this.entries.delete(id);
      removed.push(entry);
    }
    return removed;
  }
  clear() {
    const removed = [...this.entries.values()];
    this.entries.clear();
    return removed;
  }
  public(entry, config) {
    return { approvalId: entry.approvalId, method: entry.method, kind: entry.kind, params: entry.params, createdAt: entry.createdAt, responding: entry.responding, canRespond: entry.kind !== "desktop" && !config.readOnly && config.permissions?.respondToApprovals === true };
  }
  validateResponse(entry, payload, kind) {
    if (entry.responding) throw new RelayError("APPROVAL_PENDING", "\u56DE\u7B54\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u7B49\u5F85\u540E\u7AEF\u786E\u8BA4");
    if (entry.kind !== kind) throw new RelayError("INVALID_MESSAGE", "\u54CD\u5E94\u7C7B\u578B\u4E0E\u8BF7\u6C42\u4E0D\u5339\u914D");
    if (kind === "approval") {
      const allowed = entry.params.availableDecisions?.filter((value) => typeof value === "string") || ["accept", "acceptForSession", "decline", "cancel"];
      if (!allowed.includes(payload.decision)) throw new RelayError("INVALID_MESSAGE", "\u5F53\u524D\u8BF7\u6C42\u4E0D\u652F\u6301\u6B64\u5BA1\u6279\u51B3\u5B9A");
      return { decision: payload.decision };
    }
    const questions = entry.params.questions || [];
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).some((id) => !questions.some((question) => question.id === id))) throw new RelayError("INVALID_MESSAGE", "\u95EE\u9898\u56DE\u7B54\u683C\u5F0F\u65E0\u6548");
    for (const question of questions) {
      const answer = answers[question.id]?.answers;
      if (!Array.isArray(answer) || answer.length === 0 || answer.length > 20 || answer.some((text3) => typeof text3 !== "string" || !text3.trim() || text3.length > 2e4)) throw new RelayError("INVALID_MESSAGE", "\u8BF7\u5B8C\u6574\u586B\u5199\u6BCF\u4E2A\u95EE\u9898\u7684\u56DE\u7B54");
    }
    return { answers };
  }
};

// server/composer-settings.js
function composerSettings(value) {
  const thread = value?.thread && typeof value.thread === "object" ? value.thread : null;
  const source = {
    ...thread || {},
    ...value && typeof value === "object" ? value : {},
    ...thread?.settings && typeof thread.settings === "object" ? thread.settings : {},
    ...thread?.composerSettings && typeof thread.composerSettings === "object" ? thread.composerSettings : {},
    ...value?.settings && typeof value.settings === "object" ? value.settings : {},
    ...value?.composerSettings && typeof value.composerSettings === "object" ? value.composerSettings : {},
    ...value?.threadSettings && typeof value.threadSettings === "object" ? value.threadSettings : {}
  };
  if (!source || typeof source !== "object") return null;
  const settings = {};
  if (typeof source.model === "string" && source.model.trim()) settings.model = source.model.trim();
  const effort = source.effort ?? source.reasoningEffort ?? source.reasoning_effort ?? source.reasoning;
  if (effort !== void 0) settings.effort = effort;
  for (const key of [
    "approvalPolicy",
    "approval_policy",
    "approvalsReviewer",
    "activePermissionProfile",
    "permissions",
    "permissionMode",
    "permission_mode"
  ]) {
    if (source[key] !== void 0) settings[key] = source[key];
  }
  if (source.sandboxPolicy !== void 0 || source.sandbox !== void 0) {
    settings.sandboxPolicy = source.sandboxPolicy ?? source.sandbox;
  }
  return Object.keys(settings).length ? settings : null;
}
function composerSettingsPatch(command, config) {
  const patch = {};
  for (const key of ["model", "effort"]) {
    if (!Object.hasOwn(command, key)) continue;
    if (typeof command[key] !== "string" || !command[key].trim() || command[key].length > 256) {
      throw new RelayError("INVALID_MESSAGE", `${key} \u5FC5\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32`);
    }
    patch[key] = command[key].trim();
  }
  if (Object.hasOwn(command, "permissionMode")) {
    if (!config.permissions.respondToApprovals) {
      throw new RelayError("COMMAND_NOT_ALLOWED", "\u8FDC\u7A0B\u6743\u9650 respondToApprovals \u672A\u542F\u7528\uFF0C\u4E0D\u80FD\u4FEE\u6539\u4EFB\u52A1\u6743\u9650");
    }
    const modes = {
      "\u9ED8\u8BA4\u6743\u9650": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "user" },
      "\u81EA\u52A8\u5BA1\u67E5": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "auto_review" },
      "\u5B8C\u5168\u8BBF\u95EE\u6743\u9650": { permissions: ":danger-full-access", approvalPolicy: "never", approvalsReviewer: "user" },
      "\u53EA\u8BFB\u6743\u9650": { permissions: ":read-only", approvalPolicy: "on-request", approvalsReviewer: "user" }
    };
    if (!Object.hasOwn(modes, command.permissionMode)) throw new RelayError("INVALID_MESSAGE", "\u4E0D\u652F\u6301\u7684\u6743\u9650\u6A21\u5F0F");
    Object.assign(patch, modes[command.permissionMode]);
  }
  if (!Object.keys(patch).length) throw new RelayError("INVALID_MESSAGE", "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u4EFB\u52A1\u8BBE\u7F6E");
  return patch;
}

// server/desktop-project-pins.js
import fs2 from "node:fs/promises";
import os3 from "node:os";
import path3 from "node:path";
var DesktopProjectPins = class {
  #file;
  #codexHome;
  #positions = /* @__PURE__ */ new Map();
  #pathPositions = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path3.join(os3.homedir(), ".codex") } = {}) {
    this.#codexHome = path3.resolve(codexHome);
    this.#file = path3.join(this.#codexHome, ".codex-global-state.json");
  }
  async enrich(result) {
    if (!Array.isArray(result?.data)) return result;
    try {
      const state = JSON.parse(await fs2.readFile(this.#file, "utf8"));
      if (state && typeof state === "object" && !Array.isArray(state)) {
        const ids = state["pinned-project-ids"] ?? [];
        if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
          const positions = [...new Set(ids)].map((id, index) => [id, index]);
          const mappings = state["app-server-project-id-by-legacy-project-id-by-host"];
          const hostMapping = mappings?.[`local:${this.#codexHome}`];
          const resolved = positions.map(([legacyId, index]) => [
            typeof hostMapping?.[legacyId] === "string" ? hostMapping[legacyId] : legacyId,
            index
          ]);
          this.#positions = new Map([...positions, ...resolved]);
          const localProjects = state["local-projects"];
          this.#pathPositions = new Map(positions.flatMap(([legacyId, index]) => {
            const roots = localProjects?.[legacyId]?.rootPaths;
            return Array.isArray(roots) ? roots.filter((root) => typeof root === "string" && root.trim()).map((root) => [path3.resolve(root), index]) : [];
          }));
        }
      }
    } catch {
    }
    return {
      ...result,
      data: result.data.map((project) => {
        if (!project || typeof project !== "object" || Array.isArray(project)) return project;
        let pinnedPosition = this.#positions.get(project.id);
        if (pinnedPosition === void 0) {
          const roots = Array.isArray(project.roots) ? project.roots : [];
          const candidates = project.path ? [project.path, ...roots] : roots;
          for (const root of candidates) {
            const projectPath = typeof root === "string" ? root : root?.path;
            if (typeof projectPath !== "string" || !projectPath.trim()) continue;
            pinnedPosition = this.#pathPositions.get(path3.resolve(projectPath));
            if (pinnedPosition !== void 0) break;
          }
        }
        return { ...project, isPinned: pinnedPosition !== void 0, pinnedPosition: pinnedPosition ?? null };
      })
    };
  }
};

// server/app-server-client.js
var execFileAsync = promisify(execFile);
var AppServerClient = class _AppServerClient extends EventEmitter2 {
  #transport = null;
  #generation = 0;
  #wanted = false;
  #retryTimer = null;
  #retryAttempt = 0;
  #subscriptions = /* @__PURE__ */ new Set();
  #connectionConfig = null;
  #requests = /* @__PURE__ */ new Map();
  #interactions = new PendingInteractions();
  #interrupts = /* @__PURE__ */ new Map();
  #nextId = 1;
  #starting = null;
  #paginatedThreads = null;
  #threadListSortMode = null;
  // `thread/read` only reads persisted history; it does not subscribe this
  // App Server connection to subsequent turn/item notifications. Keep track
  // of threads resumed in this process so a remote client can receive live
  // updates for a task that was originally opened by another Codex client.
  #resumedThreads = /* @__PURE__ */ new Set();
  #resumingThreads = /* @__PURE__ */ new Map();
  #resumeRetryAt = /* @__PURE__ */ new Map();
  #threadSettings = /* @__PURE__ */ new Map();
  #settingsRevision = 0;
  // Codex keeps authoritative token_count rows in the local rollout journal.
  // App Server history does not always project those rows into thread/read,
  // especially for a thread owned by Desktop. Keep a read-only journal
  // projection so Relay can recover per-turn usage without taking the writer.
  #rollouts;
  #projectPins;
  static MAX_RESUMED_THREADS = 1e3;
  static APPROVAL_METHODS = /* @__PURE__ */ new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval"
  ]);
  constructor(configStore, logger, options = {}) {
    super();
    this.options = options;
    this.#projectPins = new DesktopProjectPins({ codexHome: options.codexHome });
    this.#rollouts = new RolloutSnapshots({ codexHome: options.codexHome });
    this.configStore = configStore;
    this.logger = logger;
    this.state = "stopped";
    this.version = null;
    this.lastError = null;
  }
  status() {
    const config = this.#connectionConfig || this.configStore.get().codex;
    const transport = this.#transport;
    return {
      state: this.state,
      version: this.version,
      pid: transport?.pid || null,
      connectionMode: this.#connectionConfig?.appServerTransport === "unix" ? "shared" : "managed",
      transport: this.#connectionConfig?.appServerTransport === "unix" ? "unix-proxy" : "stdio",
      ownsProcess: Boolean(transport?.pid),
      endpoint: this.#connectionConfig?.appServerSocket ? `unix://${this.#connectionConfig.appServerSocket}` : null,
      reconnectAttempt: this.#retryAttempt,
      nextRetryAt: this.nextRetryAt || null,
      subscribedThreads: this.#resumedThreads.size,
      lastError: this.lastError,
      pendingRequests: this.#requests.size,
      pendingApprovals: this.#interactions.entries.size
    };
  }
  async checkAvailability() {
    const codex = this.configStore.get().codex;
    const executable = codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 1e4 });
    this.version = (stdout || stderr).trim();
    return {
      executable,
      version: this.version,
      connectionMode: codex.appServerTransport === "unix" ? "shared" : "managed",
      transport: codex.appServerTransport === "unix" ? "unix-proxy" : "stdio",
      endpoint: codex.appServerSocket ? `unix://${codex.appServerSocket}` : null
    };
  }
  async start() {
    this.#wanted = true;
    if (this.#starting) return this.#starting;
    if (this.state === "ready") return this.status();
    if (this.#retryTimer) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u6B63\u5728\u91CD\u8FDE\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    const generation = ++this.#generation;
    const pending = this.#startInternal(generation);
    this.#starting = pending;
    try {
      return await pending;
    } finally {
      if (this.#starting === pending) this.#starting = null;
    }
  }
  #resetConnectionState() {
    this.#paginatedThreads = null;
    this.#threadListSortMode = null;
    this.#resumedThreads.clear();
    this.#resumingThreads.clear();
    this.#resumeRetryAt.clear();
    this.#threadSettings.clear();
  }
  async #startInternal(generation) {
    const config = this.configStore.get().codex;
    this.#connectionConfig = { ...config };
    this.state = "starting";
    this.lastError = null;
    this.version = null;
    this.#resetConnectionState();
    let transport;
    try {
      await this.checkAvailability();
      if (config.appServerTransport === "unix" && config.autoStartAppServer !== false) {
        await ensureAppServerDaemon(config);
      }
      transport = config.appServerTransport === "unix" ? new UnixAppServerTransport(config) : new StdioAppServerTransport(config);
      if (generation !== this.#generation || !this.#wanted) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      this.#transport = transport;
      transport.on("message", (line) => {
        if (this.#transport === transport) this.#handleLine(line);
      });
      transport.on("log", (message) => {
        if (message) this.logger.info("app-server", message);
      });
      transport.on("closed", (error) => this.#handleExit(transport, error));
      this.logger.info("app-server", "\u6B63\u5728\u542F\u52A8 Codex App Server");
      await transport.open();
      if (generation !== this.#generation || this.#transport !== transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      const initialized = await this.request("initialize", {
        clientInfo: { name: "codex-relay-plugin", title: "Codex Relay Plugin", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      }, this.options.initializeTimeoutMs || 15e3);
      this.notify("initialized", {});
      this.version = this.version || initialized?.serverInfo?.version || initialized?.userAgent || null;
      for (const id of [...this.#subscriptions]) {
        if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server \u8FDE\u63A5\u6062\u590D\u5DF2\u53D6\u6D88");
        try {
          await this.resumeThread(id);
        } catch (error) {
          if (!transport.writable) throw error;
          this.#subscriptions.delete(id);
          this.logger.warn("app-server", "\u4EFB\u52A1\u8BA2\u9605\u6062\u590D\u5931\u8D25\uFF0C\u7B49\u5F85\u5BA2\u6237\u7AEF\u91CD\u65B0\u8BFB\u53D6", { threadId: id, message: error.message });
        }
      }
      if (generation !== this.#generation || this.#transport !== transport) throw new Error("App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      this.state = "ready";
      this.#retryAttempt = 0;
      this.nextRetryAt = null;
      this.lastError = null;
      this.emit("status", this.status());
      return this.status();
    } catch (error) {
      if (this.#transport === transport) this.#transport = null;
      await transport?.close();
      if (generation === this.#generation && this.#wanted) {
        this.lastError = error.message;
        this.state = "error";
        this.#scheduleReconnect();
        this.emit("status", this.status());
      }
      throw error;
    }
  }
  #scheduleReconnect() {
    if (!this.#wanted) return;
    this.state = "reconnecting";
    if (this.#retryTimer) return;
    const delay = Math.min(
      this.options.reconnectMaxMs || 3e4,
      (this.options.reconnectBaseMs || 500) * 2 ** Math.min(this.#retryAttempt++, 8) * (0.8 + Math.random() * 0.4)
    );
    this.nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.nextRetryAt = null;
      if (this.#starting) {
        this.#scheduleReconnect();
        return;
      }
      this.start().catch((error) => this.logger.warn("app-server", "App Server \u91CD\u8FDE\u5931\u8D25", { message: error.message }));
    }, delay);
    this.#retryTimer.unref();
  }
  #rejectRequests(error) {
    for (const pending of this.#requests.values()) pending.reject(error);
    this.#requests.clear();
    for (const entry of this.#interactions.clear()) this.emit("interactionResolved", { ...this.#interactions.public(entry, this.configStore.get()), reason: "connectionClosed" });
  }
  async stop() {
    this.#wanted = false;
    ++this.#generation;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#retryAttempt = 0;
    this.nextRetryAt = null;
    this.#subscriptions.clear();
    this.#rollouts.clear();
    this.#resetConnectionState();
    const transport = this.#transport;
    this.#transport = null;
    this.state = "stopped";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u505C\u6B62"));
    await transport?.close();
    await this.#starting?.catch(() => {
    });
    this.#connectionConfig = null;
    this.version = null;
    this.emit("status", this.status());
  }
  request(method, params = {}, timeoutMs = 3e4) {
    if (!this.#transport?.writable) {
      return Promise.reject(new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id);
        reject(new RelayError("APP_SERVER_TIMEOUT", `${method} \u8BF7\u6C42\u8D85\u65F6`));
      }, timeoutMs);
      this.#requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      try {
        this.#write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        const pending = this.#requests.get(id);
        this.#requests.delete(id);
        pending?.reject(error);
      }
    });
  }
  notify(method, params = {}) {
    this.#write({ jsonrpc: "2.0", method, params });
  }
  async listThreads(params = {}) {
    const limit = Math.min(Number(params.limit || 50), 100);
    const requestedSortKey = params.sortKey || "recency_at";
    const requestedSortDirection = params.sortDirection || "desc";
    const useDefaultSort = params.sortKey == null && params.sortDirection == null;
    let effectiveSortKey = requestedSortKey;
    let includeSortDirection = true;
    if (useDefaultSort && this.#threadListSortMode) {
      [effectiveSortKey, includeSortDirection] = this.#threadListSortMode;
    }
    const requestPage = (cursor2) => this.request("thread/list", {
      cursor: cursor2,
      limit,
      sortKey: effectiveSortKey,
      ...includeSortDirection ? { sortDirection: requestedSortDirection } : {},
      ...params.cwd ? { cwd: params.cwd } : {}
    });
    const requestFirstPage = async () => {
      if (useDefaultSort && this.#threadListSortMode) {
        return requestPage(null);
      }
      try {
        const result = await requestPage(null);
        if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
        return result;
      } catch (error) {
        if (requestedSortKey !== "recency_at" || !isUnsupportedThreadSort(error)) {
          throw error;
        }
        const fallbacks = [
          ["recency_at", false],
          ["updated_at", true],
          ["updated_at", false]
        ];
        let lastError = error;
        for (const [sortKey, withDirection] of fallbacks) {
          effectiveSortKey = sortKey;
          includeSortDirection = withDirection;
          try {
            const result = await requestPage(null);
            if (useDefaultSort) this.#threadListSortMode = [effectiveSortKey, includeSortDirection];
            return result;
          } catch (fallbackError) {
            if (!isUnsupportedThreadSort(fallbackError)) throw fallbackError;
            lastError = fallbackError;
          }
        }
        throw lastError;
      }
    };
    const first = params.cursor != null ? await requestPage(params.cursor) : await requestFirstPage();
    if (params.cursor != null) return first;
    if (!first || !Array.isArray(first.data)) return first;
    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor ? first.nextCursor : null;
    const seenCursors = /* @__PURE__ */ new Set();
    for (let page = 1; cursor && page < 1e3; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) {
        cursor = null;
      } else {
        cursor = nextCursor;
      }
    }
    return {
      ...first,
      // Some App Server builds can repeat a historical thread at a page
      // boundary while the on-disk index is being updated. The thread id is
      // the thread id is the stable identity across paginated responses;
      // collapse duplicates
      // before exposing the catalog so clients do not render two rows for one
      // task during eventual convergence.
      data: sortThreadList(
        dedupeThreadList(data),
        requestedSortDirection,
        effectiveSortKey
      ),
      nextCursor: null
    };
  }
  listModels(params = {}) {
    return this.request("model/list", {
      cursor: params.cursor ?? null,
      limit: Math.min(Number(params.limit || 100), 100),
      includeHidden: params.includeHidden === true
    });
  }
  async listProjects(params = {}) {
    const limit = Math.min(Number(params.limit || 100), 100);
    const requestPage = (cursor2) => this.request("project/list", {
      cursor: cursor2,
      limit
    });
    if (params.cursor != null) return this.#projectPins.enrich(await requestPage(params.cursor));
    const first = await requestPage(null);
    if (!first || !Array.isArray(first.data)) return first;
    const data = [...first.data];
    let cursor = typeof first.nextCursor === "string" && first.nextCursor ? first.nextCursor : null;
    const seenCursors = /* @__PURE__ */ new Set();
    for (let page = 1; cursor && page < 1e3; page += 1) {
      if (seenCursors.has(cursor)) break;
      seenCursors.add(cursor);
      const response = await requestPage(cursor);
      if (!response || !Array.isArray(response.data)) break;
      data.push(...response.data);
      const nextCursor = typeof response.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      cursor = !nextCursor || nextCursor === cursor ? null : nextCursor;
    }
    return this.#projectPins.enrich({
      ...first,
      data: sortProjectList(dedupeProjectList(data)),
      nextCursor: null
    });
  }
  async readThread(threadId) {
    return this.readThreadSnapshot(threadId);
  }
  /**
   * Read the persisted thread snapshot without trying to acquire the thread
   * writer or subscribe this connection to future notifications.
   *
   * The official desktop client owns some threads through its private stdio
   * App Server. Those threads are still readable from the persisted Codex
   * history, but `thread/resume` is rejected with an active-writer error.
   * Relay reads used for reconciliation must therefore be side-effect free;
   * starting a new turn remains responsible for resuming the thread when
   * necessary.
   */
  async readThreadSnapshot(threadId) {
    const id = normalizeThreadId(threadId);
    const liveRollout = await this.#rollouts.readLatest(id);
    if (liveRollout?.replaced === true && liveRollout.currentTurn?.status === "inProgress") {
      return {
        thread: applyRolloutSnapshot(
          { id, path: liveRollout.file, cwd: liveRollout.cwd },
          liveRollout,
          { includeTurns: true }
        )
      };
    }
    const result = this.#paginatedThreads === true ? await this.#readPaginatedThread(id) : await this.request(
      "thread/read",
      { threadId: id, includeTurns: true },
      this.options.threadReadTimeoutMs ?? 5e3
    ).catch(async (error) => {
      if (isPaginatedThreadReadError(error)) {
        this.#paginatedThreads = true;
        return this.#readPaginatedThread(id);
      }
      const snapshot = await this.#rollouts.readLatest(id);
      if (!snapshot) throw error;
      return {
        thread: applyRolloutSnapshot(
          { id, path: snapshot.file, cwd: snapshot.cwd },
          snapshot,
          { includeTurns: true }
        )
      };
    });
    return this.#reconcileRolloutUsage(result);
  }
  // Unlike readThread(), this explicitly disables includeTurns. Codex still
  // returns the current thread status, but does not stream the full history.
  // The Relay client uses it as a cheap heartbeat for a selected task. The
  // explicit false also keeps older non-paginated servers from falling back
  // to their full-history default. Status reads never acquire a writer unless
  // a caller explicitly requests a local subscription.
  async readThreadStatus(threadId, { ensureResumed = false } = {}) {
    const id = normalizeThreadId(threadId);
    if (ensureResumed) await this.ensureThreadResumed(id);
    let result;
    try {
      result = await this.request(
        "thread/read",
        { threadId: id, includeTurns: false },
        this.options.threadStatusTimeoutMs ?? 5e3
      );
    } catch (error) {
      const snapshot = await this.#rollouts.readLatest(id);
      if (!snapshot) throw error;
      return {
        thread: applyRolloutSnapshot(
          { id, path: snapshot.file, cwd: snapshot.cwd },
          snapshot
        )
      };
    }
    return this.#reconcileRolloutUsage(result);
  }
  async #reconcileRolloutUsage(result) {
    const thread = result?.thread || result;
    if (!thread || typeof thread !== "object") return result;
    const snapshot = await this.#rollouts.read(thread) || (thread?.id ? await this.#rollouts.readLatest(thread.id) : null);
    if (!snapshot) return result;
    const projected = applyRolloutSnapshot(thread, snapshot, {
      includeTurns: Array.isArray(thread.turns)
    });
    const projectedResult = result?.thread ? { ...result, thread: projected } : projected;
    for (const [method, params] of snapshot.notifications || []) {
      if (method === "thread/tokenUsage/updated") this.emit("notification", method, params);
    }
    const sourceTurns = Array.isArray(snapshot.turns) ? snapshot.turns : [];
    const targetTurns = Array.isArray(projected.turns) ? projected.turns : [];
    const byId = new Map(targetTurns.map((turn) => [turn?.id, turn]));
    let changed = false;
    for (const source of sourceTurns) {
      if (!source?.id || !source.turnUsage && !source.tokenUsage) continue;
      const target = byId.get(source.id);
      if (!target) continue;
      if (!target.turnUsage && source.turnUsage) {
        target.turnUsage = source.turnUsage;
        changed = true;
      }
      if (!target.tokenUsage && source.tokenUsage) {
        target.tokenUsage = source.tokenUsage;
        changed = true;
      }
    }
    if (!changed) return projectedResult;
    const hydrated = { ...projected, turns: targetTurns };
    return result?.thread ? { ...result, thread: hydrated } : hydrated;
  }
  /** Metadata-only persisted read used by snapshot reconciliation. */
  readThreadStatusSnapshot(threadId) {
    return this.readThreadStatus(threadId, { ensureResumed: false });
  }
  /**
   * Ensure this App Server process is subscribed to a historical thread.
   *
   * Codex's `thread/read` endpoint is intentionally non-resuming: it returns
   * the stored snapshot but does not attach the connection to future
   * notifications. Resuming loads a writer in this App Server; it does not
   * subscribe to a different App Server's live output. Concurrent
   * status/read calls share one resume request, and the completed set avoids
   * issuing a resume on every two-second heartbeat.
   */
  ensureThreadResumed(threadId) {
    const id = normalizeThreadId(threadId);
    if (this.#resumedThreads.has(id)) return Promise.resolve();
    const retryAt = this.#resumeRetryAt.get(id) || 0;
    if (retryAt > Date.now()) return Promise.resolve();
    const existing = this.#resumingThreads.get(id);
    if (existing) return existing;
    const pending = this.resumeThread(id).then(() => {
      this.#rememberResumedThread(id);
      this.#resumeRetryAt.delete(id);
    }).catch((error) => {
      if (!isActiveWriterConflict(error)) throw error;
      this.#rememberResumeRetry(id, Date.now() + 6e4);
      this.logger.warn("app-server", "\u4EFB\u52A1\u6B63\u5728\u5176\u4ED6 Codex \u5BA2\u6237\u7AEF\u8FD0\u884C\uFF0C\u6682\u4EE5\u5FEB\u7167\u540C\u6B65", {
        threadId: id
      });
    }).finally(() => {
      if (this.#resumingThreads.get(id) === pending) {
        this.#resumingThreads.delete(id);
      }
    });
    this.#resumingThreads.set(id, pending);
    return pending;
  }
  // Call only after the command router has checked project access.
  async subscribeThread(_threadId) {
    return false;
  }
  #rememberResumedThread(id) {
    this.#subscriptions.delete(id);
    this.#subscriptions.add(id);
    while (this.#subscriptions.size > _AppServerClient.MAX_RESUMED_THREADS) {
      const retired = this.#subscriptions.values().next().value;
      this.#subscriptions.delete(retired);
      this.request("thread/unsubscribe", { threadId: retired }).catch(() => {
      });
    }
    this.#resumedThreads.delete(id);
    this.#resumedThreads.add(id);
    while (this.#resumedThreads.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumedThreads.delete(this.#resumedThreads.values().next().value);
    }
  }
  #rememberResumeRetry(id, retryAt) {
    this.#resumeRetryAt.delete(id);
    this.#resumeRetryAt.set(id, retryAt);
    while (this.#resumeRetryAt.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumeRetryAt.delete(this.#resumeRetryAt.keys().next().value);
    }
  }
  async #readPaginatedThread(threadId) {
    const metadata = await this.request("thread/read", { threadId });
    const turns = await this.#readAllThreadTurns(threadId);
    const metadataMap = isObject(metadata) ? metadata : {};
    const thread = isObject(metadataMap.thread) ? metadataMap.thread : metadataMap;
    const hydrated = { ...thread, turns };
    return isObject(metadataMap.thread) ? { ...metadataMap, thread: hydrated } : hydrated;
  }
  async #readAllThreadTurns(threadId) {
    const turns = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/turns/list", {
        threadId,
        cursor,
        limit: 100,
        sortDirection: "asc",
        itemsView: "full"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const turn of data) {
        if (!isObject(turn)) continue;
        const items = turn.itemsView === "full" && Array.isArray(turn.items) ? turn.items : await this.#readAllThreadItems(threadId, turn.id);
        turns.push({ ...turn, items });
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return turns;
  }
  async #readAllThreadItems(threadId, turnId) {
    if (typeof turnId !== "string" || !turnId) return [];
    const items = [];
    let cursor = null;
    for (let page = 0; page < 1e3; page += 1) {
      const response = await this.request("thread/items/list", {
        threadId,
        turnId,
        cursor,
        limit: 100,
        sortDirection: "asc"
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const entry of data) {
        if (isObject(entry?.item)) items.push(entry.item);
      }
      const nextCursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : null;
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return items;
  }
  async createThread({ cwd } = {}) {
    const result = await this.request("thread/start", { ...cwd ? { cwd } : {} });
    const id = result?.thread?.id || result?.id;
    if (id) {
      this.#rememberResumedThread(normalizeThreadId(id));
      this.#rememberThreadSettings(id, result);
    }
    return { ...result, ...this.threadSettings(id) ? { threadSettings: this.threadSettings(id) } : {} };
  }
  async resumeThread(threadId) {
    const id = normalizeThreadId(threadId);
    const transport = this.#transport;
    const previousSettings = this.#threadSettings.get(id);
    const result = await this.request("thread/resume", { threadId: id });
    if (transport !== this.#transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u4EFB\u52A1\u8BA2\u9605\u7684\u8FDE\u63A5\u5DF2\u8FC7\u671F");
    this.#rememberResumedThread(id);
    if (this.#threadSettings.get(id) === previousSettings) this.#rememberThreadSettings(id, result);
    return result;
  }
  threadSettings(threadId) {
    const value = this.#threadSettings.get(threadId);
    return value ? structuredClone(value) : null;
  }
  /** Refresh the process-local composer cache from an authoritative read. */
  rememberThreadSettings(threadId, value) {
    this.#rememberThreadSettings(threadId, value);
  }
  #rememberThreadSettings(threadId, value) {
    const settings = composerSettings(value);
    if (!settings || !threadId) return;
    const id = normalizeThreadId(threadId);
    if (!id) return;
    const previous = this.#threadSettings.get(id) || {};
    this.#threadSettings.delete(id);
    this.#threadSettings.set(id, {
      ...previous,
      ...settings,
      revision: ++this.#settingsRevision
    });
    while (this.#threadSettings.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#threadSettings.delete(this.#threadSettings.keys().next().value);
    }
  }
  async updateThreadSettings(threadId, patch) {
    const id = normalizeThreadId(threadId);
    await this.ensureThreadResumed(id);
    const previous = this.#threadSettings.get(id);
    await this.request("thread/settings/update", { threadId: id, ...patch });
    if (this.#threadSettings.get(id) === previous) await this.resumeThread(id);
    if (!this.threadSettings(id)) throw new RelayError("APP_SERVER_ERROR", "Codex \u672A\u8FD4\u56DE\u4EFB\u52A1\u8BBE\u7F6E\uFF0C\u8BF7\u5347\u7EA7 Codex \u540E\u91CD\u8BD5");
    return { threadId: id, threadSettings: this.threadSettings(id) };
  }
  async startTurn({ threadId, text: text3, cwd, model, effort, images = [] }) {
    const id = normalizeThreadId(threadId);
    const params = {
      threadId: id,
      input: [...text3 ? [{ type: "text", text: text3 }] : [], ...images],
      ...cwd ? { cwd } : {},
      ...model ? { model } : {},
      ...effort ? { effort } : {}
    };
    try {
      const result = await this.request("turn/start", params);
      this.#rememberResumedThread(id);
      return result;
    } catch (error) {
      if (isActiveWriterConflict(error)) throw activeWriterError(id, error);
      if (!isThreadNotLoadedError(error)) throw error;
      await this.resumeThread(id);
      try {
        return await this.request("turn/start", params);
      } catch (retryError) {
        if (isActiveWriterConflict(retryError)) throw activeWriterError(id, retryError);
        throw retryError;
      }
    }
  }
  async steerTurn({ threadId, turnId, text: text3 }) {
    try {
      return await this.request("turn/steer", {
        threadId,
        expectedTurnId: turnId,
        input: [{ type: "text", text: text3 }]
      });
    } catch (error) {
      if (isActiveWriterConflict(error)) throw activeWriterError(threadId, error);
      throw error;
    }
  }
  async interruptTurn({ threadId, turnId }) {
    const key = JSON.stringify([threadId, turnId]);
    if (this.#interrupts.has(key)) return this.#interrupts.get(key);
    const generation = this.#generation;
    const execute = async () => {
      const deadline = Date.now() + (this.options.interruptRetryMs ?? 5e3);
      while (true) {
        if (generation !== this.#generation || !this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u505C\u6B62\u8BF7\u6C42\u672A\u786E\u8BA4\uFF0C\u8BF7\u6062\u590D\u8FDE\u63A5\u540E\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001");
        const recent = await this.request("thread/turns/list", { threadId, limit: 2, sortDirection: "desc", itemsView: "notLoaded" }).catch(async (error) => {
          if (!isActiveWriterConflict(error)) throw error;
          return { data: (await this.readThreadSnapshot(threadId)).thread?.turns || [] };
        });
        const turns = recent.data || [];
        const target = turns.find((turn) => turn.id === turnId);
        if (target && ["completed", "failed", "interrupted"].includes(target.status)) return { threadId, turnId, status: "alreadyFinished", turnStatus: target.status };
        if (turns.some((turn) => turn.id !== turnId && ["inProgress", "in_progress"].includes(turn.status))) throw new RelayError("TURN_CHANGED", "\u5F53\u524D\u8F6E\u6B21\u5DF2\u7ECF\u6539\u53D8\uFF0C\u672A\u4E2D\u65AD\u65B0\u7684\u4EFB\u52A1");
        if (!target) {
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "\u627E\u4E0D\u5230\u6307\u5B9A\u8F6E\u6B21\uFF0C\u672A\u4E2D\u65AD\u5176\u4ED6\u4EFB\u52A1\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
          await new Promise((resolve) => setTimeout(resolve, this.options.interruptPollMs ?? 100));
          continue;
        }
        try {
          try {
            await this.request("turn/interrupt", { threadId, turnId });
          } catch (error) {
            if (isActiveWriterConflict(error)) throw activeWriterError(threadId, error);
            throw error;
          }
          return { threadId, turnId, status: "requested" };
        } catch (error) {
          if (error.code !== "APP_SERVER_ERROR" || !/no active turn to interrupt/i.test(error.message)) throw error;
          if (Date.now() >= deadline) throw new RelayError("INTERRUPT_NOT_CONFIRMED", "\u5C1A\u672A\u786E\u8BA4\u4EFB\u52A1\u5F00\u59CB\u6267\u884C\uFF0C\u505C\u6B62\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
          await new Promise((resolve) => setTimeout(resolve, this.options.interruptPollMs ?? 100));
        }
      }
    };
    const pending = execute().finally(() => this.#interrupts.delete(key));
    this.#interrupts.set(key, pending);
    return pending;
  }
  pendingInteractions(threadId) {
    return [...this.#interactions.entries.values()].filter((entry) => entry.params.threadId === threadId).map((entry) => this.#interactions.public(entry, this.configStore.get()));
  }
  getInteraction(approvalId) {
    return this.#interactions.get(approvalId);
  }
  respondToApproval(approvalId, decision) {
    return this.#respondToInteraction(approvalId, { decision }, "approval");
  }
  respondToUserInput(approvalId, answers) {
    return this.#respondToInteraction(approvalId, { answers }, "userInput");
  }
  #respondToInteraction(approvalId, payload, kind) {
    const entry = this.#interactions.get(approvalId);
    const result = this.#interactions.validateResponse(entry, payload, kind);
    this.#write({ jsonrpc: "2.0", id: entry.backendId, result });
    entry.responding = true;
    this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
    return { approvalId, status: "submitted" };
  }
  #write(message) {
    if (!this.#transport?.writable) throw new RelayError("APP_SERVER_UNAVAILABLE", "Codex App Server \u672A\u8FD0\u884C");
    this.#transport.send(JSON.stringify(message));
  }
  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.warn("app-server", "\u5FFD\u7565\u975E JSON \u8F93\u51FA", { line });
      return;
    }
    if (message.id !== void 0 && !message.method) {
      const pending = this.#requests.get(message.id);
      if (!pending) return;
      this.#requests.delete(message.id);
      if (message.error) pending.reject(new RelayError("APP_SERVER_ERROR", message.error.message || "App Server \u8BF7\u6C42\u5931\u8D25", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== void 0 && message.method) {
      if (!_AppServerClient.APPROVAL_METHODS.has(message.method) && !["tool/requestUserInput", "item/tool/requestUserInput"].includes(message.method)) {
        this.logger.warn("app-server", "\u62D2\u7EDD\u4E0D\u53D7\u652F\u6301\u7684 App Server \u5BA2\u6237\u7AEF\u8BF7\u6C42", { method: message.method });
        this.#write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `Client request not supported: ${message.method}` }
        });
        return;
      }
      if (!message.params?.threadId) return;
      const entry = this.#interactions.add(message);
      this.emit("approval", this.#interactions.public(entry, this.configStore.get()));
      return;
    }
    let resolved = [];
    if (message.method === "serverRequest/resolved") resolved = this.#interactions.resolve(message.params?.requestId, message.params?.threadId);
    if (message.method === "turn/completed") resolved = this.#interactions.clearThread(message.params?.threadId, message.params?.turn?.id);
    if (message.method === "thread/closed" || message.method === "thread/deleted") {
      this.#resumedThreads.delete(message.params?.threadId);
      this.#subscriptions.delete(message.params?.threadId);
      resolved = this.#interactions.clearThread(message.params?.threadId);
    }
    for (const entry of resolved) this.emit("interactionResolved", this.#interactions.public(entry, this.configStore.get()));
    if (message.method === "thread/settings/updated") {
      this.#rememberThreadSettings(message.params?.threadId, message.params?.threadSettings);
      message.params = { threadId: message.params?.threadId, threadSettings: this.threadSettings(message.params?.threadId) };
    }
    if (message.method) this.emit("notification", message.method, message.params || {});
  }
  #handleExit(transport, error) {
    if (this.#transport !== transport) return;
    this.#transport = null;
    this.#resetConnectionState();
    this.lastError = error.message;
    this.state = "error";
    this.#rejectRequests(new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u4E2D\u65AD\uFF1B\u672A\u786E\u8BA4\u7684\u547D\u4EE4\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1"));
    transport.close().catch(() => {
    });
    this.#scheduleReconnect();
    this.emit("status", this.status());
  }
};
function normalizeThreadId(threadId) {
  const id = typeof threadId === "string" ? threadId.trim() : String(threadId || "").trim();
  if (!id) throw new RelayError("INVALID_MESSAGE", "threadId \u4E0D\u80FD\u4E3A\u7A7A");
  return id;
}
function dedupeThreadList(threads) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  const indexes = /* @__PURE__ */ new Map();
  for (const thread of threads) {
    if (!isObject(thread)) {
      unique.push(thread);
      continue;
    }
    const rawId = thread.id ?? thread.threadId ?? thread.thread_id;
    const id = typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id) {
      unique.push(thread);
      continue;
    }
    if (seen.has(id)) {
      const index = indexes.get(id);
      const previous = index == null ? null : unique[index];
      if (previous && threadRecency(thread) > threadRecency(previous)) {
        unique[index] = thread;
      }
      continue;
    }
    seen.add(id);
    indexes.set(id, unique.length);
    unique.push(thread);
  }
  return unique;
}
function sortThreadList(threads, direction = "desc", sortKey = "recency_at") {
  const hasTimestamp = (thread) => [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at"
  ].some((key) => timestampValue(thread?.[key]) !== null);
  if (!threads.every(hasTimestamp)) return [...threads];
  const factor = direction === "asc" ? -1 : 1;
  const primaryKeys = sortKey === "updated_at" ? ["updatedAt", "updated_at", "createdAt", "created_at"] : ["recencyAt", "recency_at", "updatedAt", "updated_at", "createdAt", "created_at"];
  return [...threads].sort((left, right) => {
    const recency = threadTimestamp(right, primaryKeys) - threadTimestamp(left, primaryKeys);
    if (recency !== 0) return factor * recency;
    const updated = threadTimestamp(right, ["updatedAt", "updated_at"]) - threadTimestamp(left, ["updatedAt", "updated_at"]);
    if (updated !== 0) return factor * updated;
    const created = threadTimestamp(right, ["createdAt", "created_at"]) - threadTimestamp(left, ["createdAt", "created_at"]);
    if (created !== 0) return factor * created;
    const leftId = String(left?.id ?? left?.threadId ?? left?.thread_id ?? "");
    const rightId = String(right?.id ?? right?.threadId ?? right?.thread_id ?? "");
    return factor * rightId.localeCompare(leftId);
  });
}
function dedupeProjectList(projects) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const project of projects) {
    if (!isObject(project)) {
      unique.push(project);
      continue;
    }
    const id = String(project.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(project);
  }
  return unique;
}
function sortProjectList(projects) {
  if (!projects.every((project) => Number.isFinite(Number(project?.position)))) {
    return [...projects];
  }
  return [...projects].sort((left, right) => {
    const position = Number(left.position) - Number(right.position);
    if (position !== 0) return position;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}
function threadRecency(thread) {
  return threadTimestamp(thread, [
    "recencyAt",
    "recency_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at"
  ]);
}
function threadTimestamp(thread, keys) {
  for (const key of keys) {
    const value = thread?.[key];
    const timestamp = timestampValue(value);
    if (timestamp !== null) return timestamp;
  }
  return 0;
}
function timestampValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) < 1e11 ? value * 1e3 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) < 1e11 ? numeric * 1e3 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function isUnsupportedThreadSort(error) {
  if (error?.code && error.code !== "APP_SERVER_ERROR") return false;
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("recency_at") || message.includes("sortdirection") || message.includes("sort direction") || message.includes("sort key") || message.includes("sort_key") || message.includes("unsupported sort") || message.includes("unknown sort");
}
function isActiveWriterConflict(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && /already has an active writer/i.test(error.message);
}
async function ensureAppServerDaemon(config) {
  const socket = String(config.appServerSocket || "").replace(/^~(?=\/|$)/, process.env.HOME || "");
  if (!socket) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u5171\u4EAB App Server \u672A\u914D\u7F6E Unix Socket \u8DEF\u5F84");
  try {
    const stat = await fs3.stat(socket);
    if (stat.isSocket()) return;
  } catch {
  }
  try {
    await execFileAsync(config.executable || "codex", ["app-server", "daemon", "start"], {
      cwd: config.defaultWorkingDirectory || process.cwd(),
      env: process.env,
      timeout: 2e4,
      maxBuffer: 64 * 1024
    });
  } catch (error) {
    throw new RelayError(
      "APP_SERVER_UNAVAILABLE",
      `\u65E0\u6CD5\u81EA\u52A8\u542F\u52A8\u5171\u4EAB App Server Daemon\uFF1A${String(error.stderr || error.message || "\u542F\u52A8\u5931\u8D25").trim()}`
    );
  }
}
function activeWriterError(threadId, cause) {
  return new RelayError(
    "THREAD_WRITER_BUSY",
    "\u8BE5\u4EFB\u52A1\u6B63\u5728\u684C\u9762\u7AEF Codex \u4E2D\u8FD0\u884C\uFF0C\u624B\u673A\u547D\u4EE4\u672A\u53D1\u9001\u3002\u8BF7\u7B49\u5F85\u684C\u9762\u4EFB\u52A1\u7ED3\u675F\uFF0C\u6216\u8BA9\u684C\u9762\u7AEF\u8FDE\u63A5\u5171\u4EAB App Server \u540E\u91CD\u8BD5\u3002",
    { threadId, cause: cause?.message || "active writer" }
  );
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}
function isThreadNotLoadedError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && /\bthread\s+not\s+found\b/i.test(error.message);
}

// server/command-router.js
import { createHash as createHash3 } from "node:crypto";

// server/utils.js
import crypto from "node:crypto";
import path4 from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = path4.resolve(path4.dirname(fileURLToPath(import.meta.url)), "..");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
function redact(value) {
  if (typeof value === "string") {
    return value.replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]").replace(/("?(?:token|connect[_-]?token|endpoint[_-]?grant|grant|secret|authorization|api[_-]?key|private[_-]?key|signature)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[REDACTED]");
  }
  return JSON.parse(redact(JSON.stringify(value)));
}
function normalizeRelayUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws:// \u6216 wss://");
  }
  if (!url.hostname) throw new Error("Relay \u5730\u5740\u7F3A\u5C11\u4E3B\u673A\u540D");
  if (url.username || url.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  if (url.search || url.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/v1/connect";
  if (url.pathname !== "/v1/connect") throw new Error("Relay \u5730\u5740\u5FC5\u987B\u4F7F\u7528 /v1/connect");
  return url.toString();
}
function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "localhost"].includes(hostname);
}
function safeProjectPath(projectPath, allowedProjects) {
  if (!projectPath) return null;
  const candidate = path4.resolve(projectPath);
  if (!allowedProjects?.length) return candidate;
  const allowed = allowedProjects.some((root) => {
    const normalizedRoot = path4.resolve(root);
    const relative = path4.relative(normalizedRoot, candidate);
    return relative === "" || !relative.startsWith("..") && !path4.isAbsolute(relative);
  });
  return allowed ? candidate : null;
}
function filterThreadList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((thread) => Boolean(thread?.cwd && safeProjectPath(thread.cwd, allowedProjects)))
  };
}
function filterProjectList(result, allowedProjects) {
  if (!allowedProjects?.length || !Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.filter((project) => {
      const roots = Array.isArray(project?.roots) ? project.roots : [];
      return roots.some((root) => {
        const projectPath = typeof root === "string" ? root : root?.path;
        return Boolean(projectPath && safeProjectPath(projectPath, allowedProjects));
      });
    })
  };
}

// server/config-store.js
import fs6 from "node:fs/promises";
import os4 from "node:os";
import path7 from "node:path";

// server/secret-store.js
import crypto2 from "node:crypto";
import fs4 from "node:fs/promises";
import path5 from "node:path";
var SecretStore = class {
  constructor(configDir, logger) {
    this.configDir = configDir;
    this.logger = logger;
    this.fallbackFile = path5.join(configDir, "secrets.json");
    this.cache = /* @__PURE__ */ new Map();
    this.writeQueue = Promise.resolve();
  }
  async get(spaceId) {
    const credential = await this.getCredential(spaceId);
    return credential?.connectToken || null;
  }
  async getCredential(spaceId) {
    const key = spaceId || "default";
    const environmentToken = process.env.CODEX_RELAY_TOKEN?.trim();
    if (environmentToken) {
      const persisted = await this.getPersistedCredential(key);
      const candidate = {
        ...persisted || {},
        connectToken: environmentToken
      };
      if (persisted?.connectToken && persisted.connectToken !== environmentToken) {
        delete candidate.expiresAt;
      }
      const credential = validateCredential(candidate);
      return cloneCredential(credential);
    }
    return this.getPersistedCredential(key);
  }
  /**
   * Read the credential written to disk without applying the optional
   * CODEX_RELAY_TOKEN runtime override.  Refresh responses must use this view
   * when they need authoritative expiry metadata; otherwise an environment
   * token would mask the newly rotated token forever.
   */
  async getPersistedCredential(spaceId) {
    const key = spaceId || "default";
    if (this.cache.has(key)) return cloneCredential(this.cache.get(key));
    const values = await this.#readFallback();
    const credential = values[key] ? validateCredential(values[key]) : null;
    this.cache.set(key, credential);
    return cloneCredential(credential);
  }
  async set(spaceId, credential) {
    const key = spaceId || "default";
    if (!credential) return this.delete(key);
    const normalized = validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return { backend: "file" };
    });
  }
  async update(spaceId, patch, expectedCredential) {
    const key = spaceId || "default";
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("Relay \u51ED\u8BC1\u66F4\u65B0\u683C\u5F0F\u65E0\u6548");
    }
    if (Object.keys(patch).length === 0) return this.getPersistedCredential(key);
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      const persisted = values[key] ? validateCredential(values[key]) : null;
      const current = persisted || {};
      if (expectedCredential && !matchesCredential(current, expectedCredential)) {
        return null;
      }
      const next = { ...current, ...patch };
      if (Object.hasOwn(patch, "connectToken") && (patch.connectToken === "" || patch.connectToken === null || patch.connectToken === void 0)) {
        delete next.connectToken;
        delete next.expiresAt;
      }
      if (Object.hasOwn(patch, "endpointGrant") && (patch.endpointGrant === "" || patch.endpointGrant === null || patch.endpointGrant === void 0)) {
        delete next.endpointGrant;
        delete next.grantExpiresAt;
      }
      if (Object.hasOwn(patch, "connectToken") && typeof patch.connectToken === "string" && patch.connectToken.trim() && patch.connectToken !== current.connectToken && !Object.hasOwn(patch, "expiresAt")) {
        delete next.expiresAt;
      }
      if (Object.hasOwn(patch, "endpointGrant") && typeof patch.endpointGrant === "string" && patch.endpointGrant.trim() && patch.endpointGrant !== current.endpointGrant && !Object.hasOwn(patch, "grantExpiresAt")) {
        delete next.grantExpiresAt;
      }
      for (const name of ["expiresAt", "grantExpiresAt", "tokenEndpoint"]) {
        if (next[name] === null || next[name] === "" || next[name] === void 0) {
          delete next[name];
        }
      }
      for (const name of Object.keys(next)) {
        if (next[name] === void 0) delete next[name];
      }
      if (!Object.keys(next).length) {
        delete values[key];
        await this.#writeFallback(values);
        this.cache.set(key, null);
        return null;
      }
      const normalized = validateCredential(next);
      values[key] = normalized;
      await this.#writeFallback(values);
      this.cache.set(key, normalized);
      return cloneCredential(normalized);
    });
  }
  validate(credential) {
    return validateCredential(typeof credential === "string" ? { connectToken: credential } : credential);
  }
  async delete(spaceId) {
    const key = spaceId || "default";
    return this.#enqueue(async () => {
      const values = await this.#readFallback();
      delete values[key];
      await this.#writeFallback(values);
      this.cache.set(key, null);
    });
  }
  async #readFallback() {
    try {
      return JSON.parse(await fs4.readFile(this.fallbackFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async #writeFallback(values) {
    await fs4.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.fallbackFile}.${process.pid}.${crypto2.randomUUID()}.tmp`;
    await fs4.writeFile(temporary, `${JSON.stringify(values, null, 2)}
`, { mode: 384 });
    await fs4.rename(temporary, this.fallbackFile);
    await fs4.chmod(this.fallbackFile, 384);
  }
  #enqueue(operation) {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => void 0);
    return next;
  }
};
function validateCredential(value) {
  if (typeof value === "string") value = { connectToken: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Relay \u51ED\u8BC1\u683C\u5F0F\u65E0\u6548");
  }
  const connectToken = validateSecret(value.connectToken, "Connect Token", false);
  const endpointGrant = validateSecret(value.endpointGrant, "Endpoint Grant", false);
  if (!connectToken && !endpointGrant) throw new Error("Connect Token \u6216 Endpoint Grant \u81F3\u5C11\u9700\u8981\u4E00\u4E2A");
  const expiresAt = validateExpiry(value.expiresAt, "Connect Token");
  const grantExpiresAt = validateExpiry(value.grantExpiresAt, "Endpoint Grant");
  const tokenEndpoint = validateTokenEndpoint(value.tokenEndpoint);
  return {
    ...connectToken === void 0 ? {} : { connectToken },
    ...expiresAt === void 0 ? {} : { expiresAt },
    ...endpointGrant === void 0 ? {} : { endpointGrant },
    ...grantExpiresAt === void 0 ? {} : { grantExpiresAt },
    ...tokenEndpoint === void 0 ? {} : { tokenEndpoint }
  };
}
function validateSecret(value, label, required) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new Error(`${label} \u4E0D\u80FD\u4E3A\u7A7A`);
    return void 0;
  }
  const minimum = label === "Endpoint Grant" ? 16 : 1;
  if (typeof value !== "string" || value.length < minimum || value.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} \u683C\u5F0F\u65E0\u6548`);
  }
  return value;
}
function validateExpiry(value, label) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} \u8FC7\u671F\u65F6\u95F4\u65E0\u6548`);
  return value;
}
function validateTokenEndpoint(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Token Endpoint \u65E0\u6548");
  const endpoint = new URL(value);
  if (!endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Token Endpoint \u4E0D\u80FD\u5305\u542B\u51ED\u8BC1\u3001query \u6216 hash");
  }
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
    throw new Error("\u975E\u672C\u673A Token Endpoint \u5FC5\u987B\u4F7F\u7528 https://");
  }
  return endpoint.toString();
}
function cloneCredential(value) {
  return value ? { ...value } : null;
}
function matchesCredential(current, expected) {
  const candidate = typeof expected === "string" ? { connectToken: expected } : expected;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const expectedValue = candidate[field];
    if (expectedValue === null || expectedValue === void 0) {
      if (current?.[field] !== void 0) return false;
    } else if (current?.[field] !== expectedValue) {
      return false;
    }
  }
  return true;
}

// server/endpoint-identity-store.js
import crypto3 from "node:crypto";
import fs5 from "node:fs/promises";
import path6 from "node:path";
var EndpointIdentityStore = class {
  constructor(configDir) {
    this.configDir = configDir;
    this.file = path6.join(configDir, "endpoint-identity.json");
    this.identity = null;
  }
  async get() {
    if (this.identity) return { ...this.identity };
    try {
      this.identity = this.#validate(JSON.parse(await fs5.readFile(this.file, "utf8")));
      await fs5.chmod(this.file, 384);
      return { ...this.identity };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pair = crypto3.generateKeyPairSync("ed25519");
    const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
    const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const identity = {
      schemaVersion: 1,
      publicKey: Buffer.from(publicDer).subarray(-32).toString("base64url"),
      privateKey: Buffer.from(privateDer).toString("base64url")
    };
    await fs5.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.file}.${process.pid}.${crypto3.randomUUID()}.tmp`;
    await fs5.writeFile(temporary, `${JSON.stringify(identity, null, 2)}
`, { mode: 384 });
    await fs5.rename(temporary, this.file);
    await fs5.chmod(this.file, 384);
    this.identity = identity;
    return { ...identity };
  }
  #validate(value) {
    if (!value || value.schemaVersion !== 1) throw new Error("Endpoint identity schema is invalid");
    const publicBytes = Buffer.from(value.publicKey || "", "base64url");
    const privateBytes = Buffer.from(value.privateKey || "", "base64url");
    if (publicBytes.length !== 32 || publicBytes.toString("base64url") !== value.publicKey || privateBytes.length < 32 || privateBytes.toString("base64url") !== value.privateKey) {
      throw new Error("Endpoint identity key material is invalid");
    }
    return { schemaVersion: 1, publicKey: value.publicKey, privateKey: value.privateKey };
  }
};

// server/config-store.js
var DEFAULT_PERMISSIONS = Object.freeze({
  readThreads: true,
  sendMessages: true,
  createThreads: true,
  steerTurns: true,
  interruptTurns: true,
  respondToApprovals: false
});
var DEFAULT_APP_SERVER_SOCKET = path7.join(os4.homedir(), ".codex", "app-server-control", "app-server-control.sock");
function defaultConfig() {
  return {
    version: 1,
    relay: {
      url: "",
      spaceId: "",
      endpointId: "",
      deviceId: randomId("host"),
      deviceName: os4.hostname(),
      autoConnect: false,
      heartbeatSeconds: 20,
      reconnectMaxSeconds: 30
    },
    codex: {
      executable: "codex",
      autoStartAppServer: true,
      defaultWorkingDirectory: "",
      appServerTransport: "stdio",
      appServerSocket: DEFAULT_APP_SERVER_SOCKET
    },
    permissions: { ...DEFAULT_PERMISSIONS },
    allowedProjects: [],
    readOnly: false
  };
}
var ConfigStore = class {
  constructor({ configDir, logger } = {}) {
    this.configDir = configDir || process.env.CODEX_RELAY_CONFIG_DIR || path7.join(os4.homedir(), ".codex-relay-plugin");
    this.configFile = path7.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.endpointIdentityStore = new EndpointIdentityStore(this.configDir);
    this.config = null;
  }
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs6.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const migrated = migrateSavedConfig(saved);
    this.config = mergeConfig(defaultConfig(), migrated);
    validateConfig(this.config);
    if (migrated !== saved) {
      await fs6.mkdir(this.configDir, { recursive: true, mode: 448 });
      await fs6.writeFile(this.configFile, `${JSON.stringify(this.config, null, 2)}
`, { mode: 384 });
      await fs6.chmod(this.configFile, 384);
    }
    return this.config;
  }
  get() {
    if (!this.config) throw new Error("\u914D\u7F6E\u5C1A\u672A\u52A0\u8F7D");
    return structuredClone(this.config);
  }
  preview(patch) {
    const next = mergeConfig(this.get(), patch || {});
    validateConfig(next);
    return next;
  }
  async publicConfig({ includeToken = false } = {}) {
    const config = this.get();
    const credential = await this.secretStore.getCredential(relaySpaceId(config.relay));
    const identity = await this.endpointIdentityStore.get();
    const credentialConfigured = Boolean(credential?.connectToken || credential?.endpointGrant);
    return {
      ...config,
      relay: {
        ...config.relay,
        ...includeToken ? {
          token: credential?.connectToken || "",
          ...credential?.endpointGrant ? { endpointGrant: credential.endpointGrant } : {}
        } : {},
        tokenConfigured: Boolean(credential?.connectToken),
        credentialConfigured,
        tokenExpiresAt: credential?.expiresAt || null,
        endpointGrantConfigured: Boolean(credential?.endpointGrant),
        grantExpiresAt: credential?.grantExpiresAt || null,
        tokenEndpoint: credential?.tokenEndpoint || "",
        endpointPublicKey: identity.publicKey
      }
    };
  }
  async update(patch, credentialPatch) {
    const next = this.preview(patch);
    const nextSpace = relaySpaceId(next.relay);
    let credentialTouched = false;
    if (credentialPatch !== void 0) {
      credentialTouched = true;
      if (typeof credentialPatch === "string") credentialPatch = { connectToken: credentialPatch };
      if (!credentialPatch || typeof credentialPatch !== "object" || Array.isArray(credentialPatch)) {
        throw new Error("Relay Token \u51ED\u8BC1\u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      if (Object.hasOwn(credentialPatch, "token")) {
        throw new Error("Relay Token \u5FC5\u987B\u901A\u8FC7\u5B57\u7B26\u4E32\u6216 connectToken \u5B57\u6BB5\u63D0\u4F9B");
      }
      if (Object.keys(credentialPatch).length === 0) credentialTouched = false;
      const current = credentialTouched ? await this.secretStore.getPersistedCredential(nextSpace) || {} : {};
      const credential = { ...current };
      if (Object.hasOwn(credentialPatch, "connectToken")) {
        const nextToken = credentialPatch.connectToken;
        if (nextToken === null || nextToken === "" || nextToken === void 0) {
          delete credential.connectToken;
          delete credential.expiresAt;
        } else if (typeof nextToken === "string" && nextToken.trim()) {
          if (nextToken !== current.connectToken) delete credential.expiresAt;
          credential.connectToken = nextToken;
        } else {
          throw new Error("Connect Token \u683C\u5F0F\u65E0\u6548");
        }
      }
      if (Object.hasOwn(credentialPatch, "expiresAt")) {
        if (credentialPatch.expiresAt === null || credentialPatch.expiresAt === "" || credentialPatch.expiresAt === void 0) delete credential.expiresAt;
        else credential.expiresAt = credentialPatch.expiresAt;
      }
      for (const name of ["endpointGrant", "grantExpiresAt", "tokenEndpoint"]) {
        if (!Object.hasOwn(credentialPatch, name)) continue;
        const value = credentialPatch[name];
        if (value === "" || value === null || value === void 0) {
          delete credential[name];
        } else {
          if (name === "endpointGrant" && value !== current.endpointGrant && !Object.hasOwn(credentialPatch, "grantExpiresAt")) {
            delete credential.grantExpiresAt;
          }
          credential[name] = value;
        }
      }
      if (Object.keys(credential).length) this.secretStore.validate(credential);
    }
    await fs6.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.configFile}.tmp`;
    await fs6.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    await fs6.rename(temporary, this.configFile);
    await fs6.chmod(this.configFile, 384);
    this.config = next;
    if (credentialTouched) {
      await this.secretStore.update(nextSpace, credentialPatch);
    }
    this.logger?.info("config", "\u914D\u7F6E\u5DF2\u4FDD\u5B58", { relayUrl: next.relay.url, spaceId: nextSpace });
    return this.publicConfig();
  }
  async relayCredential(options = {}) {
    const spaceId = relaySpaceId(this.get().relay);
    if (options?.ignoreEnvironment === true) {
      return this.secretStore.getPersistedCredential(spaceId);
    }
    return this.secretStore.getCredential(spaceId);
  }
  async persistedRelayCredential() {
    return this.secretStore.getPersistedCredential(relaySpaceId(this.get().relay));
  }
  async token() {
    const credential = await this.relayCredential();
    return credential?.connectToken || null;
  }
  async updateRelayCredential(patch, expectedCredential) {
    const spaceId = relaySpaceId(this.get().relay);
    return this.secretStore.update(spaceId, patch, expectedCredential);
  }
  async endpointIdentity() {
    return this.endpointIdentityStore.get();
  }
};
function mergeConfig(base, patch) {
  const relayPatch = patch.relay || {};
  const spaceId = relayPatch.spaceId ?? base.relay.spaceId ?? "";
  return {
    ...base,
    ...patch,
    relay: { ...base.relay, ...relayPatch, spaceId },
    codex: {
      executable: patch.codex?.executable ?? base.codex.executable,
      autoStartAppServer: patch.codex?.autoStartAppServer ?? base.codex.autoStartAppServer,
      defaultWorkingDirectory: patch.codex?.defaultWorkingDirectory ?? base.codex.defaultWorkingDirectory,
      appServerTransport: patch.codex?.appServerTransport ?? base.codex.appServerTransport,
      appServerSocket: patch.codex?.appServerSocket ?? base.codex.appServerSocket
    },
    permissions: { ...base.permissions, ...patch.permissions || {} },
    allowedProjects: Array.isArray(patch.allowedProjects) ? patch.allowedProjects : base.allowedProjects
  };
}
function relaySpaceId(relay) {
  return String(relay?.spaceId || "");
}
function relayEndpointId(relay) {
  return String(relay?.endpointId || "");
}
function migrateSavedConfig(saved) {
  if (!saved || typeof saved !== "object") return saved;
  let migrated = saved;
  if (saved.codex && typeof saved.codex === "object" && (Object.hasOwn(saved.codex, "connectionMode") || Object.hasOwn(saved.codex, "appServerEndpoint"))) {
    const { connectionMode: _connectionMode, appServerEndpoint: _appServerEndpoint, ...codex } = saved.codex;
    migrated = { ...migrated, codex };
  }
  if (!saved.relay || typeof saved.relay !== "object") return migrated;
  if (Object.hasOwn(saved.relay, "endpointId")) return migrated;
  const legacyDeviceId = typeof saved.relay.deviceId === "string" ? saved.relay.deviceId : "";
  const endpointId = legacyDeviceId && !legacyDeviceId.startsWith("host_") ? legacyDeviceId : "";
  return { ...migrated, relay: { ...migrated.relay, endpointId } };
}
function validateConfig(config) {
  if (!config || typeof config !== "object" || config.version !== 1) throw new Error("\u914D\u7F6E\u7248\u672C\u65E0\u6548");
  if (!config.relay || typeof config.relay !== "object") throw new Error("Relay \u914D\u7F6E\u65E0\u6548");
  if (config.relay.url) {
    const normalizedRelayUrl = normalizeRelayUrl(config.relay.url);
    const relayUrl = new URL(normalizedRelayUrl);
    config.relay.url = normalizedRelayUrl;
    if (relayUrl.protocol !== "wss:" && !isLoopbackHostname(relayUrl.hostname)) {
      throw new Error("\u975E\u672C\u673A Relay \u5FC5\u987B\u4F7F\u7528 wss:// \u52A0\u5BC6\u8FDE\u63A5");
    }
    if (relayUrl.username || relayUrl.password) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
    if (relayUrl.search || relayUrl.hash) throw new Error("Relay \u5730\u5740\u4E0D\u80FD\u5305\u542B query \u6216 hash\uFF1BToken \u5FC5\u987B\u653E\u5728 connect.hello \u9996\u5E27");
  }
  const spaceId = relaySpaceId(config.relay);
  if (spaceId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(spaceId)) {
    throw new Error("Space ID \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u5192\u53F7\u548C\u8FDE\u5B57\u7B26");
  }
  const endpointId = relayEndpointId(config.relay);
  if (typeof config.relay.endpointId !== "string") throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (endpointId && !/^[a-zA-Z0-9._:-]{1,128}$/.test(endpointId)) throw new Error("Relay Endpoint ID \u65E0\u6548");
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(config.relay.deviceId || "")) throw new Error("\u5185\u90E8\u4E3B\u673A\u8EAB\u4EFD ID \u65E0\u6548");
  const heartbeat = Number(config.relay.heartbeatSeconds);
  if (!Number.isFinite(heartbeat) || heartbeat < 5 || heartbeat > 300) {
    throw new Error("\u5FC3\u8DF3\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 300 \u79D2\u4E4B\u95F4");
  }
  const reconnectMax = Number(config.relay.reconnectMaxSeconds);
  if (!Number.isFinite(reconnectMax) || reconnectMax < 5 || reconnectMax > 600) {
    throw new Error("\u6700\u5927\u91CD\u8FDE\u95F4\u9694\u5FC5\u987B\u5728 5 \u5230 600 \u79D2\u4E4B\u95F4");
  }
  if (typeof config.relay.deviceName !== "string" || config.relay.deviceName.length > 128) {
    throw new Error("\u8BBE\u5907\u540D\u79F0\u65E0\u6548");
  }
  if (typeof config.relay.autoConnect !== "boolean") throw new Error("\u81EA\u52A8\u8FDE\u63A5\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.codex || typeof config.codex !== "object") throw new Error("Codex \u914D\u7F6E\u65E0\u6548");
  if (typeof config.codex.executable !== "string" || !config.codex.executable.trim()) throw new Error("Codex \u547D\u4EE4\u65E0\u6548");
  if (typeof config.codex.defaultWorkingDirectory !== "string") throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u65E0\u6548");
  if (config.codex.defaultWorkingDirectory && !path7.isAbsolute(config.codex.defaultWorkingDirectory)) {
    throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
  }
  if (typeof config.codex.autoStartAppServer !== "boolean") throw new Error("App Server \u81EA\u52A8\u542F\u52A8\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!["stdio", "unix"].includes(config.codex.appServerTransport)) throw new Error("App Server \u4F20\u8F93\u6A21\u5F0F\u65E0\u6548");
  if (typeof config.codex.appServerSocket !== "string") throw new Error("App Server Socket \u8DEF\u5F84\u65E0\u6548");
  if (config.codex.appServerTransport === "unix" && !config.codex.appServerSocket.trim()) throw new Error("\u5171\u4EAB App Server \u5FC5\u987B\u914D\u7F6E Unix Socket \u8DEF\u5F84");
  if (!config.permissions || typeof config.permissions !== "object") throw new Error("\u8FDC\u7A0B\u6743\u9650\u914D\u7F6E\u65E0\u6548");
  for (const name of Object.keys(DEFAULT_PERMISSIONS)) {
    if (typeof config.permissions[name] !== "boolean") throw new Error(`\u8FDC\u7A0B\u6743\u9650 ${name} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
  }
  if (typeof config.readOnly !== "boolean") throw new Error("\u53EA\u8BFB\u6A21\u5F0F\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!Array.isArray(config.allowedProjects)) throw new Error("\u9879\u76EE\u767D\u540D\u5355\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const project of config.allowedProjects) {
    if (typeof project !== "string" || !path7.isAbsolute(project)) throw new Error(`\u9879\u76EE\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${project}`);
  }
  return config;
}

// server/protocol.js
var PROTOCOL_VERSION = 1;
function validateRelayWelcome(message) {
  if (!message || typeof message !== "object" || message.type !== "connect.welcome") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u6D88\u606F\u65E0\u6548");
  }
  if (message.version !== PROTOCOL_VERSION) {
    throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "Relay \u8FD4\u56DE\u4E86\u4E0D\u517C\u5BB9\u7684\u534F\u8BAE\u7248\u672C");
  }
  if (!message.connectionId || typeof message.connectionId !== "string") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11 connectionId");
  }
  if (!message.sessionId || !message.spaceId || !message.endpointId) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11 sessionId\u3001spaceId \u6216 endpointId");
  }
  if (!Number.isSafeInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
  }
  return message;
}
var PRODUCT_FRAME_TYPES = /* @__PURE__ */ new Set(["codex.command", "codex.command.result", "codex.event", "host.snapshot"]);
function wrapRelayFrame(message, config) {
  if (!message || typeof message !== "object" || message.type === "stream.message") return message;
  if (!PRODUCT_FRAME_TYPES.has(message.type)) return message;
  return {
    version: PROTOCOL_VERSION,
    type: "stream.message",
    messageId: message.messageId || randomId("msg"),
    streamId: message.streamId || "codex",
    sequence: Number.isInteger(message.sequence) ? message.sequence : void 0,
    // Relay's directed-routing key is the authenticated Endpoint ID. The
    // legacy host deviceId remains product metadata, but must not be used as
    // the transport-level source/target identity.
    from: relayEndpointId(config.relay),
    ...message.targetDeviceId ? { to: message.targetDeviceId } : {},
    protocol: "codex.v1",
    encrypted: false,
    payload: message
  };
}
function unwrapRelayFrame(message) {
  if (!message || message.type !== "stream.message" || !message.payload || typeof message.payload !== "object") return message;
  const payload = { ...message.payload };
  if (message.from) payload.deviceId = message.from;
  if (message.to) payload.targetDeviceId = message.to;
  return payload;
}
var COMMAND_PERMISSIONS = Object.freeze({
  "host.get_status": "readThreads",
  "model.list": "readThreads",
  "project.list": "readThreads",
  "workspace.search": "readThreads",
  "skills.list": "readThreads",
  "thread.list": "readThreads",
  "thread.read": "readThreads",
  // A metadata-only status read keeps the mobile timeline in sync without
  // transferring the complete (potentially very large) thread history.
  "thread.status": "readThreads",
  "thread.create": "createThreads",
  "thread.resume": "readThreads",
  "thread.select": "readThreads",
  "thread.settings.update": "sendMessages",
  "turn.start": "sendMessages",
  "image.upload.begin": "sendMessages",
  "image.upload.append": "sendMessages",
  "image.upload.finish": "sendMessages",
  "image.upload.remove": "sendMessages",
  "turn.steer": "steerTurns",
  "turn.interrupt": "interruptTurns",
  "approval.respond": "respondToApprovals",
  "userInput.respond": "respondToApprovals",
  "sync.request": "readThreads",
  ping: null
});
function validateRelayCommand(message, config) {
  if (!message || typeof message !== "object") throw new RelayError("INVALID_MESSAGE", "\u547D\u4EE4\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  if (message.version !== PROTOCOL_VERSION) throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "\u4E0D\u652F\u6301\u7684\u534F\u8BAE\u7248\u672C");
  if (message.type !== "codex.command") throw new RelayError("INVALID_MESSAGE", "\u6D88\u606F\u7C7B\u578B\u5FC5\u987B\u662F codex.command");
  if (!message.requestId || typeof message.requestId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11 requestId");
  if (!message.deviceId || typeof message.deviceId !== "string") throw new RelayError("INVALID_MESSAGE", "\u7F3A\u5C11\u53D1\u9001\u7AEF deviceId");
  if (message.targetDeviceId !== relayEndpointId(config.relay)) throw new RelayError("DEVICE_NOT_TARGETED", "\u547D\u4EE4\u672A\u53D1\u9001\u7ED9\u672C\u673A\u63A5\u5165\u7AEF");
  if (message.spaceId !== relaySpaceId(config.relay)) throw new RelayError("SPACE_NOT_JOINED", "\u547D\u4EE4 Space \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  const commandType = message.command?.type;
  if (!Object.hasOwn(COMMAND_PERMISSIONS, commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${commandType || "unknown"}`);
  }
  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1e3) {
    throw new RelayError("MESSAGE_EXPIRED", "\u547D\u4EE4\u65F6\u95F4\u6233\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  }
  const permission = COMMAND_PERMISSIONS[commandType];
  if (config.readOnly && !["host.get_status", "model.list", "project.list", "workspace.search", "skills.list", "thread.list", "thread.read", "thread.status", "thread.resume", "thread.select", "sync.request", "ping"].includes(commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", "\u63D2\u4EF6\u5F53\u524D\u5904\u4E8E\u53EA\u8BFB\u6A21\u5F0F");
  }
  if (permission && !config.permissions[permission]) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `\u8FDC\u7A0B\u6743\u9650 ${permission} \u672A\u542F\u7528`);
  }
  return message;
}
function eventEnvelope(config, buffer, event, context = {}) {
  return buffer.push({
    version: PROTOCOL_VERSION,
    type: "codex.event",
    eventId: randomId("evt"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    sequence: buffer.nextSequence(),
    timestamp: nowIso(),
    ...context.threadId ? { threadId: context.threadId } : {},
    ...context.turnId ? { turnId: context.turnId } : {},
    event
  });
}
function commandResult(config, requestId, result, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId,
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
    timestamp: nowIso(),
    success: true,
    result
  };
}
function commandError(config, requestId, error, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId: requestId || randomId("invalid"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...targetDeviceId ? { targetDeviceId } : {},
    timestamp: nowIso(),
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "\u672A\u77E5\u9519\u8BEF",
      ...error.details === void 0 ? {} : { details: error.details }
    }
  };
}
function normalizeCodexNotification(method, params = {}) {
  const map = {
    "thread/started": "thread.created",
    "thread/status/changed": "thread.updated",
    "thread/settings/updated": "thread.settings.updated",
    "thread/queue/changed": "thread.queue.changed",
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/diff/updated": "diff.updated",
    "thread/tokenUsage/updated": "usage.updated",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/started": "item.started",
    "item/updated": "item.updated",
    "item/completed": "item.completed",
    error: "error"
  };
  const type = map[method];
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params
  };
}
function extractContext(params = {}) {
  const thread = params.thread || {};
  const turn = params.turn || {};
  const item = params.item || {};
  return {
    threadId: params.threadId || thread.id || item.threadId,
    turnId: params.turnId || turn.id || item.turnId
  };
}

// server/command-journal.js
import fs7 from "node:fs/promises";
import path8 from "node:path";
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
var MUTATING_COMMANDS = /* @__PURE__ */ new Set(["thread.create", "thread.settings.update", "turn.start", "turn.steer", "turn.interrupt", "approval.respond", "userInput.respond"]);
var hash = (value) => createHash("sha256").update(value).digest("hex");
var CommandJournal = class {
  constructor(configDir) {
    this.directory = configDir ? path8.join(configDir, "command-journal") : null;
  }
  file(config, message) {
    const scope = JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId || config.relay.deviceId, config.codex.executable]);
    return path8.join(this.directory, `${hash(`${scope}:${message.deviceId}:${message.requestId}`)}.json`);
  }
  async begin(config, message, fingerprint) {
    if (!this.directory || !MUTATING_COMMANDS.has(message.command.type)) return null;
    await fs7.mkdir(this.directory, { recursive: true, mode: 448 });
    const file = this.file(config, message);
    const signature = hash(fingerprint);
    try {
      const saved = JSON.parse(await fs7.readFile(file, "utf8"));
      if (saved.fingerprint !== signature) throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
      if (saved.response) return { file, response: saved.response };
      throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u8BE5\u547D\u4EE4\u53EF\u80FD\u5DF2\u88AB\u540E\u7AEF\u63A5\u53D7\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\u6838\u5BF9\u7ED3\u679C\uFF0C\u7CFB\u7EDF\u4E0D\u4F1A\u91CD\u590D\u6267\u884C", { threadId: message.threadId || message.command.threadId, command: message.command.type });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await this.#write(file, { fingerprint: signature, createdAt: Date.now(), command: message.command.type }, true);
    } catch (error) {
      if (error.code === "EEXIST") return this.begin(config, message, fingerprint);
      throw error;
    }
    return { file, fingerprint: signature };
  }
  async finish(entry, response) {
    if (!entry?.file || entry.response) return;
    await this.#write(entry.file, { fingerprint: entry.fingerprint, createdAt: Date.now(), response });
  }
  async #write(file, value, exclusive = false) {
    const temporary = `${file}.${randomUUID2()}.tmp`;
    const handle = await fs7.open(temporary, "wx", 384);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      if (exclusive) {
        await fs7.link(temporary, file);
        await fs7.unlink(temporary);
      } else await fs7.rename(temporary, file);
      const directory = await fs7.open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs7.rm(temporary, { force: true });
    }
  }
  async prune() {
    if (!this.directory) return;
    const files = await fs7.readdir(this.directory).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json(?:\..*\.tmp)?$/.test(name)) continue;
      const file = path8.join(this.directory, name);
      const stat = await fs7.stat(file).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 864e5) await fs7.rm(file, { force: true });
    }
  }
};

// server/image-uploads.js
import fs8 from "node:fs/promises";
import path9 from "node:path";
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
var IMAGE_INPUT_LIMITS = Object.freeze({ version: 1, maxImages: 4, maxBytes: 6 * 1024 * 1024, chunkBytes: 96 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] });
var TTL = 24 * 60 * 60 * 1e3;
var hash2 = (value) => createHash2("sha256").update(value).digest("hex");
var invalid = (message) => new RelayError("INVALID_IMAGE", message);
var imageName = (meta) => `image.${{ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[meta.mime]}`;
var ImageUploads = class {
  #tail = Promise.resolve();
  constructor(configDir) {
    this.directory = configDir ? path9.join(configDir, "image-uploads") : null;
  }
  run(action) {
    const result = this.#tail.catch(() => {
    }).then(action);
    this.#tail = result;
    return result;
  }
  owner(config, envelope) {
    return hash2(JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId, envelope.deviceId]));
  }
  folder(id) {
    if (!this.directory) throw new RelayError("IMAGE_UPLOAD_UNAVAILABLE", "\u56FE\u7247\u5B58\u50A8\u672A\u914D\u7F6E");
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw invalid("\u56FE\u7247\u6807\u8BC6\u65E0\u6548");
    return path9.join(this.directory, id);
  }
  async read(id, owner) {
    let meta;
    try {
      meta = JSON.parse(await fs8.readFile(path9.join(this.folder(id), "meta.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new RelayError("IMAGE_UPLOAD_EXPIRED", "\u56FE\u7247\u4E0A\u4F20\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u8BD5\u4E0A\u4F20");
    }
    if (meta.owner !== owner) throw new RelayError("IMAGE_ACCESS_DENIED", "\u56FE\u7247\u4E0D\u5C5E\u4E8E\u5F53\u524D\u63A5\u5165\u7AEF");
    return meta;
  }
  async save(id, meta) {
    const temporary = path9.join(this.folder(id), `${randomUUID3()}.tmp`);
    await fs8.writeFile(temporary, JSON.stringify(meta), { mode: 384 });
    await fs8.rename(temporary, path9.join(this.folder(id), "meta.json"));
  }
  begin(command, owner, context) {
    return this.run(async () => {
      const { uploadId: id, mime, size, sha256 } = command;
      const directory = this.folder(id);
      if (!IMAGE_INPUT_LIMITS.mimeTypes.includes(mime) || !Number.isSafeInteger(size) || size <= 0 || size > IMAGE_INPUT_LIMITS.maxBytes || !/^[a-f0-9]{64}$/.test(sha256 || "")) throw invalid("\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC7 6 MB \u7684 PNG\u3001JPEG \u6216 WebP \u56FE\u7247");
      await fs8.mkdir(this.directory, { recursive: true, mode: 448 });
      await this.prune();
      const definition = { owner, mime, size, sha256, cwd: context.cwd, threadId: context.threadId || null };
      try {
        const meta = await this.read(id, owner);
        if (Object.keys(definition).some((key) => meta[key] !== definition[key])) throw invalid("\u4E0A\u4F20\u6807\u8BC6\u5DF2\u7528\u4E8E\u5176\u4ED6\u56FE\u7247\u6216\u4EFB\u52A1");
        const stat = await fs8.stat(path9.join(directory, meta.ready ? imageName(meta) : "partial"));
        return { uploadId: id, offset: stat.size, ready: !!meta.ready };
      } catch (error) {
        if (error.code !== "IMAGE_UPLOAD_EXPIRED") throw error;
      }
      let pendingBytes = 0;
      let pendingCount = 0;
      for (const name of await fs8.readdir(this.directory)) {
        const meta = await fs8.readFile(path9.join(this.directory, name, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
        if (meta && !meta.retained) {
          pendingBytes += meta.size;
          pendingCount++;
        }
      }
      if (pendingCount >= 32 || pendingBytes + size > 96 * 1024 * 1024) throw new RelayError("IMAGE_UPLOAD_QUOTA", "\u5F85\u53D1\u9001\u56FE\u7247\u8FC7\u591A\uFF0C\u8BF7\u5148\u53D1\u9001\u6216\u5220\u9664\u5DF2\u6709\u9644\u4EF6");
      await fs8.mkdir(directory, { mode: 448 });
      await fs8.writeFile(path9.join(directory, "partial"), Buffer.alloc(0), { flag: "wx", mode: 384 });
      await this.save(id, { ...definition, createdAt: Date.now(), ready: false });
      return { uploadId: id, offset: 0, ready: false };
    });
  }
  append(command, owner) {
    return this.run(async () => {
      const { uploadId: id, offset, data } = command;
      const meta = await this.read(id, owner);
      if (!Number.isSafeInteger(offset) || offset < 0 || typeof data !== "string" || data.length > Math.ceil(IMAGE_INPUT_LIMITS.chunkBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw invalid("\u56FE\u7247\u5206\u5757\u65E0\u6548");
      const bytes = Buffer.from(data, "base64");
      if (!bytes.length || bytes.toString("base64") !== data || offset + bytes.length > meta.size) throw invalid("\u56FE\u7247\u5206\u5757\u5927\u5C0F\u65E0\u6548");
      const file = path9.join(this.folder(id), meta.ready ? imageName(meta) : "partial");
      const handle = await fs8.open(file, "r+");
      try {
        const stat = await handle.stat();
        if (offset < stat.size && offset + bytes.length <= stat.size) {
          const previous = Buffer.alloc(bytes.length);
          await handle.read(previous, 0, previous.length, offset);
          if (!previous.equals(bytes)) throw invalid("\u91CD\u590D\u56FE\u7247\u5206\u5757\u5185\u5BB9\u4E0D\u4E00\u81F4");
        } else {
          if (meta.ready || offset !== stat.size) throw invalid("\u56FE\u7247\u5206\u5757\u987A\u5E8F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u6062\u590D\u4E0A\u4F20");
          let written = 0;
          while (written < bytes.length) {
            const result = await handle.write(bytes, written, bytes.length - written, offset + written);
            written += result.bytesWritten;
          }
          await handle.sync();
        }
      } finally {
        await handle.close();
      }
      return { offset: (await fs8.stat(file)).size };
    });
  }
  finish(id, owner) {
    return this.run(async () => {
      const meta = await this.read(id, owner);
      const directory = this.folder(id);
      const source = path9.join(directory, meta.ready ? imageName(meta) : "partial");
      const bytes = await fs8.readFile(source);
      if (bytes.length !== meta.size || hash2(bytes) !== meta.sha256 || sniffImageMime(bytes) !== meta.mime) throw invalid("\u56FE\u7247\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6216\u4E0A\u4F20");
      if (!meta.ready) await fs8.copyFile(source, path9.join(directory, imageName(meta)));
      await this.save(id, { ...meta, ready: true });
      await fs8.rm(path9.join(directory, "partial"), { force: true });
      return { attachmentId: id };
    });
  }
  remove(id, owner) {
    return this.run(async () => {
      const meta = await this.read(id, owner);
      if (!meta.retained) await fs8.rm(this.folder(id), { recursive: true, force: true });
      return { removed: !meta.retained };
    });
  }
  resolve(ids, owner, context) {
    return this.run(async () => {
      if (!Array.isArray(ids) || !ids.length || ids.length > IMAGE_INPUT_LIMITS.maxImages || new Set(ids).size !== ids.length) throw invalid("\u6BCF\u6761\u6D88\u606F\u6700\u591A\u6DFB\u52A0 4 \u5F20\u56FE\u7247");
      const images = [];
      for (const id of ids) {
        const meta = await this.read(id, owner);
        if (!meta.ready || meta.cwd !== context.cwd || meta.threadId && meta.threadId !== context.threadId) throw invalid("\u56FE\u7247\u672A\u4E0A\u4F20\u5B8C\u6210\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4EFB\u52A1\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20");
        images.push({ id, meta });
      }
      for (const { id, meta } of images) await this.save(id, { ...meta, retained: true, threadId: context.threadId });
      return images.map(({ id, meta }) => ({ type: "localImage", path: path9.join(this.folder(id), imageName(meta)) }));
    });
  }
  async prune() {
    for (const name of await fs8.readdir(this.directory)) {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(name)) continue;
      const directory = this.folder(name);
      const meta = await fs8.readFile(path9.join(directory, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
      const stat = await fs8.stat(directory).catch(() => null);
      if (!meta?.retained && stat && Date.now() - (meta?.createdAt || stat.mtimeMs) > TTL) await fs8.rm(directory, { recursive: true, force: true });
    }
  }
};
function sniffImageMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

// server/workspace-tools.js
import fs9 from "node:fs/promises";
import os5 from "node:os";
import path10 from "node:path";
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "build",
  ".dart_tool",
  "dist",
  ".cache",
  ".next",
  "coverage"
]);
var MAX_DEPTH = 8;
var MAX_RESULTS = 100;
var MAX_SKILLS = 200;
var MAX_DESCRIPTION = 360;
function text2(value, fallback = "") {
  const result = typeof value === "string" ? value.trim() : "";
  return result || fallback;
}
function boundedInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}
function assertWorkspaceRoot(cwd, allowedProjects) {
  const root = safeProjectPath(text2(cwd), allowedProjects);
  if (!root) throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u5DE5\u4F5C\u533A\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
  return root;
}
function relativeReference(root, value) {
  const raw = text2(value).replaceAll("\\", path10.sep);
  if (!raw || path10.isAbsolute(raw)) throw new RelayError("INVALID_MESSAGE", "\u5DE5\u4F5C\u533A\u5F15\u7528\u5FC5\u987B\u662F\u76F8\u5BF9\u8DEF\u5F84");
  const resolved = path10.resolve(root, raw);
  const relative = path10.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path10.isAbsolute(relative)) {
    throw new RelayError("PROJECT_NOT_ALLOWED", "\u5DE5\u4F5C\u533A\u5F15\u7528\u8D85\u51FA\u5F53\u524D\u9879\u76EE\u8303\u56F4");
  }
  return { absolute: resolved, relative: relative.split(path10.sep).join("/") };
}
async function searchWorkspace({ cwd, query = "", kind = "all", limit, cursor, allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  const wantedKind = ["file", "directory", "all"].includes(kind) ? kind : "all";
  const needle = text2(query).toLowerCase().slice(0, 160);
  const pageSize = boundedInteger(limit, 40, MAX_RESULTS);
  const start = Number.isSafeInteger(Number(cursor)) && Number(cursor) >= 0 ? Number(cursor) : 0;
  const result = [];
  let visited = 0;
  async function visit(directory, depth) {
    if (depth > MAX_DEPTH || result.length >= pageSize + 1) return;
    let entries;
    try {
      entries = await fs9.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EACCES") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path10.join(directory, entry.name);
      const relative = path10.relative(root, absolute).split(path10.sep).join("/");
      const entryKind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
      if ((wantedKind === "all" || wantedKind === entryKind) && (!needle || relative.toLowerCase().includes(needle))) {
        if (visited >= start && result.length < pageSize + 1) {
          let size;
          if (entryKind === "file") {
            try {
              size = (await fs9.stat(absolute)).size;
            } catch {
            }
          }
          result.push({ path: relative, name: entry.name, kind: entryKind, ...size === void 0 ? {} : { size } });
        }
        visited += 1;
      }
      if (entry.isDirectory()) await visit(absolute, depth + 1);
      if (result.length >= pageSize + 1) return;
    }
  }
  await visit(root, 0);
  const hasMore = result.length > pageSize;
  const data = result.slice(0, pageSize);
  return { data, ...hasMore ? { nextCursor: String(start + data.length) } : {} };
}
function descriptionFromMarkdown(markdown) {
  const body = markdown.replace(/^---[\s\S]*?---\s*/u, "").trim();
  const paragraph = body.split(/\n\s*\n/u).map((item) => item.replace(/^#+\s*/u, "").replace(/\s+/gu, " ").trim()).find(Boolean);
  return (paragraph || "").slice(0, MAX_DESCRIPTION);
}
async function readSkillDirectory(parent, name, source) {
  const directory = path10.join(parent, name);
  let stat;
  try {
    stat = await fs9.stat(directory);
  } catch {
    return null;
  }
  if (!stat.isDirectory() || name.startsWith(".")) return null;
  try {
    const markdown = await fs9.readFile(path10.join(directory, "SKILL.md"), "utf8");
    return { name, description: descriptionFromMarkdown(markdown), source, path: directory };
  } catch {
    return null;
  }
}
async function listSkills({ cwd, allowedProjects, codexHome = process.env.CODEX_HOME || path10.join(os5.homedir(), ".codex") }) {
  const roots = [];
  if (cwd) {
    const workspace = assertWorkspaceRoot(cwd, allowedProjects);
    roots.push({ path: path10.join(workspace, ".codex", "skills"), source: "workspace" });
  }
  roots.push({ path: path10.join(codexHome, "skills"), source: "global" });
  const skills = /* @__PURE__ */ new Map();
  for (const root of roots) {
    let entries;
    try {
      entries = await fs9.readdir(root.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkillDirectory(root.path, entry.name, root.source);
      if (skill && !skills.has(skill.name)) skills.set(skill.name, skill);
    }
  }
  return { data: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_SKILLS) };
}
async function resolveWorkspaceReferences({ cwd, references = [], allowedProjects }) {
  const root = assertWorkspaceRoot(cwd, allowedProjects);
  if (!Array.isArray(references) || references.length > 20) throw new RelayError("INVALID_MESSAGE", "\u5DE5\u4F5C\u533A\u5F15\u7528\u6570\u91CF\u65E0\u6548");
  const resolved = [];
  for (const value of references) {
    const ref = relativeReference(root, value?.path ?? value);
    try {
      await fs9.access(ref.absolute);
    } catch {
      throw new RelayError("WORKSPACE_REFERENCE_NOT_FOUND", `\u627E\u4E0D\u5230\u5DE5\u4F5C\u533A\u5F15\u7528\uFF1A${ref.relative}`);
    }
    resolved.push(ref);
  }
  return resolved;
}
async function resolveSkills({ cwd, skills = [], allowedProjects, codexHome }) {
  if (!Array.isArray(skills) || skills.length > 20) throw new RelayError("INVALID_MESSAGE", "\u6280\u80FD\u9009\u62E9\u6570\u91CF\u65E0\u6548");
  const listed = await listSkills({ cwd, allowedProjects, codexHome });
  const byName = new Map(listed.data.map((skill) => [skill.name, skill]));
  return skills.map((value) => {
    const name = text2(value?.name ?? value);
    const skill = byName.get(name);
    if (!skill) throw new RelayError("SKILL_NOT_FOUND", `\u627E\u4E0D\u5230\u6280\u80FD\uFF1A${name}`);
    return skill;
  });
}
function buildTurnContext(references, skills) {
  const lines = [];
  if (references.length) lines.push("\u5DE5\u4F5C\u533A\u5F15\u7528\uFF1A", ...references.map((item) => `- ${item.relative}`));
  if (skills.length) lines.push("\u542F\u7528\u6280\u80FD\uFF1A", ...skills.map((item) => `- ${item.name}`));
  return lines.length ? `${lines.join("\n")}

` : "";
}

// server/command-router.js
var MAX_THREAD_READ_BYTES = 15e5;
var MAX_THREAD_READ_TURNS = 12;
var MAX_THREAD_ITEM_STRING_BYTES = 8192;
var MAX_THREAD_ARRAY_ITEMS = 128;
var CommandRouter = class {
  #completed = /* @__PURE__ */ new Map();
  #inflight = /* @__PURE__ */ new Map();
  #readRequests = /* @__PURE__ */ new Map();
  #threadReadTails = /* @__PURE__ */ new Map();
  // Metadata-only status probes must not wait behind a potentially large
  // thread/read. The client reconciles snapshots by lifecycle/turn identity,
  // so an older status response cannot resurrect a terminal turn.
  #threadStatusTails = /* @__PURE__ */ new Map();
  #settingsWriteTails = /* @__PURE__ */ new Map();
  #nextSnapshotRevision = 0;
  #selectedThreadId = null;
  constructor({ configStore, appServer, service, logger }) {
    this.configStore = configStore;
    this.appServer = appServer;
    this.service = service;
    this.logger = logger;
    this.journal = new CommandJournal(configStore.configDir);
    this.images = new ImageUploads(configStore.configDir);
  }
  async handle(message) {
    const config = this.configStore.get();
    let fingerprint;
    try {
      validateRelayCommand(message, config);
      fingerprint = commandFingerprint(message);
      const completed = this.#completed.get(message.requestId);
      if (completed) {
        if (completed.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        await this.#authorizeReplay(message, completed.response);
        return completed.response;
      }
      const inflight = this.#inflight.get(message.requestId);
      if (inflight) {
        if (inflight.fingerprint !== fingerprint) {
          throw new RelayError("REQUEST_ID_REUSED", "requestId \u5DF2\u88AB\u53E6\u4E00\u6761\u547D\u4EE4\u4F7F\u7528");
        }
        return await inflight.promise;
      }
    } catch (error) {
      return this.#failure(config, message, fingerprint, error);
    }
    const threadId = message.command.threadId || message.threadId;
    const ordered = threadId && ["thread.settings.update", "turn.start"].includes(message.command.type);
    const previous = ordered ? this.#settingsWriteTails.get(threadId) : null;
    const promise = (previous ? previous.catch(() => {
    }) : Promise.resolve()).then(() => this.#run(config, message, fingerprint));
    if (ordered) this.#settingsWriteTails.set(threadId, promise);
    this.#inflight.set(message.requestId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (this.#inflight.get(message.requestId)?.promise === promise) {
        this.#inflight.delete(message.requestId);
      }
      if (ordered && this.#settingsWriteTails.get(threadId) === promise) this.#settingsWriteTails.delete(threadId);
    }
  }
  async #run(config, message, fingerprint) {
    let entry;
    try {
      entry = await this.journal.begin(config, message, fingerprint);
      if (entry?.response) {
        await this.#authorizeReplay(message, entry.response);
        return entry.response;
      }
      const result = await this.#executeRead(message.command, message);
      const response = commandResult(config, message.requestId, result ?? {}, message.deviceId);
      try {
        await this.journal.finish(entry, response);
      } catch {
        throw new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u540E\u7AEF\u53EF\u80FD\u5DF2\u6267\u884C\u547D\u4EE4\uFF0C\u4F46\u56DE\u6267\u672A\u80FD\u4FDD\u5B58\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\u6838\u5BF9\u7ED3\u679C");
      }
      this.#remember(message.requestId, fingerprint, response);
      return response;
    } catch (error) {
      const uncertain = entry && ["APP_SERVER_UNAVAILABLE", "APP_SERVER_TIMEOUT"].includes(error.code);
      const response = this.#failure(config, message, fingerprint, uncertain ? new RelayError("COMMAND_OUTCOME_UNKNOWN", "\u8FDE\u63A5\u4E2D\u65AD\u6216\u8D85\u65F6\uFF0C\u547D\u4EE4\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF1B\u8BF7\u5237\u65B0\u4EFB\u52A1\uFF0C\u52FF\u91CD\u590D\u53D1\u9001", { cause: error.code, threadId: message.threadId, command: message.command.type }) : error);
      if (entry && error.code !== "COMMAND_OUTCOME_UNKNOWN") await this.journal.finish(entry, response).catch(() => {
      });
      return response;
    }
  }
  async #authorizeReplay(message, response) {
    if (!response.success) return;
    const command = message.command;
    if (command.type === "thread.settings.update") composerSettingsPatch(command, this.configStore.get());
    if (command.type === "thread.create") this.#allowedCwd(command.cwd, true);
    const threadId = command.threadId || message.threadId;
    if (threadId) await this.#assertThreadAllowed(threadId);
  }
  async #executeRead(command, envelope) {
    if (!["project.list", "thread.list", "thread.read", "thread.status", "thread.resume", "sync.request", "workspace.search", "skills.list"].includes(command.type)) {
      return this.#execute(command, envelope);
    }
    const key = JSON.stringify({
      deviceId: envelope.deviceId,
      threadId: envelope.threadId || null,
      command: stableValue(command)
    });
    const existing = this.#readRequests.get(key);
    if (existing) return existing;
    const threadId = command.type === "thread.read" || command.type === "thread.status" ? String(command.threadId || envelope.threadId || "").trim() : "";
    const tails = command.type === "thread.status" ? this.#threadStatusTails : this.#threadReadTails;
    const previous = threadId ? tails.get(threadId) : null;
    const pending = (previous ? previous.catch(() => void 0) : Promise.resolve()).then(() => this.#execute(command, envelope)).finally(() => {
      if (this.#readRequests.get(key) === pending) this.#readRequests.delete(key);
      if (threadId && tails.get(threadId) === pending) {
        tails.delete(threadId);
      }
    });
    this.#readRequests.set(key, pending);
    if (threadId) tails.set(threadId, pending);
    return pending;
  }
  #failure(config, message, fingerprint, error) {
    const relayError = asRelayError(error);
    this.logger.warn("command", "\u8FDC\u7A0B\u547D\u4EE4\u6267\u884C\u5931\u8D25", {
      command: message?.command?.type,
      code: relayError.code,
      message: relayError.message
    });
    const response = commandError(config, message?.requestId, relayError, message?.deviceId);
    if (message?.requestId && fingerprint && !this.#completed.has(message.requestId)) {
      this.#remember(message.requestId, fingerprint, response);
    }
    return response;
  }
  async #execute(command, envelope) {
    if (command.type === "ping") return { pong: true };
    if (command.type === "host.get_status") return this.service.status();
    if (command.type === "sync.request") {
      return this.service.syncAfter(Object.hasOwn(command, "lastSequence") ? command.lastSequence : null, command.eventStreamId);
    }
    if (command.type === "workspace.search") {
      const cwd = this.#allowedCwd(command.cwd, true);
      return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
    }
    if (command.type === "skills.list") {
      const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : void 0;
      return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
    }
    if (command.type.startsWith("image.upload.")) {
      const owner = this.images.owner(this.configStore.get(), envelope);
      if (command.type === "image.upload.append") return this.images.append(command, owner);
      if (command.type === "image.upload.finish") return this.images.finish(command.uploadId, owner);
      if (command.type === "image.upload.remove") return this.images.remove(command.uploadId, owner);
      const threadId = command.threadId || envelope.threadId;
      let cwd = this.#allowedCwd(command.cwd, true);
      if (threadId) {
        await this.appServer.start();
        const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
        const result = await read.call(this.appServer, threadId);
        this.#assertThreadResultAllowed(result);
        cwd = this.#allowedCwd((result.thread || result).cwd, true);
      }
      return this.images.begin(command, owner, { cwd, threadId });
    }
    await this.appServer.start();
    switch (command.type) {
      case "model.list":
        return this.appServer.listModels(command);
      case "project.list":
        return filterProjectList(await this.appServer.listProjects(command), this.configStore.get().allowedProjects);
      case "workspace.search": {
        const cwd = this.#allowedCwd(command.cwd, true);
        return searchWorkspace({ ...command, cwd, allowedProjects: this.configStore.get().allowedProjects });
      }
      case "skills.list": {
        const cwd = command.cwd ? this.#allowedCwd(command.cwd, true) : void 0;
        return listSkills({ cwd, allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
      }
      case "thread.list":
        return filterThreadList(await this.appServer.listThreads(command), this.configStore.get().allowedProjects);
      case "thread.read": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
        const result = compactThreadReadResult(
          await this.#readSubscribedThread(threadId, readThread)
        );
        const snapshotHash = createHash3("sha256").update(JSON.stringify(result)).digest("hex");
        if (command.snapshotHash === snapshotHash) {
          return { threadId, snapshotHash, unchanged: true, pendingInteractions: this.appServer.pendingInteractions?.(threadId) || [] };
        }
        const prepared = this.service.prepareResourceImages ? this.service.prepareResourceImages(result) : result;
        return { ...this.#annotateThreadSnapshot(threadId, compactThreadReadResult(await prepared), "read"), snapshotHash };
      }
      case "thread.status": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
        return this.#annotateThreadSnapshot(threadId, result, "status");
      }
      case "thread.create": {
        const cwd = this.#allowedCwd(command.cwd, true);
        const result = await this.appServer.createThread({ cwd });
        this.#selectedThreadId = result?.thread?.id || result?.id || null;
        return result;
      }
      case "thread.resume": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const readStatus = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus;
        const result = await this.#readSubscribedThread(threadId, readStatus);
        this.#selectedThreadId = threadId;
        return { ...result, syncMode: "snapshot" };
      }
      case "thread.select": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        await this.appServer.subscribeThread?.(threadId);
        this.#selectedThreadId = threadId;
        return { threadId: this.#selectedThreadId };
      }
      case "thread.settings.update": {
        const threadId = requireString(command.threadId || envelope.threadId, "threadId");
        const patch = composerSettingsPatch(command, this.configStore.get());
        await this.#assertThreadAllowed(threadId);
        return this.appServer.updateThreadSettings(threadId, patch);
      }
      case "turn.start": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        let images;
        let references = [];
        let skills = [];
        let threadCwd = this.#allowedCwd(command.cwd);
        if (command.workspaceRefs !== void 0 || command.skills !== void 0) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          threadCwd = this.#allowedCwd((result.thread || result).cwd, true);
          references = await resolveWorkspaceReferences({ cwd: threadCwd, references: command.workspaceRefs || [], allowedProjects: this.configStore.get().allowedProjects });
          skills = await resolveSkills({ cwd: threadCwd, skills: command.skills || [], allowedProjects: this.configStore.get().allowedProjects, codexHome: process.env.CODEX_HOME });
        }
        if (command.attachmentIds !== void 0) {
          const read = this.appServer.readThreadStatusSnapshot || this.appServer.readThreadStatus || this.appServer.readThread;
          const result = await read.call(this.appServer, threadId);
          this.#assertThreadResultAllowed(result);
          const cwd = this.#allowedCwd((result.thread || result).cwd, true);
          threadCwd = threadCwd || cwd;
          images = await this.images.resolve(command.attachmentIds, this.images.owner(this.configStore.get(), envelope), { cwd, threadId });
        }
        return this.appServer.startTurn({
          threadId,
          text: `${buildTurnContext(references, skills)}${images?.length ? optionalString(command.text) || "" : requireString(command.text, "text")}`,
          ...images ? { images } : {},
          cwd: threadCwd,
          model: optionalString(command.model),
          effort: optionalString(command.effort)
        });
      }
      case "turn.steer": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.steerTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId"),
          text: requireString(command.text, "text")
        });
      }
      case "turn.interrupt": {
        const threadId = requireString(command.threadId || envelope.threadId || this.#selectedThreadId, "threadId");
        await this.#assertThreadAllowed(threadId);
        return this.appServer.interruptTurn({
          threadId,
          turnId: requireString(command.turnId || envelope.turnId, "turnId")
        });
      }
      case "approval.respond": {
        const allowed = /* @__PURE__ */ new Set(["accept", "acceptForSession", "decline", "cancel"]);
        if (!allowed.has(command.decision)) throw new RelayError("INVALID_MESSAGE", "\u5BA1\u6279\u51B3\u5B9A\u65E0\u6548");
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToApproval(id, command.decision);
      }
      case "userInput.respond": {
        const id = requireString(command.approvalId, "approvalId");
        await this.#assertInteractionAllowed(id, envelope);
        return this.appServer.respondToUserInput(id, command.answers);
      }
      default:
        throw new RelayError("COMMAND_NOT_ALLOWED", `\u4E0D\u652F\u6301\u7684\u547D\u4EE4\uFF1A${command.type}`);
    }
  }
  #allowedCwd(cwd, required = false) {
    const config = this.configStore.get();
    const candidate = cwd || (required ? config.codex.defaultWorkingDirectory : "");
    if (!candidate) {
      if (required && config.allowedProjects.length) {
        throw new RelayError("PROJECT_REQUIRED", "\u542F\u7528\u9879\u76EE\u767D\u540D\u5355\u540E\uFF0C\u521B\u5EFA\u4F1A\u8BDD\u5FC5\u987B\u6307\u5B9A\u5141\u8BB8\u7684\u5DE5\u4F5C\u76EE\u5F55");
      }
      return void 0;
    }
    const safe = safeProjectPath(candidate, config.allowedProjects);
    if (!safe) throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u9879\u76EE\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    return safe;
  }
  async #assertInteractionAllowed(id, envelope) {
    const entry = this.appServer.getInteraction(id);
    const threadId = entry.params.threadId;
    if (!threadId || envelope.threadId && envelope.threadId !== threadId) throw new RelayError("PROJECT_NOT_ALLOWED", "\u4EA4\u4E92\u8BF7\u6C42\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4EFB\u52A1");
    await this.#assertThreadAllowed(threadId);
  }
  async #readSubscribedThread(threadId, read) {
    let result = await read.call(this.appServer, threadId, { ensureResumed: false });
    this.#assertThreadResultAllowed(result);
    if (await this.appServer.subscribeThread?.(threadId)) {
      result = await read.call(this.appServer, threadId, { ensureResumed: false });
      this.#assertThreadResultAllowed(result);
    }
    this.appServer.rememberThreadSettings?.(threadId, result);
    const settings = this.appServer.threadSettings?.(threadId);
    return settings ? { ...result, threadSettings: settings } : result;
  }
  async #assertThreadAllowed(threadId) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return;
    const readThread = this.appServer.readThreadSnapshot || this.appServer.readThread;
    this.#assertThreadResultAllowed(await readThread.call(this.appServer, threadId));
  }
  #assertThreadResultAllowed(result) {
    const config = this.configStore.get();
    if (!config.allowedProjects.length) return;
    const cwd = result?.thread?.cwd || result?.cwd;
    if (!cwd || !safeProjectPath(cwd, config.allowedProjects)) {
      throw new RelayError("PROJECT_NOT_ALLOWED", "\u8BE5\u4F1A\u8BDD\u4E0D\u5728\u8FDC\u7A0B\u8BBF\u95EE\u767D\u540D\u5355\u4E2D");
    }
  }
  #remember(requestId, fingerprint, response) {
    this.#completed.set(requestId, { fingerprint, response });
    if (this.#completed.size > 500) this.#completed.delete(this.#completed.keys().next().value);
  }
  #annotateThreadSnapshot(threadId, result, source) {
    const id = String(threadId || "").trim();
    if (!id || !result || typeof result !== "object") return result;
    const revision = ++this.#nextSnapshotRevision;
    return {
      ...result,
      snapshotRevision: revision,
      snapshotSource: source,
      snapshotObservedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pendingInteractions: this.appServer.pendingInteractions?.(id) || []
    };
  }
};
function commandFingerprint(message) {
  return JSON.stringify({
    spaceId: message.spaceId,
    deviceId: message.deviceId,
    targetDeviceId: message.targetDeviceId,
    threadId: message.threadId || null,
    turnId: message.turnId || null,
    command: message.command.type === "image.upload.append" ? { ...stableValue(message.command), data: createHash3("sha256").update(String(message.command.data)).digest("hex") } : stableValue(message.command)
  });
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new RelayError("INVALID_MESSAGE", `\u7F3A\u5C11 ${name}`);
  return value;
}
function optionalString(value) {
  const text3 = typeof value === "string" ? value.trim() : "";
  return text3 || void 0;
}
function compactThreadReadResult(result) {
  if (!result || typeof result !== "object") return result;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_THREAD_READ_BYTES) return result;
  const sourceThread = result.thread && typeof result.thread === "object" ? result.thread : result;
  const sourceTurns = Array.isArray(sourceThread.turns) ? sourceThread.turns : [];
  const compactThread = compactValue({ ...sourceThread, turns: [] });
  const compactTurns = [];
  for (let index = sourceTurns.length - 1; index >= 0 && compactTurns.length < MAX_THREAD_READ_TURNS; index -= 1) {
    const turn = sourceTurns[index];
    if (!turn || typeof turn !== "object") continue;
    compactTurns.unshift(compactValue(turn));
    compactThread.turns = compactTurns;
    const candidate = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_THREAD_READ_BYTES) {
      compactTurns.shift();
      compactThread.turns = compactTurns;
      break;
    }
  }
  const compacted = result.thread && typeof result.thread === "object" ? { ...result, thread: compactThread } : compactThread;
  if (Buffer.byteLength(JSON.stringify(compacted), "utf8") <= MAX_THREAD_READ_BYTES) {
    return compacted;
  }
  const minimalThread = compactValue(Object.fromEntries(
    ["id", "sessionId", "cwd", "path", "preview", "name", "status", "createdAt", "updatedAt"].filter((key) => sourceThread[key] !== void 0).map((key) => [key, sourceThread[key]])
  ));
  minimalThread.turns = [];
  return result.thread && typeof result.thread === "object" ? { thread: minimalThread } : minimalThread;
}
function compactValue(value, depth = 0) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") <= MAX_THREAD_ITEM_STRING_BYTES) return value;
    const suffix = "\n\u2026\uFF08\u5386\u53F2\u8F93\u51FA\u5DF2\u622A\u65AD\uFF09";
    const maxChars = Math.max(0, MAX_THREAD_ITEM_STRING_BYTES - Buffer.byteLength(suffix, "utf8"));
    return `${value.slice(0, maxChars)}${suffix}`;
  }
  if (Array.isArray(value)) {
    const items = value.length > MAX_THREAD_ARRAY_ITEMS ? value.slice(-MAX_THREAD_ARRAY_ITEMS) : value;
    return items.map((item) => compactValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  if (depth > 8) return "[nested value omitted]";
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)])
  );
}

// server/event-buffer.js
var EventBuffer = class {
  #items = [];
  #sequence = 0;
  #bytes = 0;
  #droppedThrough = 0;
  constructor(limit = 1e3, options = {}) {
    this.limit = Math.max(1, Number(limit) || 1e3);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024);
    this.maxEventBytes = Math.max(1, Number(options.maxEventBytes) || 2 * 1024 * 1024);
  }
  nextSequence() {
    this.#sequence += 1;
    return this.#sequence;
  }
  push(event) {
    const bytes = byteSize(event);
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
  get size() {
    return this.#items.length;
  }
  get bytes() {
    return this.#bytes;
  }
};
function byteSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

// server/instance-lock.js
import fs10 from "node:fs/promises";
import path11 from "node:path";
var LOCK_WRITE_GRACE_MS = 5e3;
var InstanceLock = class {
  #file = null;
  #handle = null;
  #acquirePromise = null;
  constructor(configDir, name = "connector.lock") {
    this.#file = path11.join(configDir, name);
  }
  async acquire() {
    if (this.#handle) return;
    if (this.#acquirePromise) return this.#acquirePromise;
    this.#acquirePromise = this.#acquire();
    try {
      await this.#acquirePromise;
    } finally {
      this.#acquirePromise = null;
    }
  }
  async #acquire() {
    await fs10.mkdir(path11.dirname(this.#file), { recursive: true, mode: 448 });
    for (; ; ) {
      try {
        this.#handle = await fs10.open(this.#file, "wx", 384);
        await this.#handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })}
`);
        return;
      } catch (error) {
        if (this.#handle) {
          await this.#handle.close().catch(() => {
          });
          this.#handle = null;
        }
        if (error.code !== "EEXIST") throw error;
        if (await this.#removeIfStale()) continue;
        const active = new Error("\u540C\u4E00\u914D\u7F6E\u76EE\u5F55\u5DF2\u6709 Codex Relay Connector \u5728\u8FD0\u884C");
        active.code = "RELAY_INSTANCE_ALREADY_RUNNING";
        throw active;
      }
    }
  }
  async release() {
    const handle = this.#handle;
    if (!handle) return;
    this.#handle = null;
    await handle.close().catch(() => {
    });
    await fs10.unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async #removeIfStale() {
    let record;
    try {
      record = JSON.parse(await fs10.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return true;
      try {
        const stat = await fs10.stat(this.#file);
        if (Date.now() - stat.mtimeMs < LOCK_WRITE_GRACE_MS) return false;
      } catch (statError) {
        if (statError.code === "ENOENT") return true;
        return false;
      }
      await fs10.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      await fs10.unlink(this.#file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
      await fs10.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
  }
};

// server/logger.js
import { EventEmitter as EventEmitter3 } from "node:events";
var Logger = class extends EventEmitter3 {
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
      ...data === void 0 ? {} : { data: redact(data) }
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
};

// server/relay-client.js
import { EventEmitter as EventEmitter4 } from "node:events";
import crypto5 from "node:crypto";

// server/relay-token-service.js
import crypto4 from "node:crypto";
var REFRESH_LEAD_MS = 6e4;
var MAX_RETRY_AFTER_MS = 10 * 6e4;
var RelayTokenService = class {
  #refreshing = null;
  #refreshingKey = null;
  constructor(configStore, logger, options = {}) {
    this.configStore = configStore;
    this.logger = logger;
    this.fetch = options.fetch || globalThis.fetch;
  }
  /**
   * Resolve a credential that is safe to use for the next handshake.  The
   * object-returning variant is useful to connection owners because a refresh
   * also changes expiry metadata; keeping that metadata alongside the token
   * prevents a runtime override or a restart from scheduling the next refresh
   * from stale information.
   */
  async usableCredential({
    force = false,
    credential: suppliedCredential = null,
    // Connection tests can validate credentials that are still in an editor
    // draft.  Such a refresh must remain ephemeral; normal connector startup
    // and scheduled rotation keep the default durable behavior.
    persist = true
  } = {}) {
    const credential = await this.#resolveCredential(suppliedCredential);
    const connectToken = typeof credential?.connectToken === "string" ? credential.connectToken : "";
    const endpointGrant = typeof credential?.endpointGrant === "string" ? credential.endpointGrant : "";
    if (!connectToken && !endpointGrant) {
      throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token \u6216 Endpoint Grant");
    }
    const hasExpiry = Number.isSafeInteger(credential.expiresAt) && credential.expiresAt > 0;
    const expiring = !connectToken || !hasExpiry || credential.expiresAt <= Date.now() + REFRESH_LEAD_MS;
    if (!force && !expiring) return { ...credential };
    if (!endpointGrant) {
      if (!force && connectToken && (!hasExpiry || credential.expiresAt > Date.now())) {
        return { ...credential };
      }
      throw new RelayError("auth.grant_required", "Connect Token \u5DF2\u8FC7\u671F\u4E14\u672A\u914D\u7F6E Endpoint Grant");
    }
    if (Number.isSafeInteger(credential.grantExpiresAt) && credential.grantExpiresAt <= Date.now()) {
      throw new RelayError("auth.grant_expired", "Endpoint Grant \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u7B7E\u53D1\u51ED\u8BC1");
    }
    const refreshKey = `${await this.#refreshContextKey(credential)}\0${persist ? "persist" : "ephemeral"}`;
    let refreshPromise = this.#refreshing;
    if (!refreshPromise || this.#refreshingKey !== refreshKey) {
      refreshPromise = this.#refresh(credential, { persist });
      this.#refreshing = refreshPromise;
      this.#refreshingKey = refreshKey;
      refreshPromise.then(
        () => this.#clearRefresh(refreshPromise),
        () => this.#clearRefresh(refreshPromise)
      );
    }
    try {
      return { ...await refreshPromise };
    } catch (error) {
      if (error?.code !== "AUTH_CONTEXT_CHANGED" && !force && connectToken && (!hasExpiry || credential.expiresAt > Date.now())) {
        this.logger?.warn?.("relay", "Connect Token \u5237\u65B0\u6682\u65F6\u5931\u8D25\uFF0C\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D\u51ED\u8BC1", {
          code: error.code,
          message: error.message
        });
        return { ...credential };
      }
      throw error;
    }
  }
  async usableToken(options = {}) {
    const credential = await this.usableCredential(options);
    return credential?.connectToken || null;
  }
  async #refresh(credential, { persist = true } = {}) {
    const initialConfig = this.configStore.get();
    const initialRelay = initialConfig.relay || {};
    const identity = await this.configStore.endpointIdentity();
    const tokenEndpoint = resolveTokenEndpoint(credential.tokenEndpoint, initialRelay.url);
    if (!tokenEndpoint) throw new RelayError("auth.refresh_invalid", "\u672A\u914D\u7F6E\u6709\u6548\u7684 Token \u5237\u65B0\u5730\u5740");
    const requestId = randomId("refresh");
    const issuedAt = Date.now();
    const nonce = crypto4.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-token-v1",
      requestId,
      issuedAt,
      nonce,
      credential.endpointGrant
    ].join("\n");
    const privateKey = crypto4.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
    });
    let response;
    try {
      response = await this.fetch(tokenEndpoint, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpointGrant: credential.endpointGrant,
          proof: {
            requestId,
            issuedAt,
            nonce,
            signature: crypto4.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
          }
        }),
        signal: AbortSignal.timeout(1e4)
      });
    } catch (error) {
      throw new RelayError("RELAY_UNAVAILABLE", `Connect Token \u5237\u65B0\u5931\u8D25\uFF1A${error.message}`, {
        retryable: true
      });
    }
    const body = await response.json().catch(() => null);
    const errorCode = typeof body?.data?.errorCode === "string" ? body.data.errorCode : null;
    const envelopeCode = Number.isInteger(body?.code) ? body.code : null;
    if (!response.ok || envelopeCode !== null && envelopeCode !== 200) {
      const retryable = isRetryableHttpStatus(response.status) || envelopeCode !== null && isRetryableHttpStatus(envelopeCode);
      const retryAfterMs = retryAfterMilliseconds(response.headers?.get?.("retry-after"));
      throw new RelayError(
        retryable ? "RELAY_RETRYABLE" : errorCode || "auth.refresh_rejected",
        body?.msg || `Connect Token \u5237\u65B0\u88AB\u62D2\u7EDD\uFF08HTTP ${response.status}\uFF09`,
        {
          retryable,
          status: response.status,
          relayCode: errorCode || envelopeCode,
          ...retryAfterMs == null ? {} : { retryAfterMs }
        }
      );
    }
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const now = Date.now();
    if (typeof data?.connectToken !== "string" || data.connectToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(data.connectToken) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) {
      throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u5237\u65B0\u51ED\u8BC1");
    }
    validateRefreshContext(data, initialRelay, now);
    const grantExpiresAt = data.grantExpiresAt;
    if (grantExpiresAt !== void 0 && grantExpiresAt !== null && (!Number.isSafeInteger(grantExpiresAt) || grantExpiresAt <= now)) {
      throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u6388\u6743\u51ED\u8BC1\u6709\u6548\u671F");
    }
    const patch = {
      connectToken: data.connectToken,
      expiresAt: data.expiresAt,
      ...credential.tokenEndpoint ? {} : { tokenEndpoint },
      ...Number.isSafeInteger(grantExpiresAt) ? { grantExpiresAt } : {}
    };
    const currentConfig = this.configStore.get();
    const currentIdentity = await this.configStore.endpointIdentity();
    const contextChanged = currentConfig.relay?.url !== initialRelay.url || currentConfig.relay?.spaceId !== initialRelay.spaceId || currentConfig.relay?.endpointId !== initialRelay.endpointId || currentConfig.relay?.endpointType !== initialRelay.endpointType || currentIdentity?.publicKey !== identity?.publicKey;
    if (contextChanged) {
      throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
    }
    let currentCredential = null;
    let persistenceAvailable = false;
    if (typeof this.configStore.relayCredential === "function" || typeof this.configStore.persistedRelayCredential === "function") {
      persistenceAvailable = true;
      currentCredential = await this.#persistedCredential();
      if (persist && currentCredential && currentCredential.endpointGrant !== credential.endpointGrant) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
      if (persist && currentCredential && (currentCredential.tokenEndpoint || "") !== (credential.tokenEndpoint || "")) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
    }
    let updatedValue = null;
    if (persist && (currentCredential || !persistenceAvailable)) {
      if (typeof this.configStore.updateRelayCredential !== "function") {
        throw new RelayError("AUTH_FAILED", "\u5F53\u524D\u51ED\u8BC1\u5B58\u50A8\u4E0D\u652F\u6301\u81EA\u52A8\u7EED\u671F");
      }
      const expectedCredential = { endpointGrant: credential.endpointGrant };
      if (currentCredential && Object.hasOwn(currentCredential, "connectToken")) {
        expectedCredential.connectToken = currentCredential.connectToken;
      } else if (currentCredential) {
        expectedCredential.connectToken = null;
      }
      if (currentCredential && Object.hasOwn(currentCredential, "tokenEndpoint")) {
        expectedCredential.tokenEndpoint = currentCredential.tokenEndpoint;
      } else if (currentCredential) {
        expectedCredential.tokenEndpoint = null;
      }
      updatedValue = await this.configStore.updateRelayCredential(
        patch,
        expectedCredential
      );
      if (updatedValue === null) {
        throw new RelayError("AUTH_CONTEXT_CHANGED", "Relay \u8FDE\u63A5\u51ED\u8BC1\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5");
      }
    } else {
      this.logger?.info?.("relay", "\u4F7F\u7528\u672A\u4FDD\u5B58\u7684 Endpoint Grant \u5B8C\u6210\u672C\u6B21\u8FDE\u63A5\u6D4B\u8BD5");
    }
    const updated = persist ? {
      ...credential,
      ...currentCredential || {},
      ...updatedValue || {},
      ...patch
    } : {
      ...credential,
      ...patch
    };
    this.logger.info("relay", "Connect Token \u5DF2\u901A\u8FC7 Endpoint Grant \u81EA\u52A8\u7EED\u671F", {
      expiresAt: new Date(updated.expiresAt).toISOString()
    });
    return updated;
  }
  #clearRefresh(promise) {
    if (this.#refreshing === promise) {
      this.#refreshing = null;
      this.#refreshingKey = null;
    }
  }
  async #credential() {
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential();
    }
    const token = typeof this.configStore.token === "function" ? await this.configStore.token() : typeof this.configStore.get === "function" ? await this.configStore.get() : null;
    if (typeof token === "string") return token ? { connectToken: token } : null;
    if (typeof token?.relay?.token === "string" && token.relay.token) {
      return { connectToken: token.relay.token };
    }
    return null;
  }
  async #persistedCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return this.#credential();
  }
  async #refreshContextKey(credential) {
    let config;
    try {
      config = this.configStore.get();
    } catch {
      config = {};
    }
    let identity;
    try {
      identity = await this.configStore.endpointIdentity();
    } catch {
      identity = {};
    }
    return [
      credential.endpointGrant || "",
      credential.tokenEndpoint || "",
      config.relay?.url || "",
      config.relay?.spaceId || "",
      config.relay?.endpointId || "",
      identity?.publicKey || ""
    ].join("\0");
  }
  async #resolveCredential(suppliedCredential) {
    const stored = await this.#credential();
    if (suppliedCredential === null || suppliedCredential === void 0) return stored;
    const supplied = typeof suppliedCredential === "string" ? { connectToken: suppliedCredential } : suppliedCredential;
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) return stored;
    const hasTokenField = Object.hasOwn(supplied, "connectToken");
    const hasGrantField = Object.hasOwn(supplied, "endpointGrant");
    const merged = { ...stored || {}, ...supplied };
    if (hasGrantField && !hasTokenField) {
      delete merged.connectToken;
      delete merged.expiresAt;
    }
    if (typeof supplied.connectToken === "string" && supplied.connectToken && stored?.connectToken && supplied.connectToken !== stored.connectToken) {
      if (!Object.hasOwn(supplied, "expiresAt")) delete merged.expiresAt;
      if (!hasGrantField) {
        delete merged.endpointGrant;
        delete merged.grantExpiresAt;
      }
    }
    if (typeof supplied.endpointGrant === "string" && supplied.endpointGrant && stored?.endpointGrant && supplied.endpointGrant !== stored.endpointGrant && !Object.hasOwn(supplied, "grantExpiresAt")) {
      delete merged.grantExpiresAt;
    }
    return Object.keys(merged).length ? merged : null;
  }
};
function deriveTokenEndpoint(relayUrl) {
  try {
    const url = new URL(relayUrl);
    if (!["ws:", "wss:"].includes(url.protocol)) return null;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/api/connect-tokens/refresh";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function resolveTokenEndpoint(configured, relayUrl) {
  const raw = typeof configured === "string" && configured.trim() ? configured.trim() : deriveTokenEndpoint(relayUrl);
  if (!raw) return null;
  try {
    const endpoint = new URL(raw);
    const loopback = isLoopbackHostname(endpoint.hostname);
    if (!["http:", "https:"].includes(endpoint.protocol) || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.protocol !== "https:" && !loopback) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}
function isRetryableHttpStatus(status) {
  return Number.isInteger(status) && (status === 408 || status === 425 || status === 429 || status >= 500 && status <= 599);
}
function retryAfterMilliseconds(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isSafeInteger(seconds)) return MAX_RETRY_AFTER_MS;
    return Math.min(MAX_RETRY_AFTER_MS, seconds * 1e3);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()));
}
function validateRefreshContext(data, relay, now = Date.now()) {
  const expected = {
    spaceId: typeof relay?.spaceId === "string" ? relay.spaceId : "",
    endpointId: typeof relay?.endpointId === "string" ? relay.endpointId : "",
    endpointType: typeof relay?.endpointType === "string" && relay.endpointType ? relay.endpointType : "bridge"
  };
  for (const field of ["spaceId", "endpointId", "endpointType"]) {
    if (data?.[field] === void 0 || data?.[field] === null) continue;
    if (typeof data[field] !== "string" || !data[field] || data[field] !== expected[field]) {
      throw new RelayError("AUTH_CONTEXT_CHANGED", `Relay \u5237\u65B0\u54CD\u5E94\u7684 ${field} \u4E0E\u5F53\u524D\u914D\u7F6E\u4E0D\u4E00\u81F4`);
    }
  }
  if (data?.grantExpiresAt !== void 0 && data?.grantExpiresAt !== null && (!Number.isSafeInteger(data.grantExpiresAt) || data.grantExpiresAt <= now)) {
    throw new RelayError("INVALID_MESSAGE", "Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u6388\u6743\u51ED\u8BC1\u6709\u6548\u671F");
  }
}

// server/outbound-queue.js
var OutboundQueue = class {
  #entries = [];
  #bytes = 0;
  #timer = null;
  #nextSendAt = 0;
  constructor({
    bytesPerSecond = 512 * 1024,
    maxBytes = 16 * 1024 * 1024,
    maxEntries = 512,
    maxWaitMs = 25e3
  } = {}) {
    Object.assign(this, { bytesPerSecond, maxBytes, maxEntries, maxWaitMs });
  }
  status() {
    return { queuedBytes: this.#bytes, queuedFrames: this.#entries.length, bytesPerSecond: this.bytesPerSecond };
  }
  enqueue(encoded, send, reject = () => {
  }) {
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (this.#bytes + bytes > this.maxBytes || this.#entries.length >= this.maxEntries) {
      reject(new RelayError("RELAY_BACKPRESSURE", "Relay \u53D1\u9001\u961F\u5217\u5DF2\u6EE1\uFF0C\u8BF7\u7A0D\u540E\u540C\u6B65"));
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
  clear(error = new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00")) {
    clearTimeout(this.#timer);
    this.#timer = null;
    const entries = this.#entries.splice(0);
    this.#bytes = 0;
    for (const entry of entries) entry.reject(error);
  }
  #drain() {
    if (this.#timer) return;
    while (this.#entries.length) {
      const entry = this.#entries[0];
      const now = Date.now();
      if (entry.expiresAt <= now) {
        this.#entries.shift();
        this.#bytes -= entry.bytes;
        entry.reject(new RelayError("RELAY_BACKPRESSURE", "Relay \u53D1\u9001\u6392\u961F\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65"));
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
      this.#nextSendAt = now + Math.max(34, Math.ceil(entry.bytes * 1e3 / this.bytesPerSecond));
      try {
        entry.send(entry.encoded);
      } catch (error) {
        entry.reject(error);
      }
    }
  }
};

// server/resource-cache.js
import { createHash as createHash4 } from "node:crypto";
var ResourceCache = class {
  #entries = /* @__PURE__ */ new Map();
  constructor(maxEntries = 256) {
    this.maxEntries = maxEntries;
  }
  get(context, mime, bytes, upload) {
    const key = createHash4("sha256").update(JSON.stringify([context, mime])).update(bytes).digest("hex");
    const cached = this.#entries.get(key);
    if (cached && (cached.pending || cached.expiresAt > Date.now() + 6e4)) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached.promise;
    }
    const entry = { pending: true, expiresAt: 0, promise: null };
    entry.promise = Promise.resolve().then(upload).then((ready) => {
      entry.pending = false;
      entry.expiresAt = typeof ready?.expiresAt === "number" ? ready.expiresAt : Date.parse(ready?.expiresAt);
      if (!ready?.resourceUrl || !(entry.expiresAt > Date.now() + 6e4)) {
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
};

// server/relay-client.js
var TERMINAL_RELAY_AUTH_CODES = /* @__PURE__ */ new Set([
  "auth.token_expired",
  "auth.token_revoked",
  "auth.invalid_token",
  "auth.proof_required",
  "auth.proof_mismatch",
  "auth.proof_invalid",
  "auth.proof_expired",
  "auth.grant_required",
  "auth.grant_expired",
  "auth.grant_revoked",
  "auth.invalid_grant",
  "auth.refresh_invalid",
  "auth.refresh_rejected",
  "auth.replay",
  "auth.account_unavailable",
  "auth.space_unavailable",
  "auth.endpoint_type_mismatch",
  "auth.revoked",
  "AUTH_CONTEXT_CHANGED",
  "handshake.invalid",
  "connection.kicked"
]);
var TOKEN_REFRESH_LEAD_MS = 6e4;
var UNKNOWN_EXPIRY_REFRESH_MS = 5 * 6e4;
var TOKEN_REFRESH_RETRY_MS = 15e3;
var RelayClient = class extends EventEmitter4 {
  #socket = null;
  #heartbeat = null;
  #reconnectTimer = null;
  #tokenRefreshTimer = null;
  #tokenRefreshInFlight = null;
  #tokenRefreshContextKey = null;
  #connectPromise = null;
  #socketGeneration = 0;
  #attempt = 0;
  #manualClose = false;
  #token = null;
  #credential = null;
  #tokenService;
  #maxFrameSize = 10 * 1024 * 1024;
  #forceTokenRefresh = false;
  #credentialRefreshBlocked = false;
  #rotationInProgress = false;
  #resourceRequests = /* @__PURE__ */ new Map();
  #outbound;
  #resourceCache = new ResourceCache();
  #rateLimitUntil = 0;
  #connectionError = null;
  constructor(configStore, logger, options = {}) {
    super();
    this.configStore = configStore;
    this.logger = logger;
    this.#tokenService = options.tokenService || new RelayTokenService(configStore, logger, options);
    this.#outbound = new OutboundQueue(options.outbound);
    this.state = "disconnected";
    this.lastError = null;
    this.lastHeartbeat = null;
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
  }
  status() {
    return {
      state: this.state,
      lastError: this.lastError,
      lastHeartbeat: this.lastHeartbeat,
      connectedAt: this.connectedAt,
      connectionId: this.connectionId,
      features: [...this.features],
      reconnectAttempt: this.#attempt,
      transfer: this.#outbound.status(),
      retryAfterMs: Math.max(0, this.#rateLimitUntil - Date.now())
    };
  }
  async connect(credential) {
    if (this.#connectPromise) return this.#connectPromise;
    if (["connected", "authenticating", "connecting", "disconnecting"].includes(this.state)) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    if (!config.relay.url) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay \u5730\u5740");
    if (!spaceId) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Space ID");
    if (!relayEndpointId(config.relay)) throw new RelayError("CONFIG_INCOMPLETE", "\u5C1A\u672A\u914D\u7F6E Relay Endpoint ID");
    const token = typeof credential === "string" ? credential.trim() : credential?.connectToken?.trim?.() || "";
    const grant = credential && typeof credential === "object" ? credential.endpointGrant?.trim?.() || "" : "";
    if (credential !== void 0 && credential !== null && !token && !grant) {
      throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token \u6216 Endpoint Grant");
    }
    if (credential === void 0 || credential === null) this.#credential = null;
    else if (typeof credential === "string") this.#credential = { connectToken: token };
    else this.#credential = {
      ...credential,
      ...token ? { connectToken: token } : {},
      ...grant ? { endpointGrant: grant } : {}
    };
    this.#manualClose = false;
    this.#credentialRefreshBlocked = false;
    this.#forceTokenRefresh = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    return this.#beginOpen();
  }
  async test(credential, timeoutMs = 8e3) {
    if (this.state === "connected") {
      return {
        ok: true,
        connectionId: this.connectionId,
        protocolVersion: PROTOCOL_VERSION,
        reused: true
      };
    }
    if (["connecting", "authenticating", "reconnecting", "disconnecting"].includes(this.state)) {
      throw new RelayError("RELAY_BUSY", "Relay \u6B63\u5728\u8FDE\u63A5\u6216\u65AD\u5F00\uFF0C\u8BF7\u7B49\u5F85\u5F53\u524D\u64CD\u4F5C\u5B8C\u6210");
    }
    const config = this.configStore.get();
    const supplied = typeof credential === "string" ? { connectToken: credential } : credential;
    if (!config.relay.url || !relaySpaceId(config.relay) || !relayEndpointId(config.relay)) {
      throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Relay \u5730\u5740\u3001Space ID \u548C Relay Endpoint ID");
    }
    let storedCredential = null;
    if (typeof this.configStore.relayCredential === "function") {
      try {
        storedCredential = await this.configStore.relayCredential();
      } catch {
      }
    }
    const endpointGrant = supplied && typeof supplied === "object" && Object.hasOwn(supplied, "endpointGrant") ? supplied.endpointGrant?.trim?.() || "" : storedCredential?.endpointGrant?.trim?.() || "";
    const draftCredential = hasDifferentCredentialFields(supplied, storedCredential);
    const persistRefresh = !draftCredential;
    let token = await this.#tokenService.usableToken({
      credential: supplied,
      persist: persistRefresh
    });
    if (!token) throw new RelayError("CONFIG_INCOMPLETE", "\u8BF7\u5148\u586B\u5199 Connect Token \u6216 Endpoint Grant");
    let refreshAttempted = false;
    while (true) {
      try {
        return await this.#testHandshake(config, token, timeoutMs);
      } catch (error) {
        if (!refreshAttempted && isRefreshableCredentialFailure(error) && endpointGrant) {
          token = await this.#tokenService.usableToken({
            force: true,
            credential: typeof supplied === "object" && supplied ? { ...supplied, connectToken: token } : { connectToken: token },
            persist: persistRefresh
          });
          if (!token) throw new RelayError("CONFIG_INCOMPLETE", "\u5237\u65B0\u540E\u4ECD\u672A\u83B7\u5F97\u6709\u6548 Connect Token");
          refreshAttempted = true;
          continue;
        }
        throw error;
      }
    }
  }
  async #testHandshake(config, token, timeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(config.relay.url);
      let settled = false;
      let timeout;
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const closeAfter = () => {
        try {
          socket.close();
        } catch {
        }
      };
      timeout = setTimeout(() => {
        finishReject(new RelayError("RELAY_TIMEOUT", "Relay \u5728\u6D4B\u8BD5\u65F6\u95F4\u5185\u6CA1\u6709\u786E\u8BA4\u8BA4\u8BC1"));
        closeAfter();
      }, timeoutMs);
      socket.addEventListener("open", async () => {
        try {
          socket.send(JSON.stringify(await this.#hello(config, token, true)));
        } catch (error) {
          finishReject(error);
          closeAfter();
        }
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "connect.welcome") {
            validateRelayWelcome(message);
            validateWelcomeIdentity(message, config);
            finishResolve({ ok: true, connectionId: message.connectionId, protocolVersion: message.version });
            closeAfter();
          } else if (message.type === "relay.error") {
            finishReject(new RelayError(message.code || "AUTH_FAILED", message.message || "Relay \u62D2\u7EDD\u8FDE\u63A5"));
            closeAfter();
          }
        } catch (error) {
          finishReject(new RelayError("INVALID_MESSAGE", `Relay \u8FD4\u56DE\u4E86\u65E0\u6548\u6D88\u606F\uFF1A${error.message}`));
          closeAfter();
        }
      });
      socket.addEventListener("error", () => {
        finishReject(new RelayError("RELAY_UNAVAILABLE", "\u65E0\u6CD5\u8FDE\u63A5 Relay"));
      });
      socket.addEventListener("close", (event) => {
        if (!settled) finishReject(new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`));
      });
    });
  }
  async disconnect(reason = "manual disconnect") {
    this.#outbound.clear();
    this.#manualClose = true;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeat);
    clearTimeout(this.#tokenRefreshTimer);
    this.#reconnectTimer = null;
    this.#heartbeat = null;
    this.#tokenRefreshTimer = null;
    this.#rotationInProgress = false;
    const socket = this.#socket;
    const opening = this.#connectPromise;
    this.#credential = null;
    this.#token = null;
    this.#forceTokenRefresh = false;
    this.#credentialRefreshBlocked = false;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
    }
    this.#resourceRequests.clear();
    const shouldWait = Boolean(opening) || Boolean(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING));
    this.state = shouldWait ? "disconnecting" : "disconnected";
    this.connectedAt = null;
    this.connectionId = null;
    this.features = [];
    this.emit("status", this.status());
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      await closeSocket(socket, reason);
    }
    if (opening) await opening.catch(() => {
    });
    this.#socketGeneration += 1;
    this.#socket = null;
    this.state = "disconnected";
    this.emit("status", this.status());
    return this.status();
  }
  send(message) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") return false;
    const config = this.configStore.get();
    const frame = wrapRelayFrame(message, config);
    if (frame?.to && !this.features.includes("directed-routing")) {
      const error = new RelayError(
        "DIRECTED_ROUTING_UNAVAILABLE",
        "\u5F53\u524D Relay \u5957\u9910\u4E0D\u652F\u6301\u5B9A\u5411\u8F6C\u53D1\uFF0C\u654F\u611F\u547D\u4EE4\u672A\u53D1\u9001"
      );
      this.lastError = error.message;
      this.logger.warn("relay", "Relay \u672A\u63D0\u4F9B\u5B9A\u5411\u8F6C\u53D1\u80FD\u529B\uFF0C\u5DF2\u963B\u6B62\u76EE\u6807\u6D88\u606F", {
        code: error.code,
        target: frame.to
      });
      this.emit("status", this.status());
      return false;
    }
    const encoded = JSON.stringify(frame);
    if (Buffer.byteLength(encoded, "utf8") > this.#maxFrameSize) {
      this.lastError = "\u5F85\u53D1\u9001\u6D88\u606F\u8D85\u8FC7 Relay maxFrameSize \u9650\u5236";
      this.logger.warn("relay", "\u5DF2\u963B\u6B62\u8D85\u8FC7 maxFrameSize \u7684\u6D88\u606F", {
        bytes: Buffer.byteLength(encoded, "utf8"),
        maxFrameSize: this.#maxFrameSize,
        type: message?.type
      });
      this.emit("status", this.status());
      return false;
    }
    const socket = this.#socket;
    if (message.type === "ping") {
      if (Date.now() < this.#rateLimitUntil) return false;
      try {
        socket.send(encoded);
        return true;
      } catch {
        return false;
      }
    }
    return this.#outbound.enqueue(encoded, (payload) => {
      if (this.#socket !== socket || socket.readyState !== WebSocket.OPEN) {
        throw new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u66F4\u6362\uFF0C\u65E7\u54CD\u5E94\u5DF2\u4E22\u5F03");
      }
      socket.send(payload);
    }, (error) => {
      this.logger.warn("relay", "Relay \u6570\u636E\u672A\u53D1\u9001\uFF0C\u9700\u8981\u91CD\u65B0\u540C\u6B65", { code: error.code, type: message?.type });
    });
  }
  /** Upload an image over the authenticated data channel and receive a
   * short-lived capability URL from Relay. */
  uploadResource({ mime, data, ttlSeconds } = {}) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const relay = this.configStore.get().relay;
    const context = [relay.url, relaySpaceId(relay), relayEndpointId(relay), ttlSeconds];
    return this.#resourceCache.get(context, mime, bytes, () => this.#uploadResource({ mime, bytes, ttlSeconds }));
  }
  #uploadResource({ mime, bytes, ttlSeconds }) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN || this.state !== "connected") {
      return Promise.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u5C1A\u672A\u8FDE\u63A5\uFF0C\u65E0\u6CD5\u4E0A\u4F20\u56FE\u7247"));
    }
    if (!this.features.includes("resources-v1")) {
      return Promise.reject(new RelayError("RESOURCE_UNSUPPORTED", "\u5F53\u524D Relay \u4E0D\u652F\u6301\u53D7\u63A7\u56FE\u7247\u8D44\u6E90"));
    }
    const frameBudget = Math.max(0, this.#maxFrameSize - 1024);
    const maxByFrame = Math.floor(frameBudget * 3 / 4);
    if (!bytes.length || bytes.length > Math.min(6 * 1024 * 1024, maxByFrame)) {
      return Promise.reject(new RelayError("RESOURCE_TOO_LARGE", "\u56FE\u7247\u8D85\u8FC7 6 MiB \u9650\u5236"));
    }
    const requestId = randomId("resource");
    const frame = {
      version: PROTOCOL_VERSION,
      type: "stream.message",
      messageId: randomId("resource-msg"),
      streamId: "resources",
      from: relayEndpointId(this.configStore.get().relay),
      protocol: "codex.resource.v1",
      encrypted: false,
      payload: {
        type: "codex.resource.put",
        requestId,
        mime: typeof mime === "string" ? mime : "",
        data: bytes.toString("base64"),
        ...Number.isInteger(ttlSeconds) ? { ttlSeconds } : {}
      }
    };
    return new Promise((resolve, reject) => {
      let timer;
      const fail = (error) => {
        this.#resourceRequests.delete(requestId);
        clearTimeout(timer);
        reject(error);
      };
      this.#resourceRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: fail
      });
      const socket = this.#socket;
      this.#outbound.enqueue(JSON.stringify(frame), (payload) => {
        if (this.#socket !== socket || socket.readyState !== WebSocket.OPEN) {
          throw new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u66F4\u6362\uFF0C\u56FE\u7247\u4E0A\u4F20\u5DF2\u53D6\u6D88");
        }
        timer = setTimeout(() => fail(new RelayError("RESOURCE_TIMEOUT", "Relay \u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u8D85\u65F6")), 15e3);
        socket.send(payload);
      }, fail);
    });
  }
  #beginOpen() {
    if (this.#connectPromise) return this.#connectPromise;
    const promise = this.#open();
    this.#connectPromise = promise;
    const clear = () => {
      if (this.#connectPromise === promise) this.#connectPromise = null;
    };
    promise.then(clear, clear);
    return promise;
  }
  async #open() {
    try {
      const usableCredential = await this.#usableCredential({
        force: this.#forceTokenRefresh,
        credential: this.#credential
      });
      this.#token = usableCredential?.connectToken || null;
      this.#credential = {
        ...this.#credential || {},
        ...usableCredential || {},
        ...this.#token ? { connectToken: this.#token } : {}
      };
      if (!this.#token) throw new RelayError("AUTH_FAILED", "\u5C1A\u672A\u914D\u7F6E Relay Connect Token");
      this.#forceTokenRefresh = false;
      const stored = await this.#authoritativeCredential();
      if (stored) {
        if (stored?.connectToken === this.#token) {
          this.#credential = stored;
        } else {
          const supplied = this.#credential || {};
          const tokenChanged = Boolean(
            supplied.connectToken && supplied.connectToken !== this.#token
          );
          this.#credential = {
            ...stored || {},
            ...supplied,
            connectToken: this.#token
          };
          if (tokenChanged) delete this.#credential.expiresAt;
        }
      }
    } catch (error) {
      if (this.#manualClose) throw error;
      this.#handleFailure(error);
      if (!this.#manualClose && !isTerminalRelayFailure(error, this.#credential)) {
        this.#scheduleReconnect();
      }
      throw error;
    }
    if (this.#manualClose) return this.status();
    const config = this.configStore.get();
    const spaceId = relaySpaceId(config.relay);
    this.state = "connecting";
    this.lastError = null;
    this.emit("status", this.status());
    this.logger.info("relay", "\u6B63\u5728\u8FDE\u63A5 Relay", { url: config.relay.url, spaceId });
    const generation = ++this.#socketGeneration;
    return new Promise((resolve, reject) => {
      let settled = false;
      let established = false;
      let failureReported = false;
      let failureCode = null;
      const socket = new WebSocket(config.relay.url);
      this.#socket = socket;
      const isCurrent = () => this.#socket === socket && this.#socketGeneration === generation;
      const reportFailure = (error) => {
        if (failureReported || !isCurrent()) return;
        failureReported = true;
        failureCode = error?.code || "RELAY_UNAVAILABLE";
        if (this.#manualClose) return;
        this.#handleFailure(error);
      };
      const authenticationTimeout = setTimeout(() => {
        const error = new RelayError("RELAY_TIMEOUT", "Relay \u8BA4\u8BC1\u8D85\u65F6");
        reportFailure(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
        socket.close();
      }, 1e4);
      socket.addEventListener("open", async () => {
        if (!isCurrent()) return;
        this.state = "authenticating";
        this.emit("status", this.status());
        try {
          socket.send(JSON.stringify(await this.#hello(config, this.#token, false)));
        } catch (error) {
          reportFailure(error);
          if (!settled) {
            settled = true;
            clearTimeout(authenticationTimeout);
            reject(error);
          }
          socket.close();
        }
      });
      socket.addEventListener("message", (event) => this.#handleMessage(event, {
        resolve,
        reject,
        settle: () => {
          settled = true;
        },
        authenticationTimeout,
        socket,
        isCurrent,
        reportFailure,
        markEstablished: () => {
          established = true;
        }
      }));
      socket.addEventListener("error", () => {
        const error = this.#connectionError || new RelayError("RELAY_UNAVAILABLE", "Relay WebSocket \u8FDE\u63A5\u5931\u8D25");
        reportFailure(error);
        if (!settled) {
          settled = true;
          clearTimeout(authenticationTimeout);
          reject(error);
        }
      });
      socket.addEventListener("close", (event) => {
        if (!isCurrent()) return;
        clearTimeout(authenticationTimeout);
        clearInterval(this.#heartbeat);
        this.#heartbeat = null;
        clearTimeout(this.#tokenRefreshTimer);
        this.#tokenRefreshTimer = null;
        const rotating = this.#rotationInProgress;
        this.#rotationInProgress = false;
        if (!settled) {
          settled = true;
          const error = new RelayError("RELAY_UNAVAILABLE", `Relay \u5728\u8BA4\u8BC1\u524D\u65AD\u5F00\uFF1A${event.code}`);
          reportFailure(error);
          reject(error);
        }
        if (established && !failureReported && !this.#manualClose && !rotating) {
          reportFailure(this.#connectionError || new RelayError("RELAY_UNAVAILABLE", `Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF1A${event.code}`));
        }
        this.#detachSocket(socket);
        if (!this.#manualClose && !this.#credentialRefreshBlocked && !isTerminalRelayFailure({ code: failureCode }, this.#credential)) {
          this.#scheduleReconnect(rotating ? 100 : void 0);
        } else {
          this.emit("disconnected", { code: failureCode || event.code });
        }
      });
    });
  }
  #handleMessage(event, handshake) {
    if (handshake.isCurrent && !handshake.isCurrent()) return;
    let message;
    try {
      const raw = String(event.data);
      if (Buffer.byteLength(raw, "utf8") > this.#maxFrameSize) {
        handshake.socket?.close(1009, "message too large");
        throw new RelayError("INVALID_MESSAGE", "Relay \u6D88\u606F\u8D85\u8FC7 maxFrameSize \u9650\u5236");
      }
      message = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("relay", "\u5FFD\u7565 Relay \u7684\u65E0\u6548 JSON", { message: error.message });
      return;
    }
    if (message.type === "connect.welcome") {
      if (this.state !== "authenticating" || handshake.isCurrent && !handshake.isCurrent()) return;
      try {
        validateRelayWelcome(message);
        validateWelcomeIdentity(message, this.configStore.get());
        if (!Number.isInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
          throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7F3A\u5C11\u6709\u6548 maxFrameSize");
        }
      } catch (error) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.reportFailure?.(error);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close(1002, "invalid welcome");
        return;
      }
      clearTimeout(handshake.authenticationTimeout);
      this.state = "connected";
      handshake.markEstablished?.();
      this.connectedAt = nowIso();
      this.connectionId = message.connectionId;
      this.features = Array.isArray(message.features) ? message.features.filter((item) => typeof item === "string") : [];
      if (Number.isInteger(message.maxFrameSize) && message.maxFrameSize > 0) this.#maxFrameSize = message.maxFrameSize;
      this.#attempt = 0;
      this.lastError = null;
      this.#connectionError = null;
      this.#startHeartbeat();
      this.#scheduleTokenRefresh();
      this.logger.info("relay", "Relay \u5DF2\u8FDE\u63A5\u5E76\u5B8C\u6210\u8BA4\u8BC1", { connectionId: this.connectionId });
      this.emit("status", this.status());
      this.emit("connected", message);
      handshake.settle();
      handshake.resolve(this.status());
      return;
    }
    if (message.type === "relay.error") {
      const authenticating = this.state === "authenticating";
      const error = new RelayError(message.code || "RELAY_ERROR", message.message || "Relay \u8FD4\u56DE\u9519\u8BEF");
      if (isRefreshableCredentialFailure(error) && this.#credential?.endpointGrant) {
        this.#forceTokenRefresh = true;
      }
      const requestLevel = ["resource.", "message.too_large", "rate.limited", "frame.invalid"].some((prefix) => error.code === prefix || error.code.startsWith(prefix));
      if (!authenticating && error.code === "rate.limited") {
        this.#connectionError = error;
        this.lastError = `Relay \u6570\u636E\u9650\u6D41\uFF1A${error.message}`;
        this.#rateLimitUntil = Date.now() + 6e4;
        this.#outbound.bytesPerSecond = Math.max(16 * 1024, Math.floor(this.#outbound.bytesPerSecond / 2));
        this.#outbound.clear(error);
        this.#outbound.pause(6e4);
        for (const pending of this.#resourceRequests.values()) pending.reject(error);
        this.#resourceRequests.clear();
        this.logger.warn("relay", "Relay \u6570\u636E\u9650\u6D41\uFF0C\u6682\u505C\u53D1\u9001\u5E76\u964D\u4F4E\u901F\u7387", {
          code: error.code,
          message: error.message,
          retryAfterMs: 6e4,
          bytesPerSecond: this.#outbound.bytesPerSecond
        });
        this.emit("status", this.status());
        return;
      }
      if (!authenticating && requestLevel) {
        this.logger.warn("relay", "Relay \u62D2\u7EDD\u4E86\u5355\u4E2A\u6570\u636E\u8BF7\u6C42\uFF0C\u4FDD\u6301\u8FDE\u63A5", {
          code: error.code,
          message: error.message
        });
        this.emit("status", this.status());
        return;
      }
      handshake.reportFailure?.(error);
      if (authenticating) {
        clearTimeout(handshake.authenticationTimeout);
        handshake.settle();
        handshake.reject(error);
        handshake.socket?.close();
      } else {
        handshake.socket?.close();
      }
      return;
    }
    if (message.type === "pong") {
      this.lastHeartbeat = nowIso();
      this.emit("status", this.status());
      return;
    }
    if (message.type === "stream.message" && message.protocol === "codex.resource.v1") {
      const resourceMessage = unwrapRelayFrame(message);
      if (resourceMessage?.type === "codex.resource.ready" && resourceMessage.requestId) {
        const pending = this.#resourceRequests.get(resourceMessage.requestId);
        if (pending) {
          this.#resourceRequests.delete(resourceMessage.requestId);
          pending.resolve(resourceMessage);
        }
      }
      return;
    }
    if (message.type === "stream.message" && message.protocol !== "codex.v1") return;
    const productMessage = unwrapRelayFrame(message);
    if (productMessage?.type === "codex.command") this.emit("command", productMessage);
  }
  async #hello(config, token, test) {
    const identity = await this.configStore.endpointIdentity();
    const spaceId = relaySpaceId(config.relay);
    const endpointId = relayEndpointId(config.relay);
    const requestId = randomId("hello");
    const issuedAt = Date.now();
    const nonce = crypto5.randomBytes(24).toString("base64url");
    const canonical = [
      "relay-connect-v1",
      PROTOCOL_VERSION,
      requestId,
      spaceId,
      endpointId,
      "bridge",
      token,
      issuedAt,
      nonce
    ].join("\n");
    const privateKey = crypto5.createPrivateKey({
      key: Buffer.from(identity.privateKey, "base64url"),
      format: "der",
      type: "pkcs8"
    });
    return {
      version: PROTOCOL_VERSION,
      type: "connect.hello",
      requestId,
      spaceId,
      endpointId,
      endpointType: "bridge",
      endpointName: config.relay.deviceName,
      token,
      endpointProof: {
        algorithm: "Ed25519",
        publicKey: identity.publicKey,
        issuedAt,
        nonce,
        signature: crypto5.sign(null, Buffer.from(canonical), privateKey).toString("base64url")
      },
      capabilities: ["threads", "turns", "streaming", "steer", "interrupt", "approvals", "sync-v1", "resources-v1"],
      ...test ? { test: true } : {}
    };
  }
  #startHeartbeat() {
    clearInterval(this.#heartbeat);
    const seconds = this.configStore.get().relay.heartbeatSeconds;
    this.#heartbeat = setInterval(() => {
      this.send({
        version: PROTOCOL_VERSION,
        type: "ping",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: nowIso()
      });
    }, seconds * 1e3);
  }
  #handleFailure(error) {
    if (isTerminalRelayFailure(error, this.#credential)) {
      this.#manualClose = true;
      this.#credentialRefreshBlocked = true;
      clearTimeout(this.#tokenRefreshTimer);
      this.#tokenRefreshTimer = null;
    }
    this.state = "error";
    this.lastError = error.message;
    this.logger.error("relay", "Relay \u8FDE\u63A5\u5F02\u5E38", { code: error.code, message: error.message });
    this.emit("status", this.status());
  }
  #scheduleReconnect(delayOverride = void 0) {
    if (this.#manualClose || this.#credentialRefreshBlocked || this.#reconnectTimer) return;
    const max = this.configStore.get().relay.reconnectMaxSeconds;
    this.#attempt += 1;
    const delay = Math.max(this.#rateLimitUntil - Date.now(), delayOverride ?? Math.min(max, 2 ** Math.min(this.#attempt, 8)) * 1e3 + Math.floor(Math.random() * 500));
    this.state = "reconnecting";
    this.emit("status", this.status());
    this.logger.warn("relay", "Relay \u5DF2\u65AD\u5F00\uFF0C\u8BA1\u5212\u91CD\u8FDE", { attempt: this.#attempt, delayMs: delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#manualClose || this.#credentialRefreshBlocked) return;
      this.#beginOpen().catch(() => {
      });
    }, delay);
    this.#reconnectTimer.unref?.();
  }
  #scheduleTokenRefresh(delayOverride = void 0) {
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    if (this.#manualClose || this.#credentialRefreshBlocked || this.state !== "connected" || !this.#credential?.endpointGrant) return;
    const expiresAt = Number.isSafeInteger(this.#credential.expiresAt) && this.#credential.expiresAt > 0 ? this.#credential.expiresAt : null;
    const delay = delayOverride ?? (expiresAt == null ? UNKNOWN_EXPIRY_REFRESH_MS : Math.max(1e3, expiresAt - Date.now() - TOKEN_REFRESH_LEAD_MS));
    this.#tokenRefreshTimer = setTimeout(() => {
      this.#tokenRefreshTimer = null;
      this.#runScheduledTokenRefresh().catch(() => {
      });
    }, Math.max(250, delay));
    this.#tokenRefreshTimer.unref?.();
  }
  async #runScheduledTokenRefresh() {
    if (this.#manualClose || this.#credentialRefreshBlocked || this.state !== "connected") return;
    const socket = this.#socket;
    const credential = this.#credential;
    if (!socket || socket.readyState !== WebSocket.OPEN || !credential?.endpointGrant) return;
    const generation = this.#socketGeneration;
    const contextKey = this.#tokenRefreshKey(credential, generation);
    if (this.#tokenRefreshInFlight && this.#tokenRefreshContextKey === contextKey) return;
    const promise = (async () => {
      let rotationStarted = false;
      try {
        const refreshedCredential = await this.#usableCredential({ force: true, credential });
        const token = refreshedCredential?.connectToken || null;
        if (!token) throw new RelayError("AUTH_FAILED", "\u81EA\u52A8\u7EED\u671F\u672A\u8FD4\u56DE\u6709\u6548 Connect Token");
        if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
        let nextCredential = {
          ...credential,
          ...refreshedCredential || {},
          connectToken: token
        };
        const stored = await this.#authoritativeCredential();
        if (stored) {
          if (!this.#isCurrentRefreshContext(socket, generation, credential)) return;
          nextCredential = {
            ...stored || {},
            ...credential,
            ...refreshedCredential || {},
            connectToken: token
          };
        }
        this.#token = token;
        this.#credential = nextCredential;
        this.#forceTokenRefresh = false;
        this.#credentialRefreshBlocked = false;
        this.#rotationInProgress = true;
        rotationStarted = true;
        this.state = "reconnecting";
        this.emit("status", this.status());
        await closeSocket(socket, "connect token renewed");
        if (this.#socket === socket && this.#socketGeneration === generation) {
          this.#detachSocket(socket);
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) this.#scheduleReconnect(100);
        }
      } catch (error) {
        if (rotationStarted) {
          this.logger.warn("relay", "\u65E7 Relay \u8FDE\u63A5\u5173\u95ED\u5F02\u5E38\uFF0C\u7EE7\u7EED\u91CD\u8FDE", {
            code: error.code,
            message: error.message
          });
          return;
        }
        if (isTerminalRelayFailure(error, credential)) {
          this.#credentialRefreshBlocked = true;
          this.#manualClose = true;
          clearTimeout(this.#tokenRefreshTimer);
          this.#tokenRefreshTimer = null;
          this.state = "error";
          this.connectedAt = null;
          this.connectionId = null;
          this.features = [];
          this.lastError = error.message;
          this.logger.error("relay", "Connect Token \u81EA\u52A8\u7EED\u671F\u5DF2\u505C\u6B62", {
            code: error.code,
            message: error.message
          });
          this.emit("status", this.status());
          this.#rotationInProgress = true;
          const closed = await closeSocket(socket, "connect token renewal stopped");
          if (this.#socket === socket) {
            this.#detachSocket(socket);
          }
          this.#rotationInProgress = false;
          if (!closed) this.emit("disconnected", { code: error.code || "auth.refresh_rejected" });
          return;
        }
        this.lastError = error.message;
        this.logger.warn("relay", "Connect Token \u81EA\u52A8\u7EED\u671F\u6682\u65F6\u5931\u8D25\uFF0C\u7A0D\u540E\u91CD\u8BD5", {
          code: error.code,
          message: error.message
        });
        this.emit("status", this.status());
        this.#scheduleTokenRefresh(refreshRetryDelay(error));
      } finally {
        if (rotationStarted && this.#rotationInProgress && this.#socket === socket && this.#socketGeneration === generation) {
          this.#rotationInProgress = false;
          if (!this.#manualClose && !this.#credentialRefreshBlocked) {
            this.#detachSocket(socket);
            this.#scheduleReconnect(100);
          }
        }
      }
    })();
    this.#tokenRefreshInFlight = promise;
    this.#tokenRefreshContextKey = contextKey;
    try {
      await promise;
    } finally {
      if (this.#tokenRefreshInFlight === promise) {
        this.#tokenRefreshInFlight = null;
        this.#tokenRefreshContextKey = null;
      }
    }
  }
  #isCurrentRefreshContext(socket, generation, credential) {
    return !this.#manualClose && this.#socket === socket && this.#socketGeneration === generation && this.state === "connected" && this.#credential?.endpointGrant === credential?.endpointGrant;
  }
  #tokenRefreshKey(credential, generation) {
    const config = this.configStore.get();
    return [
      generation,
      config.relay?.url || "",
      relaySpaceId(config.relay),
      relayEndpointId(config.relay),
      credential?.endpointGrant || "",
      credential?.tokenEndpoint || ""
    ].join("\0");
  }
  async #usableCredential(options) {
    if (typeof this.#tokenService.usableCredential === "function") {
      return this.#tokenService.usableCredential(options);
    }
    const token = await this.#tokenService.usableToken(options);
    return {
      ...options?.credential || {},
      ...token ? { connectToken: token } : {}
    };
  }
  async #authoritativeCredential() {
    if (typeof this.configStore.persistedRelayCredential === "function") {
      return this.configStore.persistedRelayCredential();
    }
    if (typeof this.configStore.relayCredential === "function") {
      return this.configStore.relayCredential({ ignoreEnvironment: true });
    }
    return null;
  }
  #detachSocket(socket) {
    if (this.#socket !== socket) return;
    this.#socket = null;
    this.#outbound.clear();
    clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    clearTimeout(this.#tokenRefreshTimer);
    this.#tokenRefreshTimer = null;
    for (const pending of this.#resourceRequests.values()) {
      pending.reject(new RelayError("RELAY_UNAVAILABLE", "Relay \u8FDE\u63A5\u5DF2\u65AD\u5F00"));
    }
    this.#resourceRequests.clear();
  }
};
function isTerminalRelayFailure(error, credential) {
  const code = typeof error === "string" ? error : error?.code;
  if (isRetryableRefreshFailure(error)) return false;
  if (code === "connection.rejected") return true;
  if (isRefreshableCredentialFailure({ code }) && credential?.endpointGrant) return false;
  return TERMINAL_RELAY_AUTH_CODES.has(code);
}
function isRetryableRefreshFailure(error) {
  return error?.code === "RELAY_RETRYABLE" || error?.details?.retryable === true;
}
function refreshRetryDelay(error) {
  const retryAfterMs = error?.details?.retryAfterMs;
  return Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0 ? Math.max(250, retryAfterMs) : TOKEN_REFRESH_RETRY_MS;
}
function isRefreshableCredentialFailure(error) {
  const code = typeof error === "string" ? error : error?.code;
  return code === "auth.token_expired" || code === "auth.invalid_token";
}
function hasDifferentCredentialFields(supplied, stored) {
  if (supplied === void 0 || supplied === null) return false;
  const candidate = typeof supplied === "string" ? { connectToken: supplied.trim() } : supplied;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
  if (!stored) return Object.keys(candidate).some((field) => [
    "connectToken",
    "endpointGrant",
    "tokenEndpoint",
    "expiresAt",
    "grantExpiresAt"
  ].includes(field));
  for (const field of ["connectToken", "endpointGrant", "tokenEndpoint", "expiresAt", "grantExpiresAt"]) {
    if (!Object.hasOwn(candidate, field)) continue;
    const suppliedValue = candidate[field] == null ? "" : String(candidate[field]).trim();
    const storedValue = stored[field] == null ? "" : String(stored[field]).trim();
    if (suppliedValue !== storedValue) return true;
  }
  return false;
}
function closeSocket(socket, reason) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(closed === false ? false : true);
    };
    const timer = setTimeout(() => finish(false), 3e3);
    try {
      socket.addEventListener("close", finish, { once: true });
      socket.close(1e3, reason);
    } catch {
      finish();
    }
  });
}
function validateWelcomeIdentity(message, config) {
  const expectedSpaceId = relaySpaceId(config.relay);
  const expectedEndpointId = relayEndpointId(config.relay);
  if (message.spaceId !== expectedSpaceId || message.endpointId !== expectedEndpointId) {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome \u7684 Space \u6216 Endpoint \u4E0E\u672C\u673A\u914D\u7F6E\u4E0D\u4E00\u81F4");
  }
}

// server/resource-images.js
import { execFile as execFile2 } from "node:child_process";
import fs11 from "node:fs/promises";
import os6 from "node:os";
import path12 from "node:path";
import { promisify as promisify2 } from "node:util";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var MAX_IMAGE_BYTES = 6 * 1024 * 1024;
var INLINE_THUMBNAIL_BYTES = 256 * 1024;
var execFileAsync2 = promisify2(execFile2);
function parseImageDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;]+)?;base64,([a-z0-9+/=_-]+)$/i.exec(value.trim());
  if (!match) return null;
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: match[1].toLowerCase(), bytes };
}
function imageDataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
function imageMimeForPath(filePath) {
  const extension2 = path12.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif"
  }[extension2] || "";
}
function localPathFromValue(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("file://")) {
    try {
      return fileURLToPath2(candidate);
    } catch {
      return null;
    }
  }
  return path12.isAbsolute(candidate) ? candidate : null;
}
async function parseLocalImage(value, declaredMime, allowedRoots) {
  const candidate = localPathFromValue(value);
  if (!candidate) return null;
  const roots = await Promise.all([os6.tmpdir(), "/tmp", ...allowedRoots || []].filter((root) => typeof root === "string" && path12.isAbsolute(root)).map(async (root) => {
    try {
      return await fs11.realpath(root);
    } catch {
      return path12.resolve(root);
    }
  }));
  let realPath;
  try {
    realPath = await fs11.realpath(candidate);
  } catch {
    return null;
  }
  if (!roots.some((root) => realPath === root || realPath.startsWith(`${root}${path12.sep}`))) return null;
  const mime = typeof declaredMime === "string" && declaredMime.toLowerCase().startsWith("image/") ? declaredMime.toLowerCase() : imageMimeForPath(realPath);
  if (!mime) return null;
  try {
    const stat = await fs11.stat(realPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return null;
    return { mime, bytes: await fs11.readFile(realPath) };
  } catch {
    return null;
  }
}
function thumbnailDataUrl(mime, bytes) {
  return bytes.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl(mime, bytes) : "";
}
async function createThumbnailDataUrl(mime, bytes) {
  const inline = thumbnailDataUrl(mime, bytes);
  if (inline || process.platform !== "darwin") return inline;
  const directory = await fs11.mkdtemp(path12.join(os6.tmpdir(), "recodex-thumb-"));
  const extension2 = mime.split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "") || "img";
  const input = path12.join(directory, `source.${extension2}`);
  const output = path12.join(directory, "thumbnail.jpg");
  try {
    await fs11.writeFile(input, bytes, { mode: 384 });
    await execFileAsync2("sips", ["--resampleWidth", "640", "--setProperty", "format", "jpeg", input, "--out", output], { timeout: 5e3 });
    const thumbnail = await fs11.readFile(output);
    return thumbnail.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl("image/jpeg", thumbnail) : "";
  } catch {
    return "";
  } finally {
    await fs11.rm(directory, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function prepareEventImages(value, upload, seen = /* @__PURE__ */ new WeakSet(), options = {}) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => prepareEventImages(entry, upload, seen, options)));
  }
  if (typeof value === "string") {
    return prepareMarkdownImages(value, upload, options);
  }
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = await prepareEventImages(entry, upload, seen, options);
  }
  const sourceKeys = ["dataUrl", "data_url", "imageUrl", "image_url", "url", "path", "filePath", "file_path", "localPath", "local_path", "data"];
  let sourceKey = null;
  let source = null;
  for (const key of sourceKeys) {
    const parsed = parseImageDataUrl(value[key]) || await parseLocalImage(
      value[key],
      value.mime || value.mimeType || value.mediaType,
      options.allowedRoots
    );
    if (parsed) {
      sourceKey = key;
      source = parsed;
      break;
    }
  }
  if (!source) return result;
  const existingThumbnail = parseImageDataUrl(value.thumbnailDataUrl || value.thumbnail_data_url);
  const thumb = existingThumbnail ? imageDataUrl(existingThumbnail.mime, existingThumbnail.bytes) : await createThumbnailDataUrl(source.mime, source.bytes);
  if (thumb) result.thumbnailDataUrl = thumb;
  try {
    const ready = await upload({ mime: source.mime, bytes: source.bytes });
    if (ready?.resourceUrl) {
      result.resourceUrl = ready.resourceUrl;
      if (ready.expiresAt) result.expiresAt = ready.expiresAt;
      if (sourceKey === "dataUrl" || sourceKey === "data_url" || sourceKey === "data") {
        delete result[sourceKey];
      } else {
        result[sourceKey] = ready.resourceUrl;
      }
    }
  } catch {
  }
  const removableSource = /* @__PURE__ */ new Set(["dataUrl", "data_url", "data", "url", "imageUrl", "image_url", "path", "filePath", "file_path", "localPath", "local_path"]);
  const localSource = ["path", "filePath", "file_path", "localPath", "local_path"].includes(sourceKey) || sourceKey === "url" && localPathFromValue(value[sourceKey]) !== null;
  if (!result.resourceUrl && removableSource.has(sourceKey) && (localSource || source.bytes.length > INLINE_THUMBNAIL_BYTES)) {
    delete result[sourceKey];
  }
  return result;
}
async function prepareMarkdownImages(value, upload, options) {
  const pattern = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/g;
  let match;
  let cursor = 0;
  let output = "";
  let changed = false;
  while ((match = pattern.exec(value)) !== null) {
    const rawTarget = match[2].trim();
    const target = rawTarget.startsWith("<") && rawTarget.endsWith(">") ? rawTarget.slice(1, -1).trim() : rawTarget;
    const source = await parseLocalImage(target, "", options.allowedRoots);
    if (!source) continue;
    let replacement = "";
    try {
      const ready = await upload({ mime: source.mime, bytes: source.bytes });
      replacement = ready?.resourceUrl || "";
    } catch {
    }
    if (!replacement) replacement = await createThumbnailDataUrl(source.mime, source.bytes);
    if (!replacement) continue;
    output += value.slice(cursor, match.index);
    output += `![${match[1]}](${replacement})`;
    cursor = pattern.lastIndex;
    changed = true;
  }
  if (!changed) return value;
  output += value.slice(cursor);
  return output;
}

// server/remote-control.js
import fs12 from "node:fs/promises";
import os7 from "node:os";
import path13 from "node:path";
import { execFile as execFile3, spawn as spawn2 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
var exec = promisify3(execFile3);
var DEFAULT_TIMEOUT = 15e3;
var DEFAULT_STANDALONE = path13.join(os7.homedir(), ".codex", "packages", "standalone", "current", "codex");
var CONTROL_SOCKET = path13.join(os7.homedir(), ".codex", "app-server-control", "app-server-control.sock");
var bounded = (value) => redact(String(value || "")).replace(/[\0\r\n]+/g, " ").slice(0, 600);
var ownSocket = async (file, uid = process.getuid?.()) => {
  const stat = await fs12.stat(file).catch(() => null);
  return Boolean(stat?.isSocket() && (uid == null || stat.uid === uid));
};
async function detectInstallerProxy({ env = process.env, home = os7.homedir() } = {}) {
  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    const value = String(env[key] || "").trim();
    if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  }
  const files = [
    path13.join(home, "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"),
    path13.join(home, ".config/clash/config.yaml"),
    path13.join(home, ".config/clash-verge/config.yaml")
  ];
  for (const file of files) {
    const text3 = await fs12.readFile(file, "utf8").catch(() => "");
    const port = text3.match(/^\s*(?:mixed-port|http-port):\s*(\d+)\s*$/m)?.[1];
    if (port && Number(port) > 0 && Number(port) < 65536) return `http://127.0.0.1:${port}`;
  }
  return null;
}
async function detectCodexAuth({ home = os7.homedir() } = {}) {
  try {
    const saved = JSON.parse(await fs12.readFile(path13.join(home, ".codex", "auth.json"), "utf8"));
    if (typeof saved?.OPENAI_API_KEY === "string" && saved.OPENAI_API_KEY) return "api_key";
    if (typeof saved?.tokens?.access_token === "string" && saved.tokens.access_token) return "chatgpt";
    if (typeof saved?.access_token === "string" && saved.access_token) return "chatgpt";
  } catch {
  }
  return "unknown";
}
function remoteControlPaths(home = os7.homedir()) {
  const codexHome = home || os7.homedir();
  return {
    executable: path13.join(codexHome, ".codex", "packages", "standalone", "current", "codex"),
    controlSocket: path13.join(codexHome, ".codex", "app-server-control", "app-server-control.sock")
  };
}
function extractRemoteControlResult(stdout, stderr = "") {
  const text3 = String(stdout || "").trim();
  let json = null;
  for (const line of text3.split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        json = parsed;
        break;
      }
    } catch {
    }
  }
  const code = text3.match(/(?:pairing\s+code|code)\s*[:=]\s*([A-Z0-9][A-Z0-9-]{3,63})/i)?.[1] || null;
  const url = json?.websocket_url || json?.webSocketUrl || json?.url || null;
  return {
    state: json?.status || json?.state || (text3 ? "reported" : "unknown"),
    pairingCode: code,
    endpoint: typeof url === "string" && /^wss?:\/\//.test(url) ? url : null,
    message: bounded(json?.message || text3 || stderr)
  };
}
async function inspectRemoteControl({ home = os7.homedir(), executable, socketPath, platform = process.platform, run = exec } = {}) {
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  let version = null;
  let installed = false;
  if (platform === "darwin" || platform === "linux") {
    try {
      await fs12.access(binary, fs12.constants.X_OK);
      const result = await run(binary, ["--version"], { timeout: 4e3, maxBuffer: 4096 });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (/codex(?:-cli)?\s+\S+/i.test(output)) {
        installed = true;
        version = bounded(output);
      }
    } catch {
    }
  }
  const running = await ownSocket(control);
  const authMode = await detectCodexAuth({ home });
  const official = {
    state: installed ? authMode === "api_key" ? "auth_required" : running ? "running" : "available" : "unavailable",
    installed,
    version,
    authMode,
    executable: installed ? binary : null,
    controlEndpoint: running ? `unix://${control}` : null,
    attachable: false,
    reason: installed ? authMode === "api_key" ? "\u5F53\u524D\u4F7F\u7528 API Key\uFF1B\u5B98\u65B9 Remote Control \u53EA\u63A5\u53D7 ChatGPT \u8D26\u53F7\u6388\u6743" : running ? "\u5B98\u65B9 Remote Control \u5DF2\u542F\u52A8\uFF1B\u63A7\u5236 Socket \u4EC5\u4F9B\u5B98\u65B9\u5BA2\u6237\u7AEF\u4F7F\u7528" : "\u5DF2\u627E\u5230\u5B98\u65B9 standalone \u5B89\u88C5\uFF0C\u53EF\u4ECE\u63A7\u5236\u53F0\u542F\u52A8 Remote Control" : "\u672A\u627E\u5230\u5B98\u65B9 standalone \u5B89\u88C5\uFF1B\u5F53\u524D Homebrew/\u684C\u9762\u5185\u7F6E CLI \u4E0D\u80FD\u4EE3\u66FF Remote Control daemon"
  };
  const bridge = {
    state: running ? "ready" : "blocked",
    endpoint: running ? `unix://${control}` : null,
    // `app-server proxy` is the supported local client for the daemon socket.
    // This is separate from the ChatGPT Remote Control websocket and does not
    // require ChatGPT account authentication.
    attachable: running,
    reason: running ? "\u5B98\u65B9 App Server Daemon \u5DF2\u542F\u52A8\uFF0C\u53EF\u901A\u8FC7\u5171\u4EAB Unix Socket \u8FDE\u63A5" : "\u7B49\u5F85\u5B98\u65B9 App Server Daemon \u542F\u52A8\u5E76\u521B\u5EFA Unix Socket"
  };
  return { checkedAt: (/* @__PURE__ */ new Date()).toISOString(), official, bridge, paths: { controlSocket: control } };
}
async function runRemoteControl(command, { home = os7.homedir(), executable, socketPath, run = exec, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  if (!["start", "stop", "pair"].includes(command)) throw new Error("\u4E0D\u652F\u6301\u7684 Remote Control \u64CD\u4F5C");
  const paths = remoteControlPaths(home);
  const binary = executable || paths.executable;
  const control = socketPath || paths.controlSocket;
  if (await detectCodexAuth({ home }) === "api_key") {
    const error = new Error("\u5B98\u65B9 Remote Control \u9700\u8981 ChatGPT \u8D26\u53F7\u6388\u6743\uFF1B\u5F53\u524D API Key \u767B\u5F55\u4E0D\u80FD\u4F7F\u7528\u6B64\u529F\u80FD");
    error.code = "REMOTE_CONTROL_AUTH_REQUIRED";
    throw error;
  }
  const exists = await fs12.access(binary, fs12.constants.X_OK).then(() => true, () => false);
  if (!exists) {
    const error = new Error("\u672A\u627E\u5230\u5B98\u65B9 standalone Codex\uFF1B\u8BF7\u5148\u4F7F\u7528\u5B98\u65B9\u5B89\u88C5\u5668\u5B89\u88C5\u540E\u91CD\u8BD5");
    error.code = "REMOTE_CONTROL_UNAVAILABLE";
    throw error;
  }
  const env = { ...process.env, TERM: "xterm", CODEX_HOME: home };
  try {
    const result = await run(binary, ["remote-control", command, "--json"], { env, timeout: timeoutMs, maxBuffer: 128 * 1024 });
    const parsed = extractRemoteControlResult(result.stdout, result.stderr);
    const state = await inspectRemoteControl({ home, executable: binary, socketPath: control, run });
    return { operation: command, ...parsed, official: state.official, bridge: state.bridge };
  } catch (error) {
    const detail = bounded(error.stderr || error.stdout || error.message);
    const authRequired = /ChatGPT authentication|API key auth is not supported|requires ChatGPT authentication/i.test(detail);
    const wrapped = new Error(authRequired ? "\u5B98\u65B9 Remote Control \u9700\u8981 ChatGPT \u8D26\u53F7\u6388\u6743\uFF1B\u5F53\u524D API Key \u767B\u5F55\u4E0D\u80FD\u4F7F\u7528\u6B64\u529F\u80FD" : detail || `\u5B98\u65B9 Remote Control ${command} \u5931\u8D25`);
    wrapped.code = authRequired ? "REMOTE_CONTROL_AUTH_REQUIRED" : error.code === "ETIMEDOUT" ? "REMOTE_CONTROL_TIMEOUT" : "REMOTE_CONTROL_FAILED";
    throw wrapped;
  }
}
async function installOfficialStandalone({ home = os7.homedir(), installerUrl = "https://chatgpt.com/codex/install.sh", fetchImpl = fetch, curlImpl = exec, spawnImpl = spawn2, proxy, timeoutMs = 12e4 } = {}) {
  if (!/^https:\/\/chatgpt\.com\/codex\/install\.sh$/.test(installerUrl)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u5730\u5740\u65E0\u6548");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  const target = remoteControlPaths(home).executable;
  if (await fs12.access(target, fs12.constants.X_OK).then(() => true, () => false)) {
    return { installed: true, alreadyPresent: true, executable: target };
  }
  const proxyUrl = proxy === void 0 ? await detectInstallerProxy({ home }) : proxy;
  let script = "";
  let finalUrl = installerUrl;
  if (proxyUrl && curlImpl) {
    try {
      const args = ["-fsSL", "--proto", "=https", "--connect-timeout", "10", "--max-time", "20", "--proxy", proxyUrl, "-w", "\n__CODEX_INSTALL_URL__%{url_effective}", installerUrl];
      const result = await curlImpl("/usr/bin/curl", args, { timeout: 3e4, maxBuffer: 3 * 1024 * 1024 });
      const marker = "\n__CODEX_INSTALL_URL__";
      const index = String(result.stdout || "").lastIndexOf(marker);
      script = index >= 0 ? String(result.stdout).slice(0, index) : String(result.stdout || "");
      finalUrl = index >= 0 ? String(result.stdout).slice(index + marker.length).trim() : installerUrl;
    } catch (error) {
      const wrapped = new Error(`\u65E0\u6CD5\u901A\u8FC7\u672C\u673A\u4EE3\u7406\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A${bounded(error.stderr || error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    }
  } else {
    let response;
    const downloadController = new AbortController();
    const downloadTimer = setTimeout(() => downloadController.abort(), Math.min(timeoutMs, 2e4));
    try {
      response = await fetchImpl(installerUrl, { redirect: "follow", signal: downloadController.signal });
    } catch (error) {
      const wrapped = new Error(error.name === "AbortError" ? "\u65E0\u6CD5\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A\u7F51\u7EDC\u8FDE\u63A5\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5" : `\u65E0\u6CD5\u4E0B\u8F7D\u5B98\u65B9\u5B89\u88C5\u811A\u672C\uFF1A${bounded(error.message)}`);
      wrapped.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw wrapped;
    } finally {
      clearTimeout(downloadTimer);
    }
    if (!response.ok) {
      const error = new Error(`\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
      error.code = "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED";
      throw error;
    }
    script = await response.text();
    finalUrl = response.url || installerUrl;
  }
  let final;
  try {
    final = new URL(finalUrl);
  } catch {
    final = null;
  }
  if (!final || !["chatgpt.com", "www.chatgpt.com", "openai.com", "www.openai.com", "releases.openai.com"].includes(final.hostname)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u91CD\u5B9A\u5411\u5230\u4E86\u4E0D\u53D7\u4FE1\u4EFB\u7684\u5730\u5740");
    error.code = "REMOTE_CONTROL_INSTALL_URL_INVALID";
    throw error;
  }
  if (!script || script.length > 2 * 1024 * 1024 || !/codex/i.test(script)) {
    const error = new Error("\u5B98\u65B9\u5B89\u88C5\u811A\u672C\u5185\u5BB9\u65E0\u6548");
    error.code = "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID";
    throw error;
  }
  const env = { ...process.env, HOME: home, CI: "1", TERM: "dumb", CODEX_NON_INTERACTIVE: "true", ...proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, ALL_PROXY: proxyUrl } : {} };
  const child = spawnImpl("/bin/sh", ["-s"], { cwd: home, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const append = (chunk) => {
    output = `${output}${chunk}`.slice(-8e3);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  try {
    child.stdin.end(script);
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0) {
      const error = new Error(`\u5B98\u65B9 standalone \u5B89\u88C5\u5931\u8D25\uFF1A${bounded(output)}`);
      error.code = result.signal ? "REMOTE_CONTROL_INSTALL_TIMEOUT" : "REMOTE_CONTROL_INSTALL_FAILED";
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
  if (!await fs12.access(target, fs12.constants.X_OK).then(() => true, () => false)) {
    const error = new Error("\u5B89\u88C5\u811A\u672C\u5DF2\u5B8C\u6210\uFF0C\u4F46\u672A\u627E\u5230 standalone Codex \u53EF\u6267\u884C\u6587\u4EF6");
    error.code = "REMOTE_CONTROL_INSTALL_INCOMPLETE";
    throw error;
  }
  return { installed: true, alreadyPresent: false, executable: target };
}

// server/connector-service.js
var ConnectorService = class _ConnectorService extends EventEmitter5 {
  #unsupportedNotificationMethods = /* @__PURE__ */ new Set();
  static MAX_THREAD_ACCESS_ENTRIES = 1e3;
  static MAX_PENDING_EVENTS = 256;
  constructor(options = {}) {
    super();
    this.logger = options.logger || new Logger();
    this.configStore = options.configStore || new ConfigStore({ configDir: options.configDir, logger: this.logger });
    this.instanceLock = options.instanceLock || null;
    this.appServer = options.appServer || new AppServerClient(this.configStore, this.logger);
    this.remoteControl = options.remoteControl || {
      inspect: () => inspectRemoteControl(),
      start: () => runRemoteControl("start"),
      stop: () => runRemoteControl("stop"),
      pair: () => runRemoteControl("pair"),
      install: () => installOfficialStandalone()
    };
    this.remoteControlInstalling = false;
    this.relay = options.relay || new RelayClient(this.configStore, this.logger);
    this.eventBuffer = new EventBuffer(options.eventBufferSize || 1e3, {
      maxBytes: options.eventBufferMaxBytes,
      maxEventBytes: options.eventMaxBytes
    });
    this.dashboard = null;
    this.startedAt = null;
    this.starting = null;
    this.autoConnectStarted = false;
    this.eventQueue = Promise.resolve();
    this.#pendingEvents = [];
    this.#eventWorker = null;
    this.#eventQueueOverflowed = false;
    this.threadAccess = /* @__PURE__ */ new Map();
    this.eventStreamId = randomUUID4();
    this.router = new CommandRouter({
      configStore: this.configStore,
      appServer: this.appServer,
      service: this,
      logger: this.logger
    });
    this.#wireEvents();
  }
  async start() {
    if (this.startedAt) return this.status();
    if (!this.starting) {
      this.starting = (async () => {
        await this.configStore.load();
        this.instanceLock ||= new InstanceLock(this.configStore.configDir);
        this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.logger.info("connector", "Codex Relay Connector \u5DF2\u542F\u52A8");
        await this.router.journal.prune();
      })();
    }
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
    if (this.configStore.get().relay.autoConnect && !this.autoConnectStarted) {
      this.autoConnectStarted = true;
      this.connect().catch((error) => this.logger.error("connector", "\u81EA\u52A8\u8FDE\u63A5\u5931\u8D25", { message: error.message }));
    }
    return this.status();
  }
  attachDashboard(dashboard) {
    this.dashboard = dashboard;
  }
  async stop() {
    this.#pendingEvents.length = 0;
    this.#eventQueueOverflowed = false;
    await this.disconnect("connector stopped");
    await this.appServer.stop();
    await this.dashboard?.stop();
    this.startedAt = null;
    this.autoConnectStarted = false;
  }
  async connect() {
    await this.start();
    const config = this.configStore.get();
    const credential = await this.configStore.relayCredential();
    await this.instanceLock.acquire();
    try {
      if (config.codex.autoStartAppServer) await this.appServer.start();
      return await this.relay.connect(credential);
    } catch (error) {
      if (this.relay.state !== "reconnecting") await this.instanceLock.release();
      throw error;
    }
  }
  async disconnect(reason = "manual disconnect") {
    await this.relay.disconnect(reason);
    await this.instanceLock?.release();
    return this.status();
  }
  // Restart the App Server process owned by this plugin.
  async restartAppServerConnection() {
    await this.appServer.stop();
    await this.appServer.start();
    this.emit("status", await this.status());
    return this.status();
  }
  async reconnectRelay() {
    await this.disconnect("dashboard reconnect");
    return this.connect();
  }
  async testConnection() {
    await this.start();
    return this.relay.test(await this.configStore.relayCredential());
  }
  async remoteControlStatus() {
    return this.remoteControl.inspect();
  }
  async remoteControlStart() {
    const result = await this.remoteControl.start();
    this.emit("status", await this.status());
    return result;
  }
  async remoteControlStop() {
    const result = await this.remoteControl.stop();
    this.emit("status", await this.status());
    return result;
  }
  async remoteControlPair() {
    return this.remoteControl.pair();
  }
  async remoteControlInstall() {
    if (this.remoteControlInstalling) {
      const error = new RelayError("REMOTE_CONTROL_INSTALL_BUSY", "\u5B98\u65B9 standalone \u6B63\u5728\u5B89\u88C5\uFF0C\u8BF7\u7A0D\u5019");
      throw error;
    }
    this.remoteControlInstalling = true;
    try {
      return await this.remoteControl.install();
    } finally {
      this.remoteControlInstalling = false;
    }
  }
  async updateConfig(patch, credentialPatch) {
    const previous = this.configStore.get();
    this.configStore.preview?.(patch);
    const wasConnected = ["connected", "connecting", "authenticating", "reconnecting"].includes(this.relay.state);
    if (wasConnected) await this.disconnect("configuration changed");
    const config = await this.configStore.update(patch, credentialPatch);
    const backendChanged = ["executable", "defaultWorkingDirectory", "autoStartAppServer", "appServerTransport", "appServerSocket"].some((key) => previous.codex[key] !== config.codex[key]);
    const accessChanged = JSON.stringify([previous.allowedProjects, previous.permissions, previous.readOnly]) !== JSON.stringify([config.allowedProjects, config.permissions, config.readOnly]);
    if (backendChanged || accessChanged) {
      await this.appServer.stop();
      this.#pendingEvents.length = 0;
      await this.eventQueue.catch(() => {
      });
      this.#resetEventStream();
      this.router = new CommandRouter({ configStore: this.configStore, appServer: this.appServer, service: this, logger: this.logger });
    }
    this.threadAccess.clear();
    if (wasConnected || config.relay.autoConnect) await this.connect();
    this.emit("status", await this.status());
    return config;
  }
  #rememberThreadAccess(threadId, allowed) {
    const id = String(threadId || "").trim();
    if (!id) return;
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { allowed: Boolean(allowed), touchedAt: Date.now() });
    while (this.threadAccess.size > _ConnectorService.MAX_THREAD_ACCESS_ENTRIES) {
      this.threadAccess.delete(this.threadAccess.keys().next().value);
    }
  }
  #pendingEvents;
  #eventWorker;
  #eventQueueOverflowed;
  #resetEventStream() {
    this.eventBuffer.invalidateReplay();
    this.eventStreamId = randomUUID4();
    this.#pendingEvents.length = 0;
  }
  #enqueueEvent(event, params = {}) {
    const context = extractContext(params);
    const isDelta = event.type.endsWith(".delta") || event.type === "tool.output";
    if (this.#pendingEvents.length >= _ConnectorService.MAX_PENDING_EVENTS) {
      this.#eventQueueOverflowed = true;
      this.#resetEventStream();
    }
    this.#pendingEvents.push({ event, params, isDelta, threadId: context.threadId, eventStreamId: this.eventStreamId });
    if (!this.#eventWorker) {
      this.#eventWorker = this.#drainEvents();
      this.eventQueue = this.#eventWorker.finally(() => {
        this.#eventWorker = null;
      });
    }
  }
  async #drainEvents() {
    while (this.#pendingEvents.length) {
      const entry = this.#pendingEvents.shift();
      try {
        await this.#forwardEvent(entry.event, entry.params, entry.eventStreamId);
      } catch (error) {
        this.#resetEventStream();
        this.logger.warn("connector", "Codex \u4E8B\u4EF6\u8F6C\u53D1\u5931\u8D25", { message: error.message });
      }
    }
  }
  #readThreadAccess(threadId) {
    const id = String(threadId || "").trim();
    const entry = this.threadAccess.get(id);
    if (!entry) return void 0;
    if (Date.now() - entry.touchedAt > 15 * 60 * 1e3) {
      this.threadAccess.delete(id);
      return void 0;
    }
    this.threadAccess.delete(id);
    this.threadAccess.set(id, { ...entry, touchedAt: Date.now() });
    return entry.allowed;
  }
  async status() {
    const config = await this.configStore.publicConfig();
    return {
      connector: {
        state: this.startedAt ? "running" : "stopped",
        startedAt: this.startedAt
      },
      relay: this.relay.status(),
      appServer: this.appServer.status(),
      capabilities: { imageAttachments: !config.readOnly && config.permissions.sendMessages ? IMAGE_INPUT_LIMITS : null },
      eventStreamId: this.eventStreamId,
      space: {
        spaceId: relaySpaceId(config.relay),
        endpointId: relayEndpointId(config.relay),
        endpointType: "bridge",
        deviceId: config.relay.deviceId,
        deviceName: config.relay.deviceName
      },
      security: {
        readOnly: config.readOnly,
        allowedProjects: config.allowedProjects.length,
        remoteApprovalEnabled: config.permissions.respondToApprovals,
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint,
        endpointPublicKey: config.relay.endpointPublicKey
      },
      protocol: {
        version: 1,
        latestSequence: this.eventBuffer.latestSequence(),
        bufferedEvents: this.eventBuffer.size,
        bufferedBytes: this.eventBuffer.bytes,
        threadAccessEntries: this.threadAccess.size,
        pendingEventQueue: this.#pendingEvents.length,
        eventQueueOverflowed: this.#eventQueueOverflowed
      },
      dashboard: this.dashboard?.status() || { state: "stopped", url: null }
    };
  }
  async diagnostics() {
    const checks = [];
    try {
      checks.push({ name: "codex", ok: true, ...await this.appServer.checkAvailability() });
    } catch (error) {
      checks.push({ name: "codex", ok: false, error: error.message });
    }
    const config = await this.configStore.publicConfig();
    checks.push({
      name: "configuration",
      ok: Boolean(config.relay.url && relaySpaceId(config.relay) && relayEndpointId(config.relay) && config.relay.credentialConfigured),
      details: {
        relayUrlConfigured: Boolean(config.relay.url),
        spaceConfigured: Boolean(relaySpaceId(config.relay)),
        endpointConfigured: Boolean(relayEndpointId(config.relay)),
        endpointId: relayEndpointId(config.relay),
        tokenConfigured: config.relay.tokenConfigured,
        credentialConfigured: config.relay.credentialConfigured,
        endpointGrantConfigured: config.relay.endpointGrantConfigured,
        tokenExpiresAt: config.relay.tokenExpiresAt,
        grantExpiresAt: config.relay.grantExpiresAt,
        tokenEndpoint: config.relay.tokenEndpoint
      }
    });
    return { status: await this.status(), checks, logs: this.logger.list(50) };
  }
  async prepareResourceImages(value) {
    const config = this.configStore.get();
    return prepareEventImages(value, async ({ mime, bytes }) => {
      try {
        return await this.relay.uploadResource({ mime, data: bytes });
      } catch (error) {
        this.logger.warn("resource", "\u56FE\u7247\u8D44\u6E90\u4E0A\u4F20\u5931\u8D25\uFF0C\u4FDD\u7559\u5185\u8054\u56DE\u9000", { message: error.message });
        return null;
      }
    }, /* @__PURE__ */ new WeakSet(), {
      allowedRoots: [
        this.router?.images?.directory,
        ...Array.isArray(config.allowedProjects) ? config.allowedProjects : [],
        config.codex?.defaultWorkingDirectory
      ]
    });
  }
  async syncAfter(lastSequence, eventStreamId) {
    if (lastSequence == null) return this.#snapshotSync();
    if (eventStreamId && eventStreamId !== this.eventStreamId) return this.#snapshotSync();
    if (this.#eventQueueOverflowed) {
      this.#eventQueueOverflowed = false;
      return this.#snapshotSync();
    }
    const events = this.eventBuffer.after(lastSequence);
    const requestedSequence = Number(lastSequence || 0);
    const latestSequence = this.eventBuffer.latestSequence();
    if (events !== null && requestedSequence <= latestSequence && !(requestedSequence === 0 && events.length === 0 && !eventStreamId)) {
      return { mode: "events", events, latestSequence: this.eventBuffer.latestSequence(), eventStreamId: this.eventStreamId };
    }
    return this.#snapshotSync();
  }
  async #snapshotSync(attempt = 0) {
    const latestSequence = this.eventBuffer.latestSequence();
    const eventStreamId = this.eventStreamId;
    await this.appServer.start();
    const allowedProjects = this.configStore.get().allowedProjects;
    const threads = filterThreadList(await this.appServer.listThreads({ limit: 100 }), allowedProjects);
    let projects = { data: [], nextCursor: null };
    if (typeof this.appServer.listProjects === "function") {
      try {
        projects = filterProjectList(
          await this.appServer.listProjects({ limit: 100 }),
          allowedProjects
        );
      } catch (error) {
        this.logger.warn("connector", "\u9879\u76EE\u5217\u8868\u4E0D\u53EF\u7528\uFF0C\u4F7F\u7528\u4EFB\u52A1\u76EE\u5F55\u56DE\u9000", {
          message: error.message
        });
      }
    }
    const status = await this.status();
    if (eventStreamId !== this.eventStreamId) {
      if (attempt < 2) return this.#snapshotSync(attempt + 1);
      throw new RelayError("APP_SERVER_UNAVAILABLE", "\u540E\u7AEF\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u4EFB\u52A1");
    }
    return {
      mode: "snapshot",
      status,
      threads,
      projects,
      latestSequence,
      eventStreamId
    };
  }
  #wireEvents() {
    this.relay.on("command", async (message) => {
      const connectionId = this.relay.connectionId;
      const response = await this.router.handle(message);
      if (connectionId !== this.relay.connectionId) return;
      if (!this.relay.send(response)) {
        this.logger.warn("connector", "Relay \u672A\u63A5\u53D7\u5B9A\u5411\u547D\u4EE4\u54CD\u5E94\uFF0C\u6D88\u606F\u672A\u53D1\u9001", {
          requestId: message?.requestId,
          targetDeviceId: response?.targetDeviceId
        });
      }
    });
    this.relay.on("connected", async () => {
      this.relay.send({
        version: 1,
        type: "host.snapshot",
        spaceId: relaySpaceId(this.configStore.get().relay),
        deviceId: this.configStore.get().relay.deviceId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: await this.status()
      });
    });
    this.relay.on("status", (status) => this.emit("status", status));
    this.relay.on("disconnected", () => {
      this.instanceLock?.release().catch((error) => {
        this.logger.warn("connector", "\u91CA\u653E Connector \u5B9E\u4F8B\u9501\u5931\u8D25", { message: error.message });
      });
    });
    this.appServer.on("status", (status) => {
      this.emit("status", status);
      if (status.state === "reconnecting") this.#resetEventStream();
      if (this.relay.state === "connected") {
        this.status().then((current) => this.relay.send({
          version: 1,
          type: "host.snapshot",
          spaceId: relaySpaceId(this.configStore.get().relay),
          deviceId: this.configStore.get().relay.deviceId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          status: current
        })).catch((error) => this.logger.warn("connector", "\u540E\u7AEF\u8FDE\u63A5\u72B6\u6001\u540C\u6B65\u5931\u8D25", { message: error.message }));
      }
    });
    this.appServer.on("notification", (method, params) => {
      this.#forwardNotificationAfterReconciliation(method, params).catch((error) => {
        this.logger.warn("app-server", "\u901A\u77E5\u72B6\u6001\u6821\u9A8C\u5931\u8D25\uFF0C\u7EE7\u7EED\u8F6C\u53D1\u539F\u59CB\u901A\u77E5", {
          method,
          message: error.message
        });
        this.#forwardNormalizedNotification(method, params);
      });
    });
    this.appServer.on("approval", (approval) => {
      this.#enqueueEvent({ type: "approval.requested", ...approval }, approval.params);
    });
    this.appServer.on("interactionResolved", (interaction) => {
      this.#enqueueEvent({ type: "interaction.resolved", ...interaction }, interaction.params);
    });
  }
  async #forwardNotificationAfterReconciliation(method, params) {
    const threadId = params?.threadId || params?.thread?.id || params?.turn?.threadId;
    const terminalMethod = method === "turn/completed";
    const statusValue = params?.status || params?.thread?.status;
    const statusType = statusValue?.type || statusValue?.state || statusValue;
    const terminalStatus = typeof statusType === "string" && [
      "interrupted",
      "aborted",
      "cancelled",
      "canceled",
      "failed",
      "error"
    ].includes(statusType.trim().toLowerCase());
    const statusMethod = method === "thread/status/changed" && terminalStatus;
    if ((terminalMethod || statusMethod) && threadId) {
      const snapshot = await this.appServer.readThreadStatus(threadId, { ensureResumed: false });
      const thread = snapshot?.thread || snapshot;
      const currentTurn = thread?.currentTurn || thread?.current_turn || thread?.turn;
      const currentStatusValue = currentTurn?.status || thread?.status;
      const currentStatus = currentStatusValue?.type || currentStatusValue?.state || currentStatusValue;
      const currentIsActive = typeof currentStatus === "string" && [
        "active",
        "running",
        "inprogress",
        "in_progress",
        "processing",
        "queued",
        "starting"
      ].includes(currentStatus.trim().toLowerCase());
      const eventTurnId = params?.turnId || params?.turn?.id;
      const currentTurnId = currentTurn?.id || thread?.currentTurnId || thread?.current_turn_id;
      const staleTerminal = currentIsActive;
      if (staleTerminal) {
        this.logger.info("app-server", "\u5FFD\u7565\u8986\u76D6\u8FDB\u884C\u4E2D\u4EFB\u52A1\u7684\u65E7\u7EC8\u6B62\u901A\u77E5", {
          method,
          threadId,
          eventTurnId,
          currentTurnId
        });
        return;
      }
    }
    this.#forwardNormalizedNotification(method, params);
  }
  #forwardNormalizedNotification(method, params) {
    const event = normalizeCodexNotification(method, params);
    if (!event) {
      if (!this.#unsupportedNotificationMethods.has(method)) {
        this.#unsupportedNotificationMethods.add(method);
        this.logger.warn("app-server", "\u5FFD\u7565\u4E0D\u652F\u6301\u7684 Codex \u901A\u77E5", { method });
      }
      return;
    }
    this.#enqueueEvent(event, params);
  }
  async #forwardEvent(event, params = {}, eventStreamId = this.eventStreamId) {
    if (!await this.#isEventAllowed(params)) return;
    const config = this.configStore.get();
    const preparedEvent = await this.prepareResourceImages(event);
    if (eventStreamId !== this.eventStreamId) return;
    const envelope = eventEnvelope(config, this.eventBuffer, preparedEvent, extractContext(params));
    envelope.eventStreamId = this.eventStreamId;
    const sent = this.relay.send(envelope);
    if (!sent) {
      this.logger.warn("connector", "Relay \u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u4E8B\u4EF6\u5DF2\u4FDD\u7559\u5F85\u540C\u6B65", {
        eventId: envelope.eventId,
        sequence: envelope.sequence,
        type: event.type
      });
    }
    this.emit("event", envelope);
  }
  async #isEventAllowed(params) {
    const allowedProjects = this.configStore.get().allowedProjects;
    if (!allowedProjects.length) return true;
    const context = extractContext(params);
    const cwd = params.cwd || params.thread?.cwd;
    if (cwd) {
      const allowed = Boolean(safeProjectPath(cwd, allowedProjects));
      if (context.threadId) this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    }
    if (!context.threadId) return false;
    const cached = this.#readThreadAccess(context.threadId);
    if (cached !== void 0) return cached;
    try {
      const result = await this.appServer.readThreadStatus(context.threadId, { ensureResumed: false });
      const allowed = Boolean(result?.thread?.cwd && safeProjectPath(result.thread.cwd, allowedProjects));
      this.#rememberThreadAccess(context.threadId, allowed);
      return allowed;
    } catch (error) {
      this.logger.warn("connector", "\u65E0\u6CD5\u786E\u8BA4\u4E8B\u4EF6\u6240\u5C5E\u9879\u76EE\uFF0C\u5DF2\u505C\u6B62\u8FDC\u7A0B\u8F6C\u53D1", { threadId: context.threadId, message: error.message });
      return false;
    }
  }
};

// server/dashboard-server.js
import crypto6 from "node:crypto";
import fs14 from "node:fs/promises";
import http from "node:http";
import path15 from "node:path";

// server/environment-service.js
import fs13 from "node:fs/promises";
import { constants } from "node:fs";
import os8 from "node:os";
import path14 from "node:path";
import { execFile as execFile4 } from "node:child_process";
import { promisify as promisify4 } from "node:util";
var exec2 = promisify4(execFile4);
var CACHE_MS = 15e3;
var STALE_MS = 6e4;
var clean = (value) => typeof value === "string" ? redact(value).slice(0, 600) : null;
var samePath = (a, b) => typeof a === "string" && typeof b === "string" && path14.resolve(a) === path14.resolve(b);
async function inspectExecutable(configured, options = {}) {
  const env = options.env || process.env;
  const run = options.exec || exec2;
  const platform = options.platform || process.platform;
  const candidates = [];
  const add = (value) => {
    if (value && path14.isAbsolute(value) && !candidates.includes(value)) candidates.push(value);
  };
  if (path14.isAbsolute(configured || "")) add(configured);
  else if (configured && !/[\\/]/.test(configured)) {
    for (const directory of (env.PATH || "").split(path14.delimiter)) if (path14.isAbsolute(directory)) add(path14.join(directory, configured));
  }
  const configuredCandidates = [...candidates];
  if (path14.basename(env.CODEX_CLI_PATH || "") === "codex") add(env.CODEX_CLI_PATH);
  if (env.CODEX_ELECTRON_RESOURCES_PATH) add(path14.join(env.CODEX_ELECTRON_RESOURCES_PATH, "codex"));
  if (platform === "darwin") {
    add("/Applications/ChatGPT.app/Contents/Resources/codex");
    add("/Applications/Codex.app/Contents/Resources/codex");
  }
  let candidate = null;
  let configuredValid = false;
  for (const file of candidates) {
    try {
      await fs13.access(file, constants.X_OK);
      const { stdout } = await run(file, ["--version"], { timeout: 2500, maxBuffer: 4096, env });
      const version = stdout.trim();
      if (!/^codex-cli\s+[^\s]+$/.test(version)) continue;
      candidate = { path: file, version };
      configuredValid = configuredCandidates.includes(file);
      break;
    } catch {
    }
  }
  return {
    state: configuredValid ? "ok" : "error",
    configured: configured || "codex",
    resolved: configuredValid ? candidate?.path : null,
    version: configuredValid ? candidate?.version : null,
    candidate,
    needsRepair: Boolean(candidate && (!configuredValid || configured !== candidate.path)),
    message: configuredValid ? "Codex \u7A0B\u5E8F\u9A8C\u8BC1\u901A\u8FC7" : candidate ? "\u5F53\u524D\u547D\u4EE4\u4E0D\u53EF\u7528\uFF0C\u5DF2\u627E\u5230\u53EF\u7528\u7684 Codex \u7A0B\u5E8F" : "\u672A\u627E\u5230\u53EF\u7528\u7684 Codex \u7A0B\u5E8F\uFF0C\u8BF7\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u5B89\u88C5\u8DEF\u5F84"
  };
}
function processConflicts(output, allowedPids = []) {
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || allowedPids.includes(Number(match[1]))) return [];
    const command = match[3];
    if (/^\/.*\.app\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:$|\s+--)/.test(command)) return [{ pid: Number(match[1]), kind: "desktop" }];
    if (/(?:^|\/)codex\s+(?:.*?\s)?app-server(?:\s|$)/.test(command) && !/app-server\s+(?:proxy|daemon|generate-)/.test(command)) return [{ pid: Number(match[1]), kind: "backend" }];
    if (/\bnode\s+.*\/(?:agent-cli|mcp-server|dashboard-cli)\.js(?:\s|$)/.test(command)) return [{ pid: Number(match[1]), kind: "relay" }];
    return [];
  });
}
var EnvironmentService = class {
  constructor(service, options = {}) {
    this.service = service;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exec = options.exec || exec2;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.codexHome = this.env.CODEX_HOME || path14.join(os8.homedir(), ".codex");
    this.cache = null;
    this.pending = null;
    this.repairing = false;
    this.remoteControl = options.remoteControl || service.remoteControl || null;
  }
  async inspect(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && Date.now() - this.cache.time < CACHE_MS) return this.cache.value;
    this.pending = this.collect();
    try {
      const value = await this.pending;
      this.cache = { time: Date.now(), value };
      return value;
    } finally {
      this.pending = null;
    }
  }
  async collect() {
    const config = this.service.configStore.get();
    const configDir = this.service.configStore.configDir;
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    const [executable, processes, installed, remoteControl] = await Promise.all([
      inspectExecutable(config.codex.executable, { env: this.env, platform: this.platform, exec: this.exec }),
      this.inspectProcesses(),
      fs13.readFile(path14.join(this.pluginRoot, ".codex-plugin/plugin.json"), "utf8").then(JSON.parse).catch(() => null),
      this.remoteControl?.inspect ? Promise.resolve().then(() => this.remoteControl.inspect()).catch((error) => ({ checkedAt, official: { state: "error", installed: false, reason: clean(error.message) }, bridge: { state: "blocked", attachable: false, endpoint: null, reason: "Remote Control \u72B6\u6001\u68C0\u67E5\u5931\u8D25" } })) : Promise.resolve(null)
    ]);
    const status = await this.service.status();
    const runningVersion = "1.0.0+codex.20260913033153";
    const runningBuild = "1.0.0+codex.20260913033153:1789270327154";
    const diskBundle = runningBuild ? await fs13.readFile(path14.join(this.pluginRoot, "server/agent-cli.js"), "utf8").catch(() => null) : null;
    const needsRestart = runningBuild && diskBundle !== null ? !diskBundle.includes(JSON.stringify(runningBuild)) : installed?.version && runningVersion !== "development" ? installed.version !== runningVersion : null;
    const owned = processes.items.filter((p) => p.scope === "same" && (p.kind === "backend" || p.kind === "relay"));
    const repairAllowed = ["stopped", "error"].includes(status.appServer?.state) && executable.needsRepair;
    return {
      checkedAt,
      staleAfterMs: STALE_MS,
      platform: this.platform,
      plugin: { installedVersion: installed?.version || null, runningVersion, needsRestart, pid: process.pid, startedAt: status.connector?.startedAt, root: this.pluginRoot },
      desktop: { version: null, running: processes.state === "ok" ? processes.items.some((p) => p.kind === "desktop" && p.scope === "same") : null },
      executable,
      processes,
      backend: { mode: "managed", state: status.appServer?.state || "unknown", pid: status.appServer?.pid ?? null, ownsProcess: status.appServer?.ownsProcess ?? null, endpoint: null, error: clean(status.appServer?.lastError) },
      desktopBackend: { state: "unavailable", pid: null, transport: null, endpoint: null, attachable: false, reason: "\u684C\u9762\u7248 App Server \u4E0E Relay \u72EC\u7ACB\u8FD0\u884C\uFF1BRelay \u4F7F\u7528\u81EA\u5DF1\u7684\u6258\u7BA1\u8FDB\u7A0B" },
      remoteControl: remoteControl || { checkedAt, official: { state: "unavailable", installed: false, reason: "\u672A\u68C0\u67E5" }, bridge: { state: "blocked", endpoint: null, attachable: false, reason: "\u672A\u68C0\u67E5" } },
      relay: { state: status.relay?.state || "unknown", lastHeartbeat: status.relay?.lastHeartbeat || null, reconnectAttempt: status.relay?.reconnectAttempt || 0 },
      sharing: { state: "managed", label: "\u63D2\u4EF6\u6258\u7BA1\u5DF2\u542F\u7528", message: "Codex App Server \u7531\u63D2\u4EF6\u5728\u672C\u673A\u7BA1\u7406\uFF0CRelay \u8D1F\u8D23\u8BA4\u8BC1\u3001\u5916\u7F51\u6865\u63A5\u548C\u534F\u8BAE\u8F6C\u53D1\u3002" },
      desktopTools: { state: "unchecked", label: "\u5F53\u524D\u8FDE\u63A5\u672A\u9A8C\u8BC1", message: "\u684C\u9762\u5DE5\u5177\u7531 Codex App Server \u672C\u5730\u914D\u7F6E\u7BA1\u7406\u3002" },
      paths: { configDir, codexHome: this.codexHome },
      actions: { repair: { enabled: Boolean(repairAllowed), candidate: executable.candidate?.path || null, reason: !executable.candidate ? "\u5C1A\u672A\u627E\u5230\u53EF\u7528\u7A0B\u5E8F\uFF0C\u8BF7\u5148\u5B89\u88C5 Codex \u6216\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u8DEF\u5F84" : !executable.needsRepair ? "\u5F53\u524D\u5DF2\u4F7F\u7528\u9A8C\u8BC1\u8FC7\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u65E0\u9700\u4FEE\u590D" : !repairAllowed ? "\u540E\u7AEF\u6B63\u5728\u4F7F\u7528\u4E2D\uFF0C\u8BF7\u5728\u505C\u6B62\u6267\u884C\u540E\u901A\u8FC7\u9AD8\u7EA7\u8BBE\u7F6E\u4FEE\u6539\u8DEF\u5F84" : "\u9A8C\u8BC1\u5019\u9009\u8DEF\u5F84\u540E\u4FDD\u5B58\uFF1B\u81EA\u52A8\u8FDE\u63A5\u5DF2\u5F00\u542F\u65F6\u4F1A\u5C1D\u8BD5\u6062\u590D\u8FDE\u63A5" } }
    };
  }
  async inspectProcesses() {
    if (this.platform === "win32") return { state: "unsupported", items: [], message: "\u5F53\u524D\u5E73\u53F0\u6682\u4E0D\u652F\u6301\u8FDB\u7A0B\u5360\u7528\u68C0\u67E5" };
    try {
      const { stdout } = await this.exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3e3, maxBuffer: 8 * 1024 * 1024 });
      const items = await Promise.all(processConflicts(stdout).map(async (item) => {
        const line = stdout.split("\n").find((line2) => Number(line2.trim().split(/\s+/)[0]) === item.pid) || "";
        const command = line.trim().replace(/^\d+\s+\d+\s+/, "");
        const application = item.kind === "desktop" ? "Codex \u684C\u9762" : item.kind === "relay" ? "Relay \u63D2\u4EF6" : "Codex App Server";
        const details = await this.exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="], { timeout: 2e3, maxBuffer: 1024 * 1024 }).then((r) => r.stdout, () => "");
        const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
        const selected = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`))?.[1];
        const defaultDir = path14.join(os8.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
        const target = item.kind === "relay" ? this.service.configStore.configDir : this.codexHome;
        return { ...item, application, scope: !details ? "unknown" : samePath(selected || defaultDir, target) ? "same" : "other", taskState: "unknown" };
      }));
      return { state: "ok", items, message: "\u4EC5\u68C0\u67E5\u8FDB\u7A0B\u548C\u6570\u636E\u76EE\u5F55\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u7ED3\u675F\u8FD9\u4E9B\u8FDB\u7A0B\u3002" };
    } catch {
      return { state: "error", items: [], message: "\u8FDB\u7A0B\u68C0\u67E5\u5931\u8D25\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u6CA1\u6709\u5360\u7528" };
    }
  }
  async repairExecutable(expected = {}) {
    if (this.repairing) throw new RelayError("ENVIRONMENT_BUSY", "\u6B63\u5728\u4FEE\u590D\u6267\u884C\u8DEF\u5F84\uFF0C\u8BF7\u7A0D\u5019");
    this.repairing = true;
    try {
      const current = await this.inspect(true);
      if (!current.actions.repair.enabled) throw new RelayError("REPAIR_NOT_AVAILABLE", current.actions.repair.reason);
      if (expected.configured !== current.executable.configured || expected.candidate !== current.actions.repair.candidate) throw new RelayError("ENVIRONMENT_CHANGED", "\u73AF\u5883\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u518D\u4FEE\u590D");
      const backend = this.service.appServer.status();
      if (!["stopped", "error"].includes(backend.state) || this.service.configStore.get().codex.executable !== expected.configured) throw new RelayError("ENVIRONMENT_CHANGED", "\u540E\u7AEF\u6216\u914D\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
      let connectionError = null;
      try {
        await this.service.updateConfig({ codex: { executable: current.actions.repair.candidate } });
      } catch (error) {
        if (this.service.configStore.get().codex.executable !== current.actions.repair.candidate) throw error;
        connectionError = "\u8DEF\u5F84\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u8FDE\u63A5\u5C1A\u672A\u6062\u590D\uFF1B\u8BF7\u67E5\u770B\u540E\u7AEF\u4E0E Relay \u72B6\u6001";
      }
      this.cache = null;
      return { saved: true, executable: current.actions.repair.candidate, connectionError, environment: await this.inspect(true) };
    } finally {
      this.repairing = false;
    }
  }
};

// server/dashboard-server.js
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};
var DASHBOARD_PORT = 3210;
var DASHBOARD_COOKIE = "codex_relay_session";
var DASHBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
function configuredDashboardPort() {
  const raw = process.env.CODEX_RELAY_DASHBOARD_PORT?.trim();
  if (!raw) return DASHBOARD_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("CODEX_RELAY_DASHBOARD_PORT \u5FC5\u987B\u662F 0 \u5230 65535 \u4E4B\u95F4\u7684\u6574\u6570");
  }
  return port;
}
var DashboardServer = class {
  #server = null;
  #accessKey = crypto6.randomBytes(24).toString("base64url");
  #sessionTokenHashes = [];
  #port = null;
  #listenPort;
  #sessionFile;
  constructor(service, logger, options = {}) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path15.join(PLUGIN_ROOT, "ui");
    this.#listenPort = options.port ?? configuredDashboardPort();
    this.#sessionFile = path15.join(service.configStore.configDir, "dashboard-session.json");
    this.environment = options.environment || new EnvironmentService(service);
  }
  async start() {
    if (this.#server) return this.url();
    await this.#loadOrCreateSession();
    this.#server = http.createServer((request, response) => {
      this.#handle(request, response).catch((error) => {
        this.logger.error("dashboard", "\u63A7\u5236\u53F0\u8BF7\u6C42\u5931\u8D25", { message: error.message });
        this.#json(response, 500, { error: { code: "INTERNAL_ERROR", message: error.message } });
      });
    });
    try {
      await new Promise((resolve, reject) => {
        this.#server.once("error", reject);
        this.#server.listen(this.#listenPort, "127.0.0.1", resolve);
      });
    } catch (error) {
      if (error.code !== "EADDRINUSE" || this.#listenPort === 0) {
        this.#server = null;
        throw error;
      }
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
      this.#listenPort = 0;
      return this.start();
    }
    this.#port = this.#server.address().port;
    this.logger.info("dashboard", "\u672C\u5730\u914D\u7F6E\u63A7\u5236\u53F0\u5DF2\u542F\u52A8", { port: this.#port });
    return this.url();
  }
  async stop() {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = null;
    await new Promise((resolve) => server.close(resolve));
    this.#port = null;
  }
  url() {
    return this.#port ? `http://127.0.0.1:${this.#port}/#key=${this.#accessKey}` : null;
  }
  connectionInfo() {
    return this.#port ? { port: this.#port, accessKey: this.#accessKey, url: this.url() } : null;
  }
  status() {
    return { state: this.#server ? "running" : "stopped" };
  }
  async #handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    this.#securityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      const auth = this.#authorized(request);
      if (!auth.ok) return this.#json(response, 401, { error: { code: "UNAUTHORIZED", message: "\u63A7\u5236\u53F0\u8BBF\u95EE\u5BC6\u94A5\u65E0\u6548" } });
      if (auth.viaBootstrap) this.#setSessionCookie(response);
      return this.#api(request, response, url);
    }
    if (!["GET", "HEAD"].includes(request.method)) return this.#json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "\u65B9\u6CD5\u4E0D\u5141\u8BB8" } });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path15.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path15.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
    try {
      const body = await fs14.readFile(file);
      if (!this.#authorized(request).ok) this.#setSessionCookie(response);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path15.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      if (request.method === "HEAD") return response.end();
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "\u8D44\u6E90\u4E0D\u5B58\u5728" } });
      throw error;
    }
  }
  async #api(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/environment") {
      return this.#json(response, 200, await this.environment.inspect());
    }
    if (request.method === "GET" && url.pathname === "/api/remote-control") {
      return this.#json(response, 200, await this.service.remoteControlStatus());
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/install") {
      try {
        return this.#json(response, 200, await this.service.remoteControlInstall());
      } catch (error) {
        const known = ["REMOTE_CONTROL_INSTALL_BUSY", "REMOTE_CONTROL_INSTALL_URL_INVALID", "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED", "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID", "REMOTE_CONTROL_INSTALL_FAILED", "REMOTE_CONTROL_INSTALL_TIMEOUT", "REMOTE_CONTROL_INSTALL_INCOMPLETE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "REMOTE_CONTROL_INSTALL_FAILED", message: known ? error.message : "\u5B98\u65B9 standalone \u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/start") {
      try {
        return this.#json(response, 200, await this.service.remoteControlStart());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/stop") {
      try {
        return this.#json(response, 200, await this.service.remoteControlStop());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/pair") {
      try {
        return this.#json(response, 200, await this.service.remoteControlPair());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/environment/check") {
      return this.#json(response, 200, await this.environment.inspect(true));
    }
    if (request.method === "POST" && url.pathname === "/api/environment/repair-executable") {
      try {
        const body = await this.#body(request);
        const result = await this.environment.repairExecutable({ configured: body.configured, candidate: body.candidate });
        return this.#json(response, 200, result);
      } catch (error) {
        const known = ["ENVIRONMENT_BUSY", "ENVIRONMENT_CHANGED", "REPAIR_NOT_AVAILABLE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "ENVIRONMENT_REPAIR_FAILED", message: known ? error.message : "\u6267\u884C\u8DEF\u5F84\u4FEE\u590D\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u73AF\u5883" } });
      }
    }
    if (request.method === "GET" && url.pathname === "/api/config") {
      return this.#json(response, 200, await this.service.configStore.publicConfig({ includeToken: true }));
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return this.#json(response, 200, await this.service.status());
    }
    if (request.method === "GET" && url.pathname === "/api/logs") {
      return this.#json(response, 200, { logs: this.service.logger.list(Number(url.searchParams.get("limit") || 100)) });
    }
    if (request.method === "GET" && url.pathname === "/api/diagnostics") {
      return this.#json(response, 200, await this.service.diagnostics());
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await this.#body(request);
      const credential = body.credential || (body.token !== void 0 || body.endpointGrant !== void 0 || body.grantExpiresAt !== void 0 || body.tokenEndpoint !== void 0 ? {
        ...body.token !== void 0 ? { connectToken: body.token } : {},
        ...body.endpointGrant !== void 0 ? { endpointGrant: body.endpointGrant } : {},
        ...body.grantExpiresAt !== void 0 ? { grantExpiresAt: body.grantExpiresAt } : {},
        ...body.tokenEndpoint !== void 0 ? { tokenEndpoint: body.tokenEndpoint } : {}
      } : void 0);
      await this.service.updateConfig(body.config || {}, credential);
      const config = await this.service.configStore.publicConfig({ includeToken: true });
      return this.#json(response, 200, config);
    }
    if (request.method === "POST" && url.pathname === "/api/connection/test") {
      return this.#json(response, 200, await this.service.testConnection());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/connect") {
      return this.#json(response, 200, await this.service.connect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/disconnect") {
      return this.#json(response, 200, await this.service.disconnect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/reconnect") {
      try {
        return this.#json(response, 200, await this.service.reconnectRelay());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "RELAY_RECONNECT_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/start") {
      return this.#json(response, 200, await this.service.appServer.start());
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/restart") {
      try {
        return this.#json(response, 200, await this.service.restartAppServerConnection());
      } catch (error) {
        return this.#json(response, 409, { error: { code: error.code || "APP_SERVER_RESTART_FAILED", message: error.message } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/stop") {
      await this.service.appServer.stop();
      return this.#json(response, 200, this.service.appServer.status());
    }
    if (request.method === "DELETE" && url.pathname === "/api/logs") {
      this.service.logger.clear();
      return this.#json(response, 200, { ok: true });
    }
    return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "API \u4E0D\u5B58\u5728" } });
  }
  #authorized(request) {
    const authorization = request.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = Buffer.from(this.#accessKey);
    const actual = Buffer.from(supplied);
    const viaBootstrap = expected.length === actual.length && crypto6.timingSafeEqual(expected, actual);
    if (viaBootstrap) return { ok: true, viaBootstrap };
    const cookies = request.headers.cookie || "";
    const session = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DASHBOARD_COOKIE}=`));
    const cookieValue = session ? decodeURIComponent(session.slice(DASHBOARD_COOKIE.length + 1)) : "";
    const suppliedHash = crypto6.createHash("sha256").update(cookieValue).digest("hex");
    const actualHash = Buffer.from(suppliedHash, "hex");
    const viaCookie = this.#sessionTokenHashes.some((expected2) => {
      const expectedHash = Buffer.from(expected2, "hex");
      return expectedHash.length === actualHash.length && crypto6.timingSafeEqual(expectedHash, actualHash);
    });
    return { ok: viaCookie, viaBootstrap: false };
  }
  #setSessionCookie(response) {
    response.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=${this.#sessionToken}; Max-Age=${DASHBOARD_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict`);
  }
  #sessionToken;
  async #loadOrCreateSession() {
    let hashes = [];
    try {
      const saved = JSON.parse(await fs14.readFile(this.#sessionFile, "utf8"));
      hashes = Array.isArray(saved?.tokenHashes) ? saved.tokenHashes : [];
      if (typeof saved?.token === "string" && saved.token.length >= 32) hashes.push(crypto6.createHash("sha256").update(saved.token).digest("hex"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.#sessionToken = crypto6.randomBytes(32).toString("base64url");
    this.#sessionTokenHashes = [.../* @__PURE__ */ new Set([...hashes.filter((value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)), crypto6.createHash("sha256").update(this.#sessionToken).digest("hex")])].slice(-8);
    await fs14.mkdir(path15.dirname(this.#sessionFile), { recursive: true, mode: 448 });
    await fs14.writeFile(this.#sessionFile, `${JSON.stringify({ version: 1, tokenHashes: this.#sessionTokenHashes })}
`, { mode: 384 });
  }
  async #body(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 256 * 1024) throw new Error("\u8BF7\u6C42\u5185\u5BB9\u8D85\u8FC7 256 KiB \u9650\u5236");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  #json(response, status, payload) {
    if (response.headersSent) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(payload));
  }
  #securityHeaders(response) {
    response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
};

// server/runtime.js
var runtime;
async function getRuntime() {
  if (runtime) return runtime;
  const configStore = new ConfigStore();
  const lock = new InstanceLock(configStore.configDir, "runtime.lock");
  try {
    await lock.acquire();
  } catch (error) {
    if (error.code !== "RELAY_INSTANCE_ALREADY_RUNNING") throw error;
    let info = await readRuntimeInfo(configStore.configDir);
    for (let attempt = 0; !info && attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      info = await readRuntimeInfo(configStore.configDir);
    }
    if (!info) throw error;
    const service2 = new RuntimeProxy(info);
    runtime = {
      service: service2,
      dashboard: { url: () => info.url, status: () => ({ state: "running", ownerPid: info.pid }) },
      remote: true
    };
    return runtime;
  }
  await retireLegacyConnector(configStore.configDir, lock);
  const service = new ConnectorService({ configDir: configStore.configDir });
  try {
    await service.start();
    const dashboard = new DashboardServer(service, service.logger);
    service.attachDashboard(dashboard);
    await dashboard.start();
    const info = {
      pid: process.pid,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      generation: crypto7.randomUUID(),
      version: "1.0.0+codex.20260913033153",
      buildId: "1.0.0+codex.20260913033153:1789270327154",
      ...dashboard.connectionInfo()
    };
    await writeRuntimeInfo(configStore.configDir, info);
    runtime = { service, dashboard, remote: false, configDir: configStore.configDir, runtimeInfo: info, runtimeLock: lock };
    return runtime;
  } catch (error) {
    await lock.release().catch(() => {
    });
    throw error;
  }
}
async function stopRuntime() {
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  if (current.remote) return;
  try {
    await current.service.stop();
  } finally {
    if (current.runtimeLock) await current.runtimeLock.release().catch(() => {
    });
    if (current.configDir) await removeRuntimeInfo(current.configDir, current.runtimeInfo?.pid);
  }
}
async function readRuntimeInfo(configDir) {
  try {
    const info = JSON.parse(await fs15.readFile(path16.join(configDir, "runtime.json"), "utf8"));
    if (!Number.isInteger(info?.port) || info.port <= 0 || typeof info.accessKey !== "string" || !info.url) return null;
    try {
      process.kill(Number(info.pid), 0);
    } catch {
      return null;
    }
    return info;
  } catch {
    return null;
  }
}
async function writeRuntimeInfo(configDir, info) {
  await fs15.mkdir(configDir, { recursive: true, mode: 448 });
  const file = path16.join(configDir, "runtime.json");
  const temporary = `${file}.${process.pid}.tmp`;
  await fs15.writeFile(temporary, `${JSON.stringify(info)}
`, { mode: 384 });
  await fs15.rename(temporary, file);
}
async function removeRuntimeInfo(configDir, pid) {
  const file = path16.join(configDir, "runtime.json");
  try {
    const current = JSON.parse(await fs15.readFile(file, "utf8"));
    if (pid && Number(current.pid) !== Number(pid)) return;
  } catch {
  }
  await fs15.unlink(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
async function retireLegacyConnector(configDir, runtimeLock) {
  const file = path16.join(configDir, "connector.lock");
  try {
    const record = JSON.parse(await fs15.readFile(file, "utf8"));
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch (error2) {
      if (error2.code !== "ESRCH") throw error2;
      return;
    }
    const deadline = Date.now() + 3e3;
    while (Date.now() < deadline) {
      try {
        await fs15.access(file);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error2) {
        if (error2.code === "ENOENT") return;
        throw error2;
      }
    }
    const error = new Error("\u65E7\u7248 Codex Relay \u8FDB\u7A0B\u672A\u80FD\u5728 3 \u79D2\u5185\u9000\u51FA");
    error.code = "LEGACY_RUNTIME_STILL_RUNNING";
    throw error;
  } catch (error) {
    if (error.code === "ENOENT") return;
    await runtimeLock.release().catch(() => {
    });
    throw error;
  }
}
var RuntimeProxy = class {
  constructor(info) {
    this.info = info;
  }
  async status() {
    return this.#request("/api/status");
  }
  async diagnostics() {
    return this.#request("/api/diagnostics");
  }
  async connect() {
    return this.#request("/api/connection/connect", "POST");
  }
  async disconnect() {
    return this.#request("/api/connection/disconnect", "POST");
  }
  async testConnection() {
    return this.#request("/api/connection/test", "POST");
  }
  async remoteControlStatus() {
    return this.#request("/api/remote-control");
  }
  async remoteControlInstall() {
    return this.#request("/api/remote-control/install", "POST");
  }
  async remoteControlStart() {
    return this.#request("/api/remote-control/start", "POST");
  }
  async remoteControlStop() {
    return this.#request("/api/remote-control/stop", "POST");
  }
  async remoteControlPair() {
    return this.#request("/api/remote-control/pair", "POST");
  }
  async updateConfig(patch, credential) {
    return this.#request("/api/config", "PUT", { config: patch, credential });
  }
  async #request(endpoint, method = "GET", body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15e3);
    try {
      const response = await fetch(`http://127.0.0.1:${this.info.port}${endpoint}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.info.accessKey}`,
          ...body ? { "Content-Type": "application/json" } : {}
        },
        ...body ? { body: JSON.stringify(body) } : {}
      });
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(value?.error?.message || `\u672C\u5730 Relay Agent \u8BF7\u6C42\u5931\u8D25 (${response.status})`);
        error.code = value?.error?.code || "RUNTIME_PROXY_FAILED";
        throw error;
      }
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
};

// server/agent-cli.js
try {
  const runtime2 = await getRuntime();
  if (runtime2.remote) {
    process.exit(0);
  }
} catch (error) {
  console.error(`[codex-relay-agent] ${error.message}`);
  process.exit(1);
}
var shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopRuntime().catch((error) => console.error(`[codex-relay-agent] shutdown: ${error.message}`));
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => shutdown(0));
}
