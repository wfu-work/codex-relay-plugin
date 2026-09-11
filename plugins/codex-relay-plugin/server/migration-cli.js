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
    function parse2(header) {
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
    module.exports = { format, parse: parse2 };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter3 = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net2 = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash: createHash4 } = __require("crypto");
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
    var { format, parse: parse2 } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter3 {
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
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
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
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
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
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
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
      const request = isSecure ? https.request : http.request;
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
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest2 = createHash4("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest2) {
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
            extensions = parse2(secWebSocketExtensions);
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
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
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
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
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
      websocket._readyState = WebSocket2.CLOSING;
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
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
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
    function parse2(header) {
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
    module.exports = { parse: parse2 };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter3 = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash4 } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter3 {
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
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
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
        const digest2 = createHash4("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest2}`
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
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
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

// server/migration-cli.js
import path18 from "node:path";

// server/config-store.js
import fs3 from "node:fs/promises";
import os2 from "node:os";
import path5 from "node:path";

// server/utils.js
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// server/secret-store.js
import crypto2 from "node:crypto";
import fs from "node:fs/promises";
import path2 from "node:path";
var SecretStore = class {
  constructor(configDir2, logger) {
    this.configDir = configDir2;
    this.logger = logger;
    this.fallbackFile = path2.join(configDir2, "secrets.json");
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
      return JSON.parse(await fs.readFile(this.fallbackFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async #writeFallback(values) {
    await fs.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.fallbackFile}.${process.pid}.${crypto2.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(values, null, 2)}
`, { mode: 384 });
    await fs.rename(temporary, this.fallbackFile);
    await fs.chmod(this.fallbackFile, 384);
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
import fs2 from "node:fs/promises";
import path3 from "node:path";
var EndpointIdentityStore = class {
  constructor(configDir2) {
    this.configDir = configDir2;
    this.file = path3.join(configDir2, "endpoint-identity.json");
    this.identity = null;
  }
  async get() {
    if (this.identity) return { ...this.identity };
    try {
      this.identity = this.#validate(JSON.parse(await fs2.readFile(this.file, "utf8")));
      await fs2.chmod(this.file, 384);
      return { ...this.identity };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pair = crypto3.generateKeyPairSync("ed25519");
    const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
    const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
    const identity3 = {
      schemaVersion: 1,
      publicKey: Buffer.from(publicDer).subarray(-32).toString("base64url"),
      privateKey: Buffer.from(privateDer).toString("base64url")
    };
    await fs2.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.file}.${process.pid}.${crypto3.randomUUID()}.tmp`;
    await fs2.writeFile(temporary, `${JSON.stringify(identity3, null, 2)}
`, { mode: 384 });
    await fs2.rename(temporary, this.file);
    await fs2.chmod(this.file, 384);
    this.identity = identity3;
    return { ...identity3 };
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

// server/app-server-transport.js
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path4 from "node:path";
import readline from "node:readline";

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
function parseAppServerEndpoint(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("\u8BF7\u586B\u5199\u5171\u4EAB App Server \u5730\u5740");
  const endpoint = value.trim();
  if (endpoint.startsWith("unix://")) {
    const socketPath = endpoint.slice(7) || path4.join(process.env.CODEX_HOME || path4.join(os.homedir(), ".codex"), "app-server-control", "app-server-control.sock");
    if (!path4.isAbsolute(socketPath) || /[\0\r\n?#]/.test(socketPath)) throw new Error("\u5171\u4EAB Socket \u5FC5\u987B\u4F7F\u7528\u7EDD\u5BF9\u8DEF\u5F84");
    return { kind: "unix", endpoint, socketPath };
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("\u5171\u4EAB\u540E\u7AEF\u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws://\u3001wss:// \u6216 unix://");
  }
  if (!["ws:", "wss:"].includes(url.protocol)) throw new Error("\u5171\u4EAB\u540E\u7AEF\u5730\u5740\u5FC5\u987B\u4F7F\u7528 ws://\u3001wss:// \u6216 unix://");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("\u5171\u4EAB App Server \u4EC5\u652F\u6301\u672C\u673A\u5730\u5740\uFF1B\u8FDC\u7A0B\u8BBF\u95EE\u8BF7\u4F7F\u7528 Relay");
  if (url.username || url.password || url.search || url.hash) throw new Error("\u5171\u4EAB\u540E\u7AEF\u5730\u5740\u4E0D\u80FD\u5305\u542B\u51ED\u636E\u3001query \u6216 hash");
  return { kind: "websocket", endpoint: url.toString() };
}
var StdioAppServerTransport = class extends EventEmitter {
  child = null;
  lines = null;
  constructor(config) {
    super();
    this.config = config;
  }
  get pid() {
    return this.child?.pid || null;
  }
  get writable() {
    return Boolean(this.child?.stdin?.writable);
  }
  async open() {
    const child = spawn(this.config.executable || "codex", ["app-server"], {
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
var SharedAppServerTransport = class extends EventEmitter {
  socket = null;
  heartbeat = null;
  constructor(endpoint, { connectTimeoutMs = 1e4, heartbeatMs = 2e4 } = {}) {
    super();
    this.address = parseAppServerEndpoint(endpoint);
    this.connectTimeoutMs = connectTimeoutMs;
    this.heartbeatMs = heartbeatMs;
  }
  get pid() {
    return null;
  }
  // A client socket is not the backend process.
  get writable() {
    return this.socket?.readyState === wrapper_default.OPEN;
  }
  async open() {
    const { kind, endpoint, socketPath } = this.address;
    const socket = new wrapper_default(kind === "unix" ? "ws://localhost/rpc" : endpoint, {
      ...kind === "unix" ? { createConnection: () => net.createConnection(socketPath) } : {},
      handshakeTimeout: this.connectTimeoutMs,
      perMessageDeflate: false,
      followRedirects: false
    });
    this.socket = socket;
    let alive = true;
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("message", (data) => {
      alive = true;
      this.emit("message", data.toString());
    });
    socket.on("error", (error) => this.emit("closed", error));
    socket.on("close", (code) => {
      clearInterval(this.heartbeat);
      this.emit("closed", new Error(`\u5171\u4EAB App Server \u8FDE\u63A5\u5DF2\u5173\u95ED (${code})`));
    });
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => onError(new Error("\u5171\u4EAB App Server \u5728\u521D\u59CB\u5316\u524D\u65AD\u5F00"));
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
    this.heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      if (this.writable) socket.ping();
    }, this.heartbeatMs);
    this.heartbeat.unref();
  }
  send(message) {
    this.socket.send(message, (error) => {
      if (error) this.emit("closed", error);
    });
  }
  async close() {
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    if (!socket || socket.readyState === wrapper_default.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => socket.terminate(), 250);
      socket.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      if (socket.readyState === wrapper_default.OPEN) socket.close();
      else socket.terminate();
    });
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
function defaultConfig() {
  return {
    version: 1,
    relay: {
      url: "",
      spaceId: "",
      endpointId: "",
      deviceId: randomId("host"),
      deviceName: os2.hostname(),
      autoConnect: false,
      heartbeatSeconds: 20,
      reconnectMaxSeconds: 30
    },
    codex: {
      connectionMode: "managed",
      appServerEndpoint: "",
      executable: "codex",
      autoStartAppServer: true,
      defaultWorkingDirectory: ""
    },
    permissions: { ...DEFAULT_PERMISSIONS },
    allowedProjects: [],
    readOnly: false
  };
}
var ConfigStore = class {
  constructor({ configDir: configDir2, logger } = {}) {
    this.configDir = configDir2 || process.env.CODEX_RELAY_CONFIG_DIR || path5.join(os2.homedir(), ".codex-relay-plugin");
    this.configFile = path5.join(this.configDir, "config.json");
    this.logger = logger;
    this.secretStore = new SecretStore(this.configDir, logger);
    this.endpointIdentityStore = new EndpointIdentityStore(this.configDir);
    this.config = null;
  }
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fs3.readFile(this.configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.config = mergeConfig(defaultConfig(), migrateSavedConfig(saved));
    validateConfig(this.config);
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
    const identity3 = await this.endpointIdentityStore.get();
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
        endpointPublicKey: identity3.publicKey
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
    await fs3.mkdir(this.configDir, { recursive: true, mode: 448 });
    const temporary = `${this.configFile}.tmp`;
    await fs3.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    await fs3.rename(temporary, this.configFile);
    await fs3.chmod(this.configFile, 384);
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
    codex: { ...base.codex, ...patch.codex || {} },
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
  if (!saved || typeof saved !== "object" || !saved.relay || typeof saved.relay !== "object") return saved;
  if (Object.hasOwn(saved.relay, "endpointId")) return saved;
  const legacyDeviceId = typeof saved.relay.deviceId === "string" ? saved.relay.deviceId : "";
  const endpointId = legacyDeviceId && !legacyDeviceId.startsWith("host_") ? legacyDeviceId : "";
  return { ...saved, relay: { ...saved.relay, endpointId } };
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
  if (!["managed", "shared"].includes(config.codex.connectionMode)) throw new Error("App Server \u8FDE\u63A5\u6A21\u5F0F\u65E0\u6548");
  if (typeof config.codex.appServerEndpoint !== "string") throw new Error("\u5171\u4EAB App Server \u5730\u5740\u65E0\u6548");
  if (config.codex.connectionMode === "shared" || config.codex.appServerEndpoint) {
    config.codex.appServerEndpoint = parseAppServerEndpoint(config.codex.appServerEndpoint).endpoint;
  }
  if (typeof config.codex.executable !== "string" || !config.codex.executable.trim()) throw new Error("Codex \u547D\u4EE4\u65E0\u6548");
  if (typeof config.codex.defaultWorkingDirectory !== "string") throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u65E0\u6548");
  if (config.codex.defaultWorkingDirectory && !path5.isAbsolute(config.codex.defaultWorkingDirectory)) {
    throw new Error("\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84");
  }
  if (typeof config.codex.autoStartAppServer !== "boolean") throw new Error("App Server \u81EA\u52A8\u542F\u52A8\u914D\u7F6E\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!config.permissions || typeof config.permissions !== "object") throw new Error("\u8FDC\u7A0B\u6743\u9650\u914D\u7F6E\u65E0\u6548");
  for (const name of Object.keys(DEFAULT_PERMISSIONS)) {
    if (typeof config.permissions[name] !== "boolean") throw new Error(`\u8FDC\u7A0B\u6743\u9650 ${name} \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
  }
  if (typeof config.readOnly !== "boolean") throw new Error("\u53EA\u8BFB\u6A21\u5F0F\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  if (!Array.isArray(config.allowedProjects)) throw new Error("\u9879\u76EE\u767D\u540D\u5355\u5FC5\u987B\u662F\u6570\u7EC4");
  for (const project of config.allowedProjects) {
    if (typeof project !== "string" || !path5.isAbsolute(project)) throw new Error(`\u9879\u76EE\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${project}`);
  }
  return config;
}

// server/environment-service.js
import fs9 from "node:fs/promises";
import { constants } from "node:fs";
import os7 from "node:os";
import path13 from "node:path";
import { execFile as execFile5 } from "node:child_process";
import { promisify as promisify5 } from "node:util";

// server/errors.js
var RelayError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
};

// server/shared-backend-manager.js
import fs5 from "node:fs/promises";
import path8 from "node:path";
import os3 from "node:os";
import { execFile as execFile2, spawn as spawn2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { createHash } from "node:crypto";

// server/instance-lock.js
import fs4 from "node:fs/promises";
import path6 from "node:path";
var LOCK_WRITE_GRACE_MS = 5e3;
var InstanceLock = class {
  #file = null;
  #handle = null;
  #acquirePromise = null;
  constructor(configDir2, name = "connector.lock") {
    this.#file = path6.join(configDir2, name);
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
    await fs4.mkdir(path6.dirname(this.#file), { recursive: true, mode: 448 });
    for (; ; ) {
      try {
        this.#handle = await fs4.open(this.#file, "wx", 384);
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
    await fs4.unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async #removeIfStale() {
    let record;
    try {
      record = JSON.parse(await fs4.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return true;
      try {
        const stat = await fs4.stat(this.#file);
        if (Date.now() - stat.mtimeMs < LOCK_WRITE_GRACE_MS) return false;
      } catch (statError) {
        if (statError.code === "ENOENT") return true;
        return false;
      }
      await fs4.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
    const pid = Number(record?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      await fs4.unlink(this.#file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
      await fs4.unlink(this.#file).catch((unlinkError) => {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      });
      return true;
    }
  }
};

// server/desktop-proxy.js
var DESKTOP_PIPE_KEY = "CODEX_APP_TOOLS_PIPE_PATH";

// server/official-runtime.js
import path7 from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var exec = promisify(execFile);
var officialNode = (app) => path7.join(app, "Contents/Resources/cua_node/bin/node");
async function verifyOfficialRuntime(app) {
  const runtime = officialNode(app);
  await exec("/usr/bin/codesign", ["--verify", "--strict", '-R=identifier "node" and anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"', runtime], { timeout: 5e3, maxBuffer: 4096 });
  return { verified: true, teamId: "2DC432GLL2", identifier: "node" };
}

// server/shared-backend-manager.js
var exec2 = promisify2(execFile2);
var COMPATIBILITY = { minDesktopVersion: "26.901.51231", minCliVersion: "0.153.4" };
var shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
var escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function plist(value) {
  const encode = (item) => Array.isArray(item) ? `<array>${item.map(encode).join("")}</array>` : typeof item === "object" ? `<dict>${Object.entries(item).map(([key, val]) => `<key>${escapeXml(key)}</key>${encode(val)}`).join("")}</dict>` : typeof item === "boolean" ? `<${item}/>` : typeof item === "number" ? `<integer>${item}</integer>` : `<string>${escapeXml(item)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">${encode(value)}</plist>
`;
}
async function writePrivate(file, value) {
  await fs5.mkdir(path8.dirname(file), { recursive: true, mode: 448 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs5.writeFile(temporary, value, { mode: 384 });
  await fs5.rename(temporary, file);
}
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs5.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== void 0) return fallback;
    throw error;
  }
}
var digest = async (file) => createHash("sha256").update(await fs5.readFile(file)).digest("hex");
function versionParts(value) {
  const match = String(value || "").trim().match(/(?:^|\s)(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? match.slice(1).map((part) => Number(part || 0)) : null;
}
function isVersionAtLeast(actual, minimum) {
  const a = versionParts(actual);
  const b = versionParts(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
async function checkCompatibility(manifest) {
  const [{ stdout: desktop }, { stdout: cli }, binaryHash] = await Promise.all([
    exec2("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path8.join(manifest.desktopApp, "Contents/Info.plist")], { timeout: 5e3, maxBuffer: 4096 }),
    exec2(manifest.binary, ["--version"], { timeout: 5e3, maxBuffer: 4096 }),
    digest(manifest.binary)
  ]);
  const desktopVersion = desktop.trim();
  const cliVersion = cli.trim().replace(/^codex-cli\s+/, "");
  const resources = path8.join(manifest.desktopApp, "Contents/Resources");
  const required = ["codex", "cua_node/bin/node", "plugins/openai-bundled/plugins/codex-app-tools/server.mjs", "plugins/openai-bundled/plugins/codex-app-tools/desktop-mcp.json"];
  if (!isVersionAtLeast(desktopVersion, manifest.minDesktopVersion || COMPATIBILITY.minDesktopVersion) || !isVersionAtLeast(cliVersion, manifest.minCliVersion || COMPATIBILITY.minCliVersion) || binaryHash !== manifest.binaryHash || !await Promise.all(required.map((file) => fs5.access(path8.join(resources, file)).then(() => true, () => false))).then((values) => values.every(Boolean))) {
    throw new Error("\u684C\u9762\u6216 CLI \u5B89\u88C5\u4E0D\u6EE1\u8DB3\u5F53\u524D\u542F\u52A8\u5668\u7684\u6700\u4F4E\u517C\u5BB9\u8981\u6C42\uFF0C\u6216\u5B89\u88C5\u6587\u4EF6\u5DF2\u53D1\u751F\u53D8\u5316\uFF1B\u8BF7\u91CD\u65B0\u68C0\u67E5\u5E76\u751F\u6210\u51C6\u5907\u5305");
  }
  return { desktopVersion, cliVersion: `codex-cli ${cliVersion}`, binaryHash };
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
async function assertStopped(allowedPids = [], manifest, kinds = ["desktop", "backend", "relay"]) {
  const { stdout } = await exec2("/bin/ps", ["-axo", "pid=,ppid=,args="], { maxBuffer: 8 * 1024 * 1024 });
  const candidates = processConflicts(stdout, allowedPids).filter((item) => kinds.includes(item.kind));
  const conflicts = [];
  for (const item of candidates) {
    if (manifest) {
      const { stdout: details } = await exec2("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="]).catch(() => ({ stdout: "" }));
      if (!details) continue;
      const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
      const match = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`));
      const home = match?.[1] || path8.join(os3.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
      const target = item.kind === "relay" ? path8.dirname(manifest.relayConfig) : manifest.codexHome;
      if (path8.resolve(home) !== path8.resolve(target)) continue;
    }
    conflicts.push(item);
  }
  if (conflicts.length) throw new Error(`\u8BF7\u5148\u9000\u51FA\u684C\u9762\u5E76\u505C\u6B62\u65E7 Relay/\u540E\u7AEF\uFF0C\u518D\u6267\u884C\u5207\u6362\u3002\u4ECD\u5728\u8FD0\u884C\uFF1A${conflicts.map((x) => `${x.kind} PID ${x.pid}`).join("\u3001")}`);
}
async function identity(pid) {
  try {
    return (await exec2("/bin/ps", ["-p", String(pid), "-o", "lstart=,comm="])).stdout.trim();
  } catch {
    return "";
  }
}
async function ownedRuntime(manifest) {
  const runtime = await readJson(path8.join(manifest.root, "runtime.json"), null);
  if (!runtime || runtime.endpoint !== manifest.endpoint || !runtime.pid || !runtime.identity) return null;
  return await identity(runtime.pid) === runtime.identity ? runtime : null;
}
async function probeEndpoint(endpoint) {
  const connection = new SharedAppServerTransport(endpoint, { connectTimeoutMs: 1e3 });
  connection.on("closed", () => {
  });
  try {
    await connection.open();
    return true;
  } catch {
    return false;
  } finally {
    await connection.close();
  }
}
async function backendStatus(manifest) {
  const runtime = await ownedRuntime(manifest);
  return { ready: Boolean(runtime && await probeEndpoint(manifest.endpoint)), pid: runtime?.pid ?? null, endpoint: manifest.endpoint, codexHome: manifest.codexHome };
}
async function waitReady(manifest, timeoutMs = 12e3) {
  const deadline = Date.now() + timeoutMs;
  do {
    const status = await backendStatus(manifest);
    if (status.ready) return status;
    await new Promise((resolve) => setTimeout(resolve, 150));
  } while (Date.now() < deadline);
  throw new Error("\u5171\u4EAB\u540E\u7AEF\u672A\u5C31\u7EEA\uFF1B\u5DF2\u505C\u6B62\u542F\u52A8\u684C\u9762\uFF0C\u907F\u514D\u521B\u5EFA\u53E6\u4E00\u4E2A\u6267\u884C\u540E\u7AEF");
}
function expectedEnvironment(manifest) {
  return { CODEX_CLI_PATH: path8.join(manifest.root, "codex-proxy"), CODEX_APP_SERVER_FORCE_CLI: "1", CODEX_APP_SERVER_WS_URL: "", CODEX_HOME: manifest.codexHome };
}
function serviceDefinition(manifest) {
  return {
    Label: manifest.label,
    // The desktop authenticates the tool, its parent and its grandparent.
    // The service manager is in that chain; a shell/Homebrew Node breaks it.
    ProgramArguments: [officialNode(manifest.desktopApp), path8.join(manifest.root, "shared-backend-cli.js"), "service", "--manifest", path8.join(manifest.root, "manifest.json")],
    RunAtLoad: true,
    KeepAlive: { SuccessfulExit: false },
    ThrottleInterval: 15,
    ProcessType: "Interactive",
    Umask: 63,
    StandardOutPath: path8.join(manifest.root, "service.log"),
    StandardErrorPath: path8.join(manifest.root, "service.log")
  };
}
async function openDesktop(manifest) {
  await checkCompatibility(manifest);
  await waitReady(manifest);
  const runtime = await ownedRuntime(manifest);
  if (!await isActiveSharedInstallation(manifest)) await assertStopped(runtime ? [runtime.pid] : [], manifest, ["backend"]);
  const env = { ...process.env, ...expectedEnvironment(manifest), CODEX_HOME: manifest.codexHome };
  delete env.CODEX_APP_SERVER_WS_URL;
  await exec2("/usr/bin/open", ["-a", manifest.desktopApp, "--env", `CODEX_CLI_PATH=${env.CODEX_CLI_PATH}`, "--env", "CODEX_APP_SERVER_FORCE_CLI=1", "--env", "CODEX_APP_SERVER_WS_URL=", "--env", `CODEX_HOME=${manifest.codexHome}`], { env });
}
async function isActiveSharedInstallation(manifest) {
  const [record, config] = await Promise.all([
    readJson(path8.join(manifest.root, "activation.json"), null),
    readJson(manifest.relayConfig, null)
  ]);
  return record?.phase === "active" && config?.codex?.connectionMode === "shared" && config.codex.appServerEndpoint === manifest.endpoint;
}
function defaultManifest(root, options = {}) {
  const desktopApp = options.desktopApp || "/Applications/ChatGPT.app";
  const manifest = {
    version: 1,
    root: path8.resolve(root),
    node: officialNode(desktopApp),
    desktopApp,
    binary: path8.join(desktopApp, "Contents/Resources/codex"),
    ...COMPATIBILITY,
    codexHome: path8.resolve(options.codexHome || process.env.CODEX_HOME || path8.join(os3.homedir(), ".codex")),
    relayConfig: path8.resolve(options.relayConfig || path8.join(os3.homedir(), ".codex-relay-plugin/config.json")),
    relayAgent: options.relayAgent,
    pluginRoot: options.relayAgent ? path8.dirname(path8.dirname(path8.resolve(options.relayAgent))) : null,
    originalIcon: options.originalIcon ?? false,
    desktopProfile: options.desktopProfile || null,
    path: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    shell: os3.userInfo().shell || "/bin/zsh",
    label: "com.recodex.shared-backend",
    launchAgent: path8.join(os3.homedir(), "Library/LaunchAgents/com.recodex.shared-backend.plist")
  };
  manifest.endpoint = `unix://${path8.join(manifest.root, "rpc.sock")}`;
  if (Buffer.byteLength(manifest.endpoint.slice(7)) > 100) throw new Error("\u5B89\u88C5\u76EE\u5F55\u8FC7\u957F\uFF0CmacOS Unix Socket \u8DEF\u5F84\u9700\u4E0D\u8D85\u8FC7 100 \u5B57\u8282");
  return manifest;
}
function tomlValue(value) {
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${tomlValue(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function desktopToolDefinition(manifest) {
  const plugin = path8.join(manifest.desktopApp, "Contents/Resources/plugins/openai-bundled/plugins/codex-app-tools");
  const definition = (await readJson(path8.join(plugin, "desktop-mcp.json"))).mcpServers.codex_app;
  const env = { ...definition.env, [DESKTOP_PIPE_KEY]: path8.join(manifest.root, "desktop-tools.sock"), CODEX_MCP_NODE_PATH: officialNode(manifest.desktopApp) };
  return {
    ...definition,
    command: path8.resolve(plugin, definition.command),
    cwd: plugin,
    enabled: true,
    omit_tools_from: ["deferred"],
    env,
    env_vars: definition.env_vars?.filter((key) => !Object.hasOwn(env, key))
  };
}

// server/shared-installation.js
import path9 from "node:path";
async function configuredSharedManifest(environment) {
  const config = environment.service.configStore.get?.().codex;
  if (config?.connectionMode !== "shared" || !config.appServerEndpoint?.startsWith("unix://")) return null;
  const socket = config.appServerEndpoint.slice(7);
  if (!path9.isAbsolute(socket) || path9.basename(socket) !== "rpc.sock") return null;
  const root = path9.dirname(socket);
  const packages = path9.join(environment.service.configStore.configDir, "migration/packages");
  if (path9.dirname(root) !== packages && root !== environment.sharedRoot) return null;
  const manifest = await readJson(path9.join(root, "manifest.json"), null).catch(() => null);
  if (!manifest || manifest.root !== root || manifest.endpoint !== config.appServerEndpoint || manifest.codexHome !== environment.codexHome || manifest.relayConfig !== path9.join(environment.service.configStore.configDir, "config.json")) return null;
  return manifest;
}

// server/desktop-compatibility.js
import fs8 from "node:fs/promises";
import path12 from "node:path";
import os6 from "node:os";
import { createHash as createHash2 } from "node:crypto";
import { execFile as execFile4, spawn as spawn3 } from "node:child_process";
import { promisify as promisify4 } from "node:util";

// server/app-server-client.js
import { EventEmitter as EventEmitter2 } from "node:events";
import { execFile as execFile3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";

// server/rollout-snapshot.js
import fs6 from "node:fs/promises";
import path10 from "node:path";
import os4 from "node:os";

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
        changes: Object.entries(item.changes || {}).slice(0, 128).map(([path19, change]) => ({
          path: path19,
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
    if (!Number.isSafeInteger(count) || count < 0) return null;
    result[key] = count;
  }
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
    const total = usage(info?.total_token_usage);
    if (!total) return false;
    const last = usage(info?.last_token_usage);
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
var RolloutSnapshots = class {
  #root;
  #index = /* @__PURE__ */ new Map();
  #indexedAt = 0;
  #indexing;
  #records = /* @__PURE__ */ new Map();
  #pending = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path10.join(os4.homedir(), ".codex"), indexIntervalMs = 2e3 } = {}) {
    this.#root = path10.join(codexHome, "sessions");
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
  async #refreshIndex() {
    if (this.#indexing) return this.#indexing;
    if (Date.now() - this.#indexedAt < this.indexIntervalMs) return;
    this.#indexing = (async () => {
      const entries = await fs6.readdir(this.#root, { recursive: true, withFileTypes: true });
      const index = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = entry.name.match(JOURNAL);
        if (!match) continue;
        const file = path10.join(entry.parentPath, entry.name);
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
    const root = await fs6.realpath(this.#root);
    const original = await fs6.realpath(thread.path);
    if (!inside(root, original)) return null;
    await this.#refreshIndex();
    for (const candidate of this.#index.get(thread.id) || [original]) {
      const file = await fs6.realpath(candidate);
      if (!inside(root, file)) continue;
      const handle = await fs6.open(file, "r");
      try {
        const stat = await handle.stat();
        let record = this.#records.get(thread.id);
        const reusable = record?.file === file && record.cwd === path10.resolve(thread.cwd) && record.ino === stat.ino && stat.size >= record.offset;
        if (!reusable) {
          const head = Buffer.alloc(Math.min(MAX_LINE_BYTES, stat.size));
          const { bytesRead } = await handle.read(head, 0, head.length, 0);
          const end = head.indexOf(10);
          if (end < 0 || end >= bytesRead) continue;
          const meta = JSON.parse(head.subarray(0, end).toString("utf8"));
          if (meta.type !== "session_meta" || meta.payload?.id !== thread.id || path10.resolve(meta.payload?.cwd || "") !== path10.resolve(thread.cwd)) continue;
          if (stat.size > MAX_READ_BYTES) return null;
          record = {
            file,
            cwd: path10.resolve(thread.cwd),
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
  const relative = path10.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path10.sep}`) && !path10.isAbsolute(relative);
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
    const turn = event.turn_id ? record.turns.find((turn2) => turn2.id === event.turn_id) : record.current;
    if (!turn) return;
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
  get(id2) {
    const entry = this.entries.get(id2);
    if (!entry) throw new RelayError("APPROVAL_EXPIRED", "\u8BF7\u6C42\u5DF2\u7ECF\u5904\u7406\u6216\u8FDE\u63A5\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u4EFB\u52A1");
    return entry;
  }
  resolve(requestId, threadId) {
    const resolved = [];
    for (const [id2, entry] of this.entries) {
      if (entry.backendId === requestId && (!threadId || entry.params.threadId === threadId)) {
        this.entries.delete(id2);
        resolved.push(entry);
      }
    }
    return resolved;
  }
  clearThread(threadId, turnId) {
    const removed = [];
    for (const [id2, entry] of this.entries) if (entry.params.threadId === threadId && (!turnId || entry.params.turnId === turnId)) {
      this.entries.delete(id2);
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
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).some((id2) => !questions.some((question) => question.id === id2))) throw new RelayError("INVALID_MESSAGE", "\u95EE\u9898\u56DE\u7B54\u683C\u5F0F\u65E0\u6548");
    for (const question of questions) {
      const answer = answers[question.id]?.answers;
      if (!Array.isArray(answer) || answer.length === 0 || answer.length > 20 || answer.some((text2) => typeof text2 !== "string" || !text2.trim() || text2.length > 2e4)) throw new RelayError("INVALID_MESSAGE", "\u8BF7\u5B8C\u6574\u586B\u5199\u6BCF\u4E2A\u95EE\u9898\u7684\u56DE\u7B54");
    }
    return { answers };
  }
};

// server/composer-settings.js
function composerSettings(value) {
  const source = value?.threadSettings && typeof value.threadSettings === "object" ? value.threadSettings : value;
  if (!source || typeof source.model !== "string") return null;
  const settings = { model: source.model, effort: source.effort ?? source.reasoningEffort ?? null };
  for (const key of ["approvalPolicy", "approvalsReviewer", "activePermissionProfile"]) {
    if (source[key] !== void 0) settings[key] = source[key];
  }
  if (source.sandboxPolicy || source.sandbox) settings.sandboxPolicy = source.sandboxPolicy || source.sandbox;
  return settings;
}

// server/desktop-project-pins.js
import fs7 from "node:fs/promises";
import os5 from "node:os";
import path11 from "node:path";
var DesktopProjectPins = class {
  #file;
  #positions = /* @__PURE__ */ new Map();
  constructor({ codexHome = process.env.CODEX_HOME || path11.join(os5.homedir(), ".codex") } = {}) {
    this.#file = path11.join(codexHome, ".codex-global-state.json");
  }
  async enrich(result) {
    if (!Array.isArray(result?.data)) return result;
    try {
      const state = JSON.parse(await fs7.readFile(this.#file, "utf8"));
      if (state && typeof state === "object" && !Array.isArray(state)) {
        const ids = state["pinned-project-ids"] ?? [];
        if (Array.isArray(ids) && ids.every((id2) => typeof id2 === "string" && id2.trim())) {
          this.#positions = new Map([...new Set(ids)].map((id2, index) => [id2, index]));
        }
      }
    } catch {
    }
    return {
      ...result,
      data: result.data.map((project) => {
        if (!project || typeof project !== "object" || Array.isArray(project)) return project;
        const pinnedPosition = this.#positions.get(project.id);
        return { ...project, isPinned: pinnedPosition !== void 0, pinnedPosition: pinnedPosition ?? null };
      })
    };
  }
};

// server/app-server-client.js
var execFileAsync = promisify3(execFile3);
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
  #rollouts = new RolloutSnapshots();
  #projectPins;
  #observedThreads = /* @__PURE__ */ new Map();
  #rolloutTimer = null;
  #pollingRollouts = false;
  static MAX_RESUMED_THREADS = 1e3;
  static APPROVAL_METHODS = /* @__PURE__ */ new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval"
  ]);
  constructor(configStore, logger, options = {}) {
    super();
    this.options = options;
    this.#projectPins = new DesktopProjectPins({ codexHome: options.codexHome });
    this.configStore = configStore;
    this.logger = logger;
    this.state = "stopped";
    this.version = null;
    this.lastError = null;
  }
  status() {
    const config = this.#connectionConfig || this.configStore.get().codex;
    const shared = config.connectionMode === "shared";
    return {
      state: this.state,
      version: this.version,
      pid: this.#transport?.pid || null,
      connectionMode: config.connectionMode || "managed",
      transport: shared ? parseAppServerEndpoint(config.appServerEndpoint).kind : "stdio",
      ownsProcess: !shared && Boolean(this.#transport?.pid),
      endpoint: shared ? config.appServerEndpoint : null,
      reconnectAttempt: this.#retryAttempt,
      nextRetryAt: this.nextRetryAt || null,
      subscribedThreads: this.#resumedThreads.size,
      lastError: this.lastError,
      pendingRequests: this.#requests.size,
      pendingApprovals: this.#interactions.entries.size
    };
  }
  async checkAvailability() {
    const config = this.configStore.get().codex;
    if (config.connectionMode === "shared") {
      const probe = new SharedAppServerTransport(config.appServerEndpoint, this.options);
      probe.on("closed", () => {
      });
      try {
        await probe.open();
        return { connectionMode: "shared", endpoint: probe.address.endpoint, version: this.version };
      } finally {
        await probe.close();
      }
    }
    const executable = this.configStore.get().codex.executable || "codex";
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { timeout: 1e4 });
    this.version = (stdout || stderr).trim();
    return { executable, version: this.version };
  }
  isShared() {
    return (this.#connectionConfig || this.configStore.get().codex).connectionMode === "shared";
  }
  async start() {
    this.#wanted = true;
    if (this.#starting) return this.#starting;
    if (this.state === "ready") return this.status();
    if (this.#retryTimer) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u5171\u4EAB App Server \u6B63\u5728\u91CD\u8FDE\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
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
    this.#connectionConfig = { ...config, connectionMode: config.connectionMode || "managed" };
    this.state = "starting";
    this.lastError = null;
    this.version = null;
    this.#resetConnectionState();
    let transport;
    try {
      if (this.isShared()) {
        transport = new SharedAppServerTransport(config.appServerEndpoint, this.options);
      } else {
        await this.checkAvailability();
        transport = new StdioAppServerTransport(config);
      }
      if (generation !== this.#generation || !this.#wanted) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      this.#transport = transport;
      transport.on("message", (line) => {
        if (this.#transport === transport) this.#handleLine(line);
      });
      transport.on("log", (message) => {
        if (message) this.logger.info("app-server", message);
      });
      transport.on("closed", (error) => this.#handleExit(transport, error));
      this.logger.info("app-server", this.isShared() ? "\u6B63\u5728\u8FDE\u63A5\u5171\u4EAB App Server" : "\u6B63\u5728\u542F\u52A8 Codex App Server");
      await transport.open();
      if (generation !== this.#generation || this.#transport !== transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "App Server \u8FDE\u63A5\u5DF2\u53D6\u6D88");
      const initialized = await this.request("initialize", {
        clientInfo: { name: "codex-relay-plugin", title: "Codex Relay Plugin", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      }, this.options.initializeTimeoutMs || 15e3);
      if (this.isShared() && (!initialized || typeof initialized !== "object")) throw new Error("App Server initialize \u54CD\u5E94\u65E0\u6548");
      this.notify("initialized", {});
      if (this.isShared()) this.version = initialized.userAgent || initialized.serverInfo?.version || null;
      for (const id2 of [...this.#subscriptions]) {
        if (generation !== this.#generation || this.#transport !== transport) throw new Error("\u5171\u4EAB\u8FDE\u63A5\u6062\u590D\u5DF2\u53D6\u6D88");
        try {
          await this.resumeThread(id2);
        } catch (error) {
          if (!transport.writable) throw error;
          this.#subscriptions.delete(id2);
          this.logger.warn("app-server", "\u4EFB\u52A1\u8BA2\u9605\u6062\u590D\u5931\u8D25\uFF0C\u7B49\u5F85\u5BA2\u6237\u7AEF\u91CD\u65B0\u8BFB\u53D6", { threadId: id2, message: error.message });
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
    if (!this.#wanted || !this.isShared()) return;
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
      this.start().catch((error) => this.logger.warn("app-server", "\u5171\u4EAB\u540E\u7AEF\u91CD\u8FDE\u5931\u8D25", { message: error.message }));
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
    clearInterval(this.#rolloutTimer);
    this.#rolloutTimer = null;
    this.#observedThreads.clear();
    this.#rollouts.clear();
    this.#subscriptions.clear();
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
    const id2 = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id2);
        reject(new RelayError("APP_SERVER_TIMEOUT", `${method} \u8BF7\u6C42\u8D85\u65F6`));
      }, timeoutMs);
      this.#requests.set(id2, {
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
        this.#write({ jsonrpc: "2.0", id: id2, method, params });
      } catch (error) {
        const pending = this.#requests.get(id2);
        this.#requests.delete(id2);
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
    for (let index = 0; index < Math.min(data.length, 5); index += 1) {
      data[index] = await this.#reconcileRollout(data[index], false);
    }
    return {
      ...first,
      // Some App Server builds can repeat a historical thread at a page
      // boundary while the on-disk index is being updated. The thread id is
      // the stable identity shared by desktop and Relay; collapse duplicates
      // before exposing the catalog so clients do not render two rows for one
      // task during eventual convergence.
      data: sortThreadList(
        dedupeThreadList(data.map((thread) => this.#observedThreads.get(thread.id)?.projected || thread)),
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
   * App Server. Those threads are still readable from the shared Codex
   * history, but `thread/resume` is rejected with an active-writer error.
   * Relay reads used for reconciliation must therefore be side-effect free;
   * starting a new turn remains responsible for resuming the thread when
   * necessary.
   */
  async readThreadSnapshot(threadId) {
    const id2 = normalizeThreadId(threadId);
    const result = this.#paginatedThreads === true ? await this.#readPaginatedThread(id2) : await this.request("thread/read", { threadId: id2, includeTurns: true }).catch(async (error) => {
      if (!isPaginatedThreadReadError(error)) throw error;
      this.#paginatedThreads = true;
      return this.#readPaginatedThread(id2);
    });
    return this.#reconcileRollout(result, true);
  }
  // Unlike readThread(), this explicitly disables includeTurns. Codex still
  // returns the current thread status, but does not stream the full history.
  // The Relay client uses it as a cheap heartbeat for a selected task. The
  // explicit false also keeps older non-paginated servers from falling back
  // to their full-history default. Status reads never acquire a writer unless
  // a caller explicitly requests a local subscription.
  async readThreadStatus(threadId, { ensureResumed = false } = {}) {
    const id2 = normalizeThreadId(threadId);
    if (ensureResumed) await this.ensureThreadResumed(id2);
    const result = await this.request("thread/read", { threadId: id2, includeTurns: false });
    return this.#reconcileRollout(result, false);
  }
  async #reconcileRollout(result, includeTurns) {
    const thread = result?.thread || result;
    if (this.isShared() || thread?.status?.type !== "notLoaded" || this.#resumedThreads.has(thread.id)) return result;
    const snapshot = await this.#rollouts.read(thread);
    if (!snapshot) return result;
    const observed = this.#observedThreads.get(thread.id);
    for (const [method, params] of snapshot.notifications) this.emit("notification", method, params);
    const projected = applyRolloutSnapshot(thread, snapshot, { includeTurns });
    this.#observedThreads.delete(thread.id);
    this.#observedThreads.set(thread.id, {
      thread: { ...thread, turns: [] },
      projected: { ...projected, turns: [] },
      touchedAt: Date.now(),
      updatedAt: snapshot.updatedAt
    });
    while (this.#observedThreads.size > 8) this.#observedThreads.delete(this.#observedThreads.keys().next().value);
    if (observed && observed.updatedAt !== snapshot.updatedAt) {
      this.emit("notification", "thread/status/changed", {
        threadId: thread.id,
        turnId: snapshot.currentTurn.id,
        thread: { ...projected, turns: [] }
      });
    }
    this.#rolloutTimer ??= setInterval(() => this.#pollRollouts(), 1e3);
    this.#rolloutTimer.unref();
    return result?.thread ? { ...result, thread: projected } : projected;
  }
  async #pollRollouts() {
    if (this.#pollingRollouts) return;
    this.#pollingRollouts = true;
    try {
      for (const [id2, observed] of [...this.#observedThreads]) {
        if (Date.now() - observed.touchedAt > 6e4 || this.#resumedThreads.has(id2)) {
          this.#observedThreads.delete(id2);
          continue;
        }
        const snapshot = await this.#rollouts.read(observed.thread);
        if (!this.#rolloutTimer || this.#observedThreads.get(id2) !== observed) continue;
        if (!snapshot) continue;
        for (const [method, params] of snapshot.notifications) this.emit("notification", method, params);
        if (observed.updatedAt !== snapshot.updatedAt) {
          observed.updatedAt = snapshot.updatedAt;
          observed.projected = applyRolloutSnapshot(observed.thread, snapshot);
          this.emit("notification", "thread/status/changed", { threadId: id2, turnId: snapshot.currentTurn.id, thread: observed.projected });
        }
      }
      if (!this.#observedThreads.size) {
        clearInterval(this.#rolloutTimer);
        this.#rolloutTimer = null;
      }
    } finally {
      this.#pollingRollouts = false;
    }
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
    const id2 = normalizeThreadId(threadId);
    if (this.#resumedThreads.has(id2)) return Promise.resolve();
    const retryAt = this.#resumeRetryAt.get(id2) || 0;
    if (retryAt > Date.now()) return Promise.resolve();
    const existing = this.#resumingThreads.get(id2);
    if (existing) return existing;
    const pending = this.resumeThread(id2).then(() => {
      this.#rememberResumedThread(id2);
      this.#resumeRetryAt.delete(id2);
    }).catch((error) => {
      if (this.isShared() || !isActiveWriterConflict(error)) throw error;
      this.#rememberResumeRetry(id2, Date.now() + 6e4);
      this.logger.warn("app-server", "\u4EFB\u52A1\u6B63\u5728\u5176\u4ED6 Codex \u5BA2\u6237\u7AEF\u8FD0\u884C\uFF0C\u6682\u4EE5\u5FEB\u7167\u540C\u6B65", {
        threadId: id2
      });
    }).finally(() => {
      if (this.#resumingThreads.get(id2) === pending) {
        this.#resumingThreads.delete(id2);
      }
    });
    this.#resumingThreads.set(id2, pending);
    return pending;
  }
  // Call only after the command router has checked project access. Raw
  // snapshot/status reads remain side-effect free in both modes.
  async subscribeThread(threadId) {
    if (!this.isShared()) return false;
    const id2 = normalizeThreadId(threadId);
    const alreadySubscribed = this.#resumedThreads.has(id2);
    await this.ensureThreadResumed(id2);
    return !alreadySubscribed && this.#resumedThreads.has(id2);
  }
  #rememberResumedThread(id2) {
    if (this.isShared()) {
      this.#subscriptions.delete(id2);
      this.#subscriptions.add(id2);
      while (this.#subscriptions.size > _AppServerClient.MAX_RESUMED_THREADS) {
        const retired = this.#subscriptions.values().next().value;
        this.#subscriptions.delete(retired);
        this.request("thread/unsubscribe", { threadId: retired }).catch(() => {
        });
      }
    }
    this.#resumedThreads.delete(id2);
    this.#resumedThreads.add(id2);
    while (this.#resumedThreads.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#resumedThreads.delete(this.#resumedThreads.values().next().value);
    }
  }
  #rememberResumeRetry(id2, retryAt) {
    this.#resumeRetryAt.delete(id2);
    this.#resumeRetryAt.set(id2, retryAt);
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
    const id2 = result?.thread?.id || result?.id;
    if (id2) {
      this.#rememberResumedThread(normalizeThreadId(id2));
      this.#rememberThreadSettings(id2, result);
    }
    return { ...result, ...this.threadSettings(id2) ? { threadSettings: this.threadSettings(id2) } : {} };
  }
  async resumeThread(threadId) {
    const id2 = normalizeThreadId(threadId);
    const transport = this.#transport;
    const previousSettings = this.#threadSettings.get(id2);
    const result = await this.request("thread/resume", { threadId: id2 });
    if (transport !== this.#transport) throw new RelayError("APP_SERVER_UNAVAILABLE", "\u4EFB\u52A1\u8BA2\u9605\u7684\u8FDE\u63A5\u5DF2\u8FC7\u671F");
    this.#rememberResumedThread(id2);
    if (this.#threadSettings.get(id2) === previousSettings) this.#rememberThreadSettings(id2, result);
    return result;
  }
  threadSettings(threadId) {
    const value = this.#threadSettings.get(threadId);
    return value ? structuredClone(value) : null;
  }
  #rememberThreadSettings(threadId, value) {
    const settings = composerSettings(value);
    if (!settings || !threadId) return;
    this.#threadSettings.delete(threadId);
    this.#threadSettings.set(threadId, { ...settings, revision: ++this.#settingsRevision });
    while (this.#threadSettings.size > _AppServerClient.MAX_RESUMED_THREADS) {
      this.#threadSettings.delete(this.#threadSettings.keys().next().value);
    }
  }
  async updateThreadSettings(threadId, patch) {
    const id2 = normalizeThreadId(threadId);
    await this.ensureThreadResumed(id2);
    const previous = this.#threadSettings.get(id2);
    await this.request("thread/settings/update", { threadId: id2, ...patch });
    if (this.#threadSettings.get(id2) === previous) await this.resumeThread(id2);
    if (!this.threadSettings(id2)) throw new RelayError("APP_SERVER_ERROR", "Codex \u672A\u8FD4\u56DE\u4EFB\u52A1\u8BBE\u7F6E\uFF0C\u8BF7\u5347\u7EA7 Codex \u540E\u91CD\u8BD5");
    return { threadId: id2, threadSettings: this.threadSettings(id2) };
  }
  async startTurn({ threadId, text: text2, cwd, model, effort, images = [] }) {
    const id2 = normalizeThreadId(threadId);
    if (this.isShared()) await this.ensureThreadResumed(id2);
    const params = {
      threadId: id2,
      input: [...text2 ? [{ type: "text", text: text2 }] : [], ...images],
      ...cwd ? { cwd } : {},
      ...model ? { model } : {},
      ...effort ? { effort } : {}
    };
    try {
      const result = await this.request("turn/start", params);
      this.#rememberResumedThread(id2);
      return result;
    } catch (error) {
      if (!isThreadNotLoadedError(error)) throw error;
      await this.resumeThread(id2);
      return this.request("turn/start", params);
    }
  }
  steerTurn({ threadId, turnId, text: text2 }) {
    return this.request("turn/steer", {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: "text", text: text2 }]
    });
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
          if (this.isShared()) throw error;
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
          await this.request("turn/interrupt", { threadId, turnId });
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
      if (!this.isShared() && !_AppServerClient.APPROVAL_METHODS.has(message.method) && !["tool/requestUserInput", "item/tool/requestUserInput"].includes(message.method)) {
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
  const id2 = typeof threadId === "string" ? threadId.trim() : String(threadId || "").trim();
  if (!id2) throw new RelayError("INVALID_MESSAGE", "threadId \u4E0D\u80FD\u4E3A\u7A7A");
  return id2;
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
    const id2 = typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id2) {
      unique.push(thread);
      continue;
    }
    if (seen.has(id2)) {
      const index = indexes.get(id2);
      const previous = index == null ? null : unique[index];
      if (previous && threadRecency(thread) > threadRecency(previous)) {
        unique[index] = thread;
      }
      continue;
    }
    seen.add(id2);
    indexes.set(id2, unique.length);
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
    const id2 = String(project.id ?? "").trim();
    if (!id2 || seen.has(id2)) continue;
    seen.add(id2);
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
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isPaginatedThreadReadError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && error.message.includes("paginated threads do not support thread/read(includeTurns=true)");
}
function isThreadNotLoadedError(error) {
  return error?.code === "APP_SERVER_ERROR" && typeof error?.message === "string" && /\bthread\s+not\s+found\b/i.test(error.message);
}

// server/desktop-compatibility.js
var exec3 = promisify4(execFile4);
var TTL = 10 * 6e4;
var REQUIRED2 = ["list_threads", "open_in_codex", "send_message_to_thread"];
var quiet = { info() {
}, warn() {
}, error() {
} };
var messages = {
  passed: "\u9694\u79BB\u5171\u4EAB\u540E\u7AEF\u5DF2\u52A0\u8F7D\u771F\u5B9E\u684C\u9762\u5DE5\u5177\u76EE\u5F55\uFF1B\u6B63\u5F0F\u5207\u6362\u4E0E\u5DE5\u5177\u8C03\u7528\u4ECD\u9700\u5355\u72EC\u9A8C\u6536",
  no_desktop: "\u672A\u627E\u5230\u4F7F\u7528\u5F53\u524D\u6570\u636E\u76EE\u5F55\u7684\u552F\u4E00\u684C\u9762\u5B9E\u4F8B\uFF0C\u8BF7\u6B63\u5E38\u6253\u5F00 Codex \u540E\u91CD\u8BD5",
  no_pipe: "\u684C\u9762\u6CA1\u6709\u63D0\u4F9B\u53EF\u9A8C\u8BC1\u7684\u5DE5\u5177\u8FDE\u63A5\uFF0C\u8BF7\u7B49\u5F85\u684C\u9762\u542F\u52A8\u5B8C\u6210\u540E\u91CD\u8BD5",
  invalid_signature: "\u5B98\u65B9\u8FD0\u884C\u65F6\u7B7E\u540D\u9A8C\u8BC1\u672A\u901A\u8FC7\uFF0C\u8BF7\u68C0\u67E5\u6216\u91CD\u65B0\u5B89\u88C5 Codex",
  handshake_failed: "\u5B98\u65B9\u8FD0\u884C\u65F6\u7B7E\u540D\u6709\u6548\uFF0C\u4F46\u9694\u79BB\u5171\u4EAB\u540E\u7AEF\u65E0\u6CD5\u52A0\u8F7D\u684C\u9762\u5DE5\u5177\uFF1B\u5F53\u524D\u5916\u90E8\u542F\u52A8\u65B9\u5F0F\u4E0D\u517C\u5BB9",
  incomplete_catalog: "\u5DE5\u5177\u63E1\u624B\u5B8C\u6210\uFF0C\u4F46\u7F3A\u5C11\u6240\u9700\u684C\u9762\u5DE5\u5177\uFF1B\u4E0D\u80FD\u636E\u6B64\u542F\u7528\u5171\u4EAB\u6A21\u5F0F",
  timeout: "\u684C\u9762\u5DE5\u5177\u9A8C\u6536\u8D85\u65F6\uFF0C\u53EF\u5728\u684C\u9762\u7A7A\u95F2\u65F6\u91CD\u8BD5",
  changed: "\u9A8C\u6536\u671F\u95F4\u684C\u9762\u8FDB\u7A0B\u6216\u5B89\u88C5\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9A8C\u8BC1",
  unsupported: "\u5F53\u524D\u5E73\u53F0\u6682\u4E0D\u652F\u6301\u8FD9\u9879\u684C\u9762\u517C\u5BB9\u6027\u9A8C\u6536",
  failed: "\u65E0\u6CD5\u5B8C\u6210\u684C\u9762\u5DE5\u5177\u9A8C\u6536\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u672C\u673A\u5B89\u88C5\u4E0E\u684C\u9762\u72B6\u6001",
  shared_passed: "\u5F53\u524D\u5171\u4EAB\u540E\u7AEF\u5DF2\u8FD4\u56DE\u684C\u9762\u5DE5\u5177\u76EE\u5F55\uFF1B\u5177\u4F53\u5DE5\u5177\u8C03\u7528\u9700\u5728\u4EFB\u52A1\u4E2D\u9A8C\u8BC1",
  shared_timeout: "\u5F53\u524D\u5171\u4EAB\u540E\u7AEF\u7684\u684C\u9762\u5DE5\u5177\u67E5\u8BE2\u8D85\u65F6\uFF1B\u6D88\u606F\u6267\u884C\u53EF\u7528\u4E0D\u4EE3\u8868\u6D4F\u89C8\u5668\u7B49\u684C\u9762\u5DE5\u5177\u5DF2\u6062\u590D",
  shared_failed: "\u5F53\u524D\u5171\u4EAB\u540E\u7AEF\u672A\u80FD\u52A0\u8F7D\u684C\u9762\u5DE5\u5177\u76EE\u5F55\uFF0C\u8BF7\u68C0\u67E5\u684C\u9762\u5DE5\u5177\u8FDE\u63A5",
  shared_unloaded: "\u5F53\u524D\u5171\u4EAB\u540E\u7AEF\u6CA1\u6709\u5DF2\u52A0\u8F7D\u4EFB\u52A1\uFF0C\u6682\u65E0\u6CD5\u68C0\u67E5\u4EFB\u52A1\u4E2D\u7684\u684C\u9762\u5DE5\u5177\u76EE\u5F55",
  shared_runtime_restart_required: "\u5171\u4EAB\u670D\u52A1\u4ECD\u7531\u7CFB\u7EDF Node \u542F\u52A8\uFF0C\u684C\u9762\u5DE5\u5177\u7684\u7236\u8FDB\u7A0B\u7B7E\u540D\u94FE\u4E0D\u7B26\u5408\u8981\u6C42\u3002\u8BF7\u4FEE\u590D\u5171\u4EAB\u670D\u52A1\u8FD0\u884C\u65F6\uFF1B\u9000\u51FA\u684C\u9762\u540E\u5C06\u81EA\u52A8\u91CD\u542F\u5E76\u9A8C\u8BC1\uFF0C\u65E0\u9700\u91CD\u65B0\u8FC1\u79FB\u3002"
};
async function desktopTarget(environment) {
  const processes = await environment.inspectProcesses();
  const desktops = processes.items.filter((p) => p.kind === "desktop" && p.scope === "same");
  if (processes.state !== "ok" || desktops.length !== 1 || !desktops[0].appPath) return null;
  const desktop = desktops[0];
  const manifest = await configuredSharedManifest(environment);
  const run = environment.exec || exec3;
  const { stdout } = await run("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3e3, maxBuffer: 8 * 1024 * 1024 });
  const backends = stdout.split("\n").flatMap((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!m || Number(m[2]) !== desktop.pid) return [];
    const direct = m[3].startsWith(`${desktop.appPath}/Contents/Resources/codex `);
    const proxy = manifest?.desktopApp === desktop.appPath && m[3].includes(`${path12.join(manifest.root, "shared-backend-cli.js")} proxy --manifest ${path12.join(manifest.root, "manifest.json")} `);
    if (!direct && !proxy) return [];
    const pipe = m[3].match(/"CODEX_APP_TOOLS_PIPE_PATH"\s*=\s*"([^"\r\n]+)"/)?.[1];
    return pipe && path12.isAbsolute(pipe) ? [{ pipe, backendPid: Number(m[1]), connection: proxy ? "shared_proxy" : "direct" }] : [];
  });
  const target = { ...desktop, ...backends.length === 1 ? backends[0] : { pipe: null } };
  const stat = target.pipe ? await fs8.stat(target.pipe).catch(() => null) : null;
  if (!stat?.isSocket() || stat.uid !== process.getuid()) target.pipe = null;
  const runtime = manifest ? await ownedRuntime(manifest) : null;
  if (manifest) {
    target.endpoint = manifest.endpoint;
    target.runtimeIdentity = runtime?.identity || null;
    const backend = stdout.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).find((m) => m && Number(m[1]) === runtime?.pid);
    const service = backend && stdout.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).find((m) => m && m[1] === backend[2]);
    if (service?.[3].includes(`${path12.join(manifest.root, "shared-backend-cli.js")} service --manifest ${path12.join(manifest.root, "manifest.json")}`)) {
      target.servicePid = Number(service[1]);
      const command = (await run("/bin/ps", ["-p", service[1], "-o", "comm="], { timeout: 2e3 })).stdout.trim();
      const resolved = await fs8.realpath(command).catch(() => null);
      target.serviceRuntime = resolved && resolved === await fs8.realpath(officialNode(manifest.desktopApp)).catch(() => null) ? "official" : "legacy";
    }
  }
  const identity3 = (await run("/bin/ps", ["-p", String(desktop.pid), "-o", "lstart=,comm="], { timeout: 2e3 })).stdout.trim();
  const resources = path12.join(desktop.appPath, "Contents/Resources");
  const hash = createHash2("sha256").update(JSON.stringify([identity3, target.pipe, target.backendPid, target.endpoint, target.runtimeIdentity, target.servicePid, target.serviceRuntime, environment.codexHome]));
  for (const file of ["codex", "cua_node/bin/node", "plugins/openai-bundled/plugins/codex-app-tools/server.mjs", "plugins/openai-bundled/plugins/codex-app-tools/desktop-mcp.json"]) {
    const s = await fs8.stat(path12.join(resources, file));
    hash.update(JSON.stringify([file, s.ino, s.size, s.mtimeMs, s.ctimeMs]));
  }
  target.fingerprint = hash.digest("hex");
  return target;
}
async function probeDesktopTools(target, { checkpoint = async () => {
}, timeoutMs = 15e3 } = {}) {
  const root = await fs8.mkdtemp(path12.join(os6.tmpdir(), "relay-desktop-check-"));
  const home = path12.join(root, "home");
  await fs8.mkdir(home, { mode: 448 });
  const manifest = { root, desktopApp: target.appPath };
  const endpoint = `unix://${path12.join(root, "rpc.sock")}`;
  const deadline = Date.now() + timeoutMs;
  let child, client, killTimer;
  try {
    const tools = await desktopToolDefinition(manifest);
    tools.env.CODEX_APP_TOOLS_PIPE_PATH = target.pipe;
    tools.env_vars = tools.env_vars?.filter((key) => !Object.hasOwn(tools.env, key));
    const env = { ...process.env, CODEX_HOME: home, RUST_LOG: "error" };
    for (const key of ["CODEX_CLI_PATH", "CODEX_APP_SERVER_WS_URL", "CODEX_APP_SERVER_FORCE_CLI", "ELECTRON_RUN_AS_NODE"]) delete env[key];
    child = spawn3(path12.join(target.appPath, "Contents/Resources/codex"), ["-c", "features.code_mode_host=true", "-c", `mcp_servers.codex_app=${tomlValue(tools)}`, "app-server", "--listen", endpoint], { env, cwd: home, stdio: "ignore" });
    let spawnError;
    child.once("error", (error) => {
      spawnError = error;
    });
    killTimer = setTimeout(() => child.kill("SIGTERM"), timeoutMs + 1e3);
    while (!await fs8.stat(path12.join(root, "rpc.sock")).then((s) => s.isSocket(), () => false)) {
      await checkpoint();
      if (spawnError || child.exitCode !== null || child.signalCode !== null) return { code: "failed" };
      if (Date.now() > deadline) return { code: "timeout" };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    client = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: endpoint, defaultWorkingDirectory: home } }) }, quiet);
    await client.start();
    const { thread } = await client.createThread({ cwd: home, approvalPolicy: "never", sandbox: "read-only" });
    while (Date.now() < deadline) {
      await checkpoint();
      const result = await client.request("mcpServerStatus/list", { threadId: thread.id, detail: "toolsAndAuthOnly" }, Math.max(100, Math.min(5e3, deadline - Date.now())));
      const server = result.data?.find((server2) => server2.name === "codex_app");
      if (server?.runtimeStatus === "failed") return { code: "handshake_failed" };
      const names = Object.keys(server?.tools || {});
      if (names.length) return { code: REQUIRED2.every((name) => names.includes(name)) ? "passed" : "incomplete_catalog", toolCount: names.length };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return { code: "timeout" };
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    return { code: Date.now() >= deadline ? "timeout" : "failed" };
  } finally {
    clearTimeout(killTimer);
    await client?.stop().catch(() => {
    });
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 2e3);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
    await fs8.rm(root, { recursive: true, force: true });
  }
}
async function probeSharedDesktopTools(target, { checkpoint = async () => {
}, timeoutMs = 2e4, createClient } = {}) {
  if (target.serviceRuntime === "legacy") return { code: "shared_runtime_restart_required" };
  if (!target.endpoint || !target.runtimeIdentity) return { code: "shared_failed" };
  const client = createClient ? createClient() : new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: target.endpoint } }) }, quiet, { initializeTimeoutMs: 3e3 });
  const deadline = Date.now() + timeoutMs;
  const request = (method, params) => client.request(method, params, Math.max(100, deadline - Date.now()));
  try {
    await checkpoint();
    await client.start();
    const loaded = await request("thread/loaded/list", { limit: 1 });
    const threadId = loaded.data?.[0];
    if (typeof threadId !== "string") return { code: "shared_unloaded" };
    await checkpoint();
    let cursor, server;
    const cursors = /* @__PURE__ */ new Set();
    do {
      await checkpoint();
      if (Date.now() >= deadline) return { code: "shared_timeout" };
      const response = await request("mcpServerStatus/list", { threadId, detail: "toolsAndAuthOnly", limit: 100, ...cursor ? { cursor } : {} });
      server = response.data?.find((item) => item.name === "codex_app");
      cursor = response.nextCursor;
      if (cursor && cursors.has(cursor)) return { code: "shared_failed" };
      cursors.add(cursor);
    } while (!server && cursor);
    const names = Object.keys(server?.tools || {});
    return { code: server?.runtimeStatus === "failed" ? "shared_failed" : REQUIRED2.every((name) => names.includes(name)) ? "shared_passed" : "incomplete_catalog", toolCount: names.length };
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    return { code: error.code === "APP_SERVER_TIMEOUT" || Date.now() >= deadline ? "shared_timeout" : "shared_failed" };
  } finally {
    await client.stop().catch(() => {
    });
  }
}
async function verifyDesktopCompatibility(environment, options = {}) {
  const discover = options.discover || desktopTarget;
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  let target, runtime = null, code = "failed", toolCount = 0;
  try {
    if ((options.platform || process.platform) !== "darwin") code = "unsupported";
    else {
      target = await discover(environment);
      if (!target) code = "no_desktop";
      else {
        try {
          runtime = await (options.verifyRuntime || verifyOfficialRuntime)(target.appPath);
        } catch {
          code = "invalid_signature";
        }
        if (runtime) {
          if (!target.pipe) code = "no_pipe";
          else {
            const shared = environment.service.configStore.get?.().codex?.connectionMode === "shared";
            const probe = options.probe || (shared ? probeSharedDesktopTools : probeDesktopTools);
            const result2 = await probe(target, options);
            code = Object.hasOwn(messages, result2.code) ? result2.code : "failed";
            toolCount = Number.isSafeInteger(result2.toolCount) ? result2.toolCount : 0;
          }
          if ((await discover(environment))?.fingerprint !== target.fingerprint) code = "changed";
        }
      }
    }
  } catch (error) {
    if (error.code === "PREPARATION_CANCELLED") throw error;
    code = "failed";
  }
  const result = { checkedAt, expiresAt: new Date(Date.now() + TTL).toISOString(), code, state: ["passed", "shared_passed"].includes(code) ? "passed" : "blocked", message: messages[code], runtime, toolCount, desktopPid: target?.pid || null, fingerprint: target?.fingerprint || null, scope: environment.service.configStore.get?.().codex?.connectionMode === "shared" ? "current_shared_backend_tool_catalog" : "isolated_shared_backend_tool_catalog", modelRequests: 0 };
  await writePrivate(path12.join(environment.service.configStore.configDir, "migration/desktop-compatibility.json"), JSON.stringify(result));
  return result;
}
async function readDesktopCompatibility(environment, { discover = desktopTarget, now = Date.now() } = {}) {
  try {
    const file = path12.join(environment.service.configStore.configDir, "migration/desktop-compatibility.json");
    if ((await fs8.stat(file)).size > 32 * 1024) return null;
    const saved = JSON.parse(await fs8.readFile(file, "utf8"));
    if (!Object.hasOwn(messages, saved.code) || !Number.isFinite(Date.parse(saved.checkedAt)) || !Number.isFinite(Date.parse(saved.expiresAt))) return null;
    const target = await discover(environment);
    const stale = now > Date.parse(saved.expiresAt) || !saved.fingerprint || saved.fingerprint !== target?.fingerprint;
    return { checkedAt: saved.checkedAt, code: saved.code, state: stale ? "stale" : ["passed", "shared_passed"].includes(saved.code) ? "passed" : "blocked", message: stale ? "\u684C\u9762\u8FDB\u7A0B\u3001\u5B89\u88C5\u7248\u672C\u5DF2\u53D8\u5316\u6216\u9A8C\u6536\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u9A8C\u8BC1" : messages[saved.code], signatureVerified: saved.runtime?.verified === true, signatureState: saved.runtime?.verified === true ? "passed" : saved.code === "invalid_signature" ? "blocked" : "unchecked", scope: saved.scope, toolCount: saved.toolCount || 0, desktopPid: saved.desktopPid || null };
  } catch {
    return null;
  }
}

// server/environment-service.js
var exec4 = promisify5(execFile5);
var CACHE_MS = 15e3;
var STALE_MS = 6e4;
var clean = (value) => typeof value === "string" ? redact(value).slice(0, 600) : null;
var date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
async function json(file) {
  try {
    if ((await fs9.stat(file)).size > 256 * 1024) throw new Error("Record too large");
    return JSON.parse(await fs9.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
var samePath = (a, b) => typeof a === "string" && typeof b === "string" && path13.resolve(a) === path13.resolve(b);
async function inspectExecutable(configured, options = {}) {
  const env = options.env || process.env;
  const run = options.exec || exec4;
  const platform = options.platform || process.platform;
  const candidates = [];
  const add = (value) => {
    if (value && path13.isAbsolute(value) && !candidates.includes(value)) candidates.push(value);
  };
  if (path13.isAbsolute(configured || "")) add(configured);
  else if (configured && !/[\\/]/.test(configured)) {
    for (const directory of (env.PATH || "").split(path13.delimiter)) {
      if (path13.isAbsolute(directory)) add(path13.join(directory, configured));
    }
  }
  const configuredCandidates = [...candidates];
  if (path13.basename(env.CODEX_CLI_PATH || "") === "codex") add(env.CODEX_CLI_PATH);
  if (env.CODEX_ELECTRON_RESOURCES_PATH) add(path13.join(env.CODEX_ELECTRON_RESOURCES_PATH, "codex"));
  if (platform === "darwin") {
    add("/Applications/ChatGPT.app/Contents/Resources/codex");
    add("/Applications/Codex.app/Contents/Resources/codex");
  }
  let candidate = null;
  let configuredValid = false;
  for (const file of candidates) {
    try {
      await fs9.access(file, constants.X_OK);
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
function migrationView(manifest, result, activation, configDir2, codexHome) {
  if (!manifest) return { state: "not_prepared", label: "\u5C1A\u672A\u51C6\u5907\u8FC1\u79FB", last: null };
  if (!samePath(manifest.relayConfig, path13.join(configDir2, "config.json")) || !samePath(manifest.codexHome, codexHome)) {
    return { state: "different_environment", label: "\u542F\u52A8\u5305\u5C5E\u4E8E\u5176\u4ED6\u73AF\u5883", last: null };
  }
  const last = result ? {
    phase: clean(result.phase),
    failedPhase: clean(result.failedPhase),
    success: result.success === true,
    updatedAt: date(result.updatedAt || result.completedAt || result.startedAt),
    error: clean(result.error),
    recovery: clean(result.recovery),
    backup: clean(result.backup),
    checks: { concurrentResume: result.checks?.concurrentResume === true, desktopTools: result.checks?.desktopTools === true }
  } : null;
  return {
    state: activation?.phase === "active" ? "active" : last?.phase === "failed" ? "failed" : "prepared",
    label: activation?.phase === "active" ? "\u5DF2\u6709\u5171\u4EAB\u6A21\u5F0F\u542F\u7528\u8BB0\u5F55" : last?.phase === "failed" ? "\u4E0A\u6B21\u8FC1\u79FB\u672A\u5B8C\u6210" : "\u5DF2\u51C6\u5907\u542F\u52A8\u5305",
    last
  };
}
var EnvironmentService = class {
  constructor(service, options = {}) {
    this.service = service;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exec = options.exec || exec4;
    this.pluginRoot = options.pluginRoot || PLUGIN_ROOT;
    this.sharedRoot = options.sharedRoot || this.env.CODEX_RELAY_SHARED_ROOT || path13.join(os7.homedir(), "Library/Application Support/Recodex Shared Backend");
    this.codexHome = this.env.CODEX_HOME || path13.join(os7.homedir(), ".codex");
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
    const configDir2 = this.service.configStore.configDir;
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    const [executable, processes, migration, installed, remoteControl] = await Promise.all([
      inspectExecutable(config.codex.executable, { env: this.env, platform: this.platform, exec: this.exec }),
      this.inspectProcesses(),
      this.inspectMigration(),
      json(path13.join(this.pluginRoot, ".codex-plugin/plugin.json")).catch(() => null),
      this.remoteControl?.inspect ? Promise.resolve().then(() => this.remoteControl.inspect()).catch((error) => ({ checkedAt, official: { state: "error", installed: false, reason: clean(error.message) }, bridge: { state: "blocked", attachable: false, endpoint: null, reason: "Remote Control \u72B6\u6001\u68C0\u67E5\u5931\u8D25" } })) : Promise.resolve(null)
    ]);
    const status = await this.service.status();
    const shared = (status.appServer?.connectionMode || config.codex.connectionMode) === "shared";
    const backendReady = status.appServer?.state === "ready";
    let desktopVersion = null;
    if (this.platform === "darwin") {
      const app = processes.items.find((item) => item.kind === "desktop")?.appPath;
      if (app) desktopVersion = await this.exec("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path13.join(app, "Contents/Info.plist")], { timeout: 2e3, maxBuffer: 4096 }).then((r) => clean(r.stdout.trim()), () => null);
    }
    const lastToolFailure = migration.last?.failedPhase === "verifying_shared_runtime" && /工具|签名|signing|pipe/i.test(migration.last.error || "");
    const runningVersion = "1.0.0+codex.20260911095629";
    const runningBuild = "1.0.0+codex.20260911095629:1789120603379";
    const diskBundle = runningBuild ? await fs9.readFile(path13.join(this.pluginRoot, "server/agent-cli.js"), "utf8").catch(() => null) : null;
    const needsRestart = runningBuild && diskBundle !== null ? !diskBundle.includes(JSON.stringify(runningBuild)) : installed?.version && runningVersion !== "development" ? installed.version !== runningVersion : null;
    const owned = processes.items.filter((p) => p.scope === "same" && p.kind === "backend");
    const desktopBackend = processes.items.find((p) => p.kind === "backend" && p.desktopHosted && p.scope === "same");
    const repairAllowed = !shared && ["stopped", "error"].includes(status.appServer?.state) && executable.needsRepair;
    const desktopCompatibility = await readDesktopCompatibility(this);
    return {
      checkedAt,
      staleAfterMs: STALE_MS,
      platform: this.platform,
      plugin: { installedVersion: installed?.version || null, runningVersion, needsRestart, pid: process.pid, startedAt: status.connector?.startedAt, root: this.pluginRoot },
      desktop: { version: desktopVersion, running: processes.state === "ok" ? processes.items.some((p) => p.kind === "desktop" && p.scope === "same") : null },
      executable,
      processes,
      migration,
      backend: { mode: status.appServer?.connectionMode || config.codex.connectionMode || "managed", state: status.appServer?.state || "unknown", pid: status.appServer?.pid ?? null, ownsProcess: status.appServer?.ownsProcess ?? null, endpoint: status.appServer?.endpoint || null, error: clean(status.appServer?.lastError) },
      desktopBackend: desktopBackend ? { state: "detected", pid: desktopBackend.pid, transport: desktopBackend.transport, endpoint: desktopBackend.transport === "stdio" ? null : desktopBackend.transport, attachable: false, reason: desktopBackend.transport === "stdio" ? "\u684C\u9762\u540E\u7AEF\u4EC5\u4F7F\u7528 stdio://\uFF0C\u672A\u66B4\u9732\u53EF\u4F9B Relay \u8FDE\u63A5\u7684\u672C\u5730\u7AEF\u70B9" : "\u684C\u9762\u540E\u7AEF\u7AEF\u70B9\u9700\u8981\u5B98\u65B9\u6388\u6743\uFF0C\u5F53\u524D\u672A\u542F\u7528 Relay \u63A5\u5165" } : { state: "unavailable", pid: null, transport: null, endpoint: null, attachable: false, reason: "\u672A\u68C0\u6D4B\u5230\u684C\u9762\u7248\u6258\u7BA1\u7684 App Server" },
      remoteControl: remoteControl || { checkedAt, official: { state: "unavailable", installed: false, reason: "\u672A\u68C0\u67E5" }, bridge: { state: "blocked", endpoint: null, attachable: false, reason: "\u672A\u68C0\u67E5" } },
      relay: { state: status.relay?.state || "unknown", lastHeartbeat: status.relay?.lastHeartbeat || null, reconnectAttempt: status.relay?.reconnectAttempt || 0 },
      sharing: {
        state: shared ? "unverified" : "not_enabled",
        label: shared ? backendReady ? "\u5171\u4EAB\u540E\u7AEF\u5DF2\u8FDE\u63A5" : "\u5171\u4EAB\u540E\u7AEF\u5C1A\u672A\u5C31\u7EEA" : "\u684C\u9762\u5171\u7528\u672A\u542F\u7528",
        message: shared ? "Flutter \u4E0E\u684C\u9762\u901A\u8FC7\u5171\u4EAB App Server \u6267\u884C\u4EFB\u52A1\uFF1B\u6D4F\u89C8\u5668\u7B49\u684C\u9762\u5DE5\u5177\u7684\u68C0\u67E5\u7ED3\u679C\u5355\u72EC\u663E\u793A\u3002" : "\u63D2\u4EF6\u4F7F\u7528\u72EC\u7ACB\u540E\u7AEF\uFF1B\u684C\u9762\u5360\u7528\u7684\u4EFB\u52A1\u53EF\u80FD\u65E0\u6CD5\u4ECE Flutter \u7EE7\u7EED\u53D1\u9001\u3002"
      },
      desktopTools: desktopCompatibility ? { ...desktopCompatibility, label: desktopCompatibility.state === "passed" ? "\u5DE5\u5177\u76EE\u5F55\u9A8C\u6536\u901A\u8FC7" : desktopCompatibility.state === "stale" ? "\u9700\u8981\u91CD\u65B0\u68C0\u67E5" : desktopCompatibility.code === "shared_runtime_restart_required" ? "\u5171\u4EAB\u670D\u52A1\u8FD0\u884C\u65F6\u5F85\u4FEE\u590D" : desktopCompatibility.code === "shared_timeout" ? "\u5DE5\u5177\u67E5\u8BE2\u8D85\u65F6" : "\u684C\u9762\u5DE5\u5177\u5F85\u5904\u7406" } : { state: "unchecked", label: "\u5F53\u524D\u8FDE\u63A5\u672A\u9A8C\u8BC1", message: lastToolFailure ? "\u4E0A\u6B21\u8FC1\u79FB\u7684\u684C\u9762\u5DE5\u5177\u9A8C\u6536\u5931\u8D25\uFF1B\u53EF\u5728\u8FC1\u79FB\u5411\u5BFC\u4E2D\u91CD\u65B0\u9A8C\u6536\u3002" : "\u53EF\u5728\u8FC1\u79FB\u5411\u5BFC\u4E2D\u8FD0\u884C\u771F\u5B9E\u684C\u9762\u5DE5\u5177\u9A8C\u6536\u3002" },
      paths: { configDir: configDir2, codexHome: this.codexHome, sharedRoot: this.sharedRoot },
      actions: {
        repair: { enabled: Boolean(repairAllowed), candidate: executable.candidate?.path || null, reason: shared ? "\u5171\u4EAB\u6A21\u5F0F\u7531\u5171\u4EAB\u670D\u52A1\u7BA1\u7406\u6267\u884C\u7A0B\u5E8F" : !executable.candidate ? "\u5C1A\u672A\u627E\u5230\u53EF\u7528\u7A0B\u5E8F\uFF0C\u8BF7\u5148\u5B89\u88C5 Codex \u6216\u5728\u9AD8\u7EA7\u8BBE\u7F6E\u4E2D\u6307\u5B9A\u8DEF\u5F84" : !executable.needsRepair ? "\u5F53\u524D\u5DF2\u4F7F\u7528\u9A8C\u8BC1\u8FC7\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u65E0\u9700\u4FEE\u590D" : !repairAllowed ? "\u540E\u7AEF\u6B63\u5728\u4F7F\u7528\u4E2D\uFF0C\u8BF7\u5728\u505C\u6B62\u6267\u884C\u540E\u901A\u8FC7\u9AD8\u7EA7\u8BBE\u7F6E\u4FEE\u6539\u8DEF\u5F84" : "\u9A8C\u8BC1\u5019\u9009\u8DEF\u5F84\u540E\u4FDD\u5B58\uFF1B\u81EA\u52A8\u8FDE\u63A5\u5DF2\u5F00\u542F\u65F6\u4F1A\u5C1D\u8BD5\u6062\u590D\u8FDE\u63A5" },
        migrate: { enabled: false, blockers: shared ? [] : [
          ...this.platform !== "darwin" ? ["\u81EA\u52A8\u8FC1\u79FB\u9996\u7248\u4EC5\u652F\u6301 macOS"] : [],
          ...desktopCompatibility ? [desktopCompatibility.message] : lastToolFailure ? ["\u4E0A\u6B21\u684C\u9762\u5DE5\u5177\u517C\u5BB9\u6027\u9A8C\u8BC1\u5931\u8D25\uFF0C\u9700\u8981\u5148\u89E3\u51B3"] : ["\u684C\u9762\u5DE5\u5177\u517C\u5BB9\u6027\u5C1A\u672A\u901A\u8FC7\u672C\u673A\u9A8C\u8BC1"],
          ...processes.state !== "ok" ? ["\u65E0\u6CD5\u786E\u8BA4\u51B2\u7A81\u8FDB\u7A0B"] : owned.length > 1 ? [`\u68C0\u6D4B\u5230 ${owned.length} \u4E2A\u6267\u884C\u540E\u7AEF\uFF0C\u9700\u8981\u786E\u8BA4\u4EFB\u52A1\u72B6\u6001\u5E76\u5904\u7406\u5360\u7528`] : [],
          "\u53EF\u5148\u901A\u8FC7\u8FC1\u79FB\u5411\u5BFC\u68C0\u67E5\u6761\u4EF6\u5E76\u751F\u6210\u51C6\u5907\u5305\uFF1B\u6B63\u5F0F\u5207\u6362\u5C1A\u672A\u5F00\u653E"
        ] }
      }
    };
  }
  async inspectMigration() {
    try {
      const selected = await configuredSharedManifest(this);
      const root = selected?.root || this.sharedRoot;
      const [manifest, result, activation] = await Promise.all(["manifest.json", "migration-result.json", "activation.json"].map((file) => json(path13.join(root, file))));
      return migrationView(manifest, result, activation, this.service.configStore.configDir, this.codexHome);
    } catch {
      return { state: "unreadable", label: "\u8FC1\u79FB\u8BB0\u5F55\u65E0\u6CD5\u8BFB\u53D6", last: null };
    }
  }
  async inspectProcesses() {
    if (this.platform === "win32") return { state: "unsupported", items: [], message: "\u5F53\u524D\u5E73\u53F0\u6682\u4E0D\u652F\u6301\u8FDB\u7A0B\u5360\u7528\u68C0\u67E5" };
    try {
      const { stdout } = await this.exec("/bin/ps", ["-axo", "pid=,ppid=,args="], { timeout: 3e3, maxBuffer: 8 * 1024 * 1024 });
      const items = await Promise.all(processConflicts(stdout).map(async (item) => {
        const line = stdout.split("\n").find((line2) => Number(line2.trim().split(/\s+/)[0]) === item.pid) || "";
        const command = line.trim().replace(/^\d+\s+\d+\s+/, "");
        const appPath = item.kind === "desktop" ? command.match(/^(\/[^\n]+?\.app)\/Contents\/MacOS\/(?:ChatGPT|Codex)(?:\s|$)/)?.[1] : null;
        const application = item.kind === "desktop" ? "Codex \u684C\u9762" : item.kind === "relay" ? "Relay \u63D2\u4EF6" : /\.vscode\//.test(line) ? "VS Code" : /\.plugin-appserver\//.test(line) ? "\u6D4F\u89C8\u5668\u6269\u5C55" : "Codex \u540E\u7AEF";
        const details = await this.exec("/bin/ps", ["eww", "-p", String(item.pid), "-o", "command="], { timeout: 2e3, maxBuffer: 1024 * 1024 }).then((r) => r.stdout, () => "");
        const key = item.kind === "relay" ? "CODEX_RELAY_CONFIG_DIR" : "CODEX_HOME";
        const selected = details.match(new RegExp(`(?:^| )${key}=(.*?)(?= [A-Za-z_][A-Za-z_0-9]*=|$)`))?.[1];
        const defaultDir = path13.join(os7.homedir(), item.kind === "relay" ? ".codex-relay-plugin" : ".codex");
        const target = item.kind === "relay" ? this.service.configStore.configDir : this.codexHome;
        const desktopHosted = item.kind === "backend" && /BROWSER_USE_CODEX_APP_VERSION=/.test(details);
        const transport = desktopHosted ? /--listen\s+stdio:\/\//.test(command) || /--stdio(?:\s|$)/.test(command) ? "stdio" : /--listen\s+(unix:\/\/[^\s]+)/.exec(command)?.[1] || "unknown" : null;
        return { ...item, application, ...appPath ? { appPath } : {}, ...desktopHosted ? { desktopHosted, transport } : {}, scope: !details ? "unknown" : samePath(selected || defaultDir, target) ? "same" : "other", taskState: "unknown" };
      }));
      return { state: "ok", items, message: "\u4EC5\u68C0\u67E5\u8FDB\u7A0B\u548C\u6570\u636E\u76EE\u5F55\uFF0C\u672A\u5224\u65AD\u4EFB\u52A1\u662F\u5426\u6B63\u5728\u6267\u884C\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u7ED3\u675F\u8FD9\u4E9B\u8FDB\u7A0B\u3002" };
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
      if (!["stopped", "error"].includes(backend.state) || this.service.configStore.get().codex.executable !== expected.configured || this.service.configStore.get().codex.connectionMode === "shared") throw new RelayError("ENVIRONMENT_CHANGED", "\u540E\u7AEF\u6216\u914D\u7F6E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
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

// server/migration-preparation.js
import fs13 from "node:fs/promises";
import path17 from "node:path";
import { spawn as spawn4, execFile as execFile7 } from "node:child_process";
import { promisify as promisify7 } from "node:util";

// server/migration-preflight.js
import fs10 from "node:fs/promises";
import path14 from "node:path";
import { createHash as createHash3 } from "node:crypto";
async function preparationFingerprint(context) {
  const hash = createHash3("sha256");
  for (const file of [path14.join(context.configDir, "config.json"), ...["package.json", ".codex-plugin/plugin.json", "server/agent-cli.js", "server/shared-backend-cli.js", "server/migration-cli.js", "ui/index.html"].map((file2) => path14.join(context.pluginRoot, file2))]) {
    hash.update(file).update("\0").update(await fs10.readFile(file)).update("\0");
  }
  hash.update(context.codexHome);
  return hash.digest("hex");
}
async function inspectPreparation(context, { environment, checkpoint = async () => {
}, onProgress = async () => {
}, verify = checkCompatibility, platform = process.platform } = {}) {
  const checks = [];
  const add = async (id2, title, state, detail, scope = "prepare") => {
    checks.push({ id: id2, title, state, detail, scope });
    await onProgress({ checks: [...checks] });
    await checkpoint();
  };
  await add("platform", "\u7CFB\u7EDF\u652F\u6301", platform === "darwin" ? "passed" : "blocked", platform === "darwin" ? "macOS \u652F\u6301\u751F\u6210\u5171\u4EAB\u540E\u7AEF\u51C6\u5907\u5305" : "\u8FC1\u79FB\u51C6\u5907\u76EE\u524D\u4EC5\u652F\u6301 macOS");
  const env = await environment.inspect(true);
  await checkpoint();
  await add("executable", "Codex \u6267\u884C\u8DEF\u5F84", env.executable.state === "ok" && !env.executable.needsRepair ? "passed" : "blocked", env.executable.state === "ok" && !env.executable.needsRepair ? "\u5DF2\u4F7F\u7528\u9A8C\u8BC1\u8FC7\u7684\u5B8C\u6574\u8DEF\u5F84" : "\u8BF7\u5148\u4FEE\u590D\u6267\u884C\u8DEF\u5F84\uFF0C\u518D\u51C6\u5907\u8FC1\u79FB");
  let fingerprint = null;
  try {
    const installed = JSON.parse(await fs10.readFile(path14.join(context.pluginRoot, "package.json"), "utf8"));
    if (installed.name === "codex-relay-plugin" && !installed.dependencies && !installed.devDependencies) fingerprint = await preparationFingerprint(context);
  } catch {
  }
  await add("plugin", "\u63D2\u4EF6\u5B89\u88C5\u6587\u4EF6", fingerprint ? "passed" : "blocked", fingerprint ? "\u5DF2\u8BB0\u5F55\u5F53\u524D\u914D\u7F6E\u4E0E\u63D2\u4EF6\u6784\u5EFA\uFF0C\u7528\u4E8E\u68C0\u6D4B\u51C6\u5907\u671F\u95F4\u7684\u53D8\u5316" : "\u5B89\u88C5\u6587\u4EF6\u6216\u914D\u7F6E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u5148\u91CD\u65B0\u6784\u5EFA\u6216\u66F4\u65B0\u63D2\u4EF6");
  let manifest = null;
  try {
    const configured = env.executable.resolved || "";
    const desktopApp = configured.match(/^(.*\.app)\/Contents\/Resources\/codex$/)?.[1] || env.processes.items.find((item) => item.kind === "desktop" && item.scope === "same")?.appPath || "/Applications/ChatGPT.app";
    manifest = defaultManifest(context.packageRoot, { desktopApp, codexHome: context.codexHome, relayConfig: path14.join(context.configDir, "config.json"), relayAgent: path14.join(context.pluginRoot, "server/agent-cli.js"), originalIcon: true });
    manifest.activationBlocked = true;
    manifest.binaryHash = await digest(manifest.binary);
    const compatibility = await verify(manifest);
    await add("versions", "\u684C\u9762\u4E0E CLI \u7248\u672C", "passed", `${compatibility?.desktopVersion || "\u5F53\u524D\u684C\u9762\u7248\u672C"} / ${compatibility?.cliVersion || "\u5F53\u524D CLI \u7248\u672C"}\uFF0C\u6EE1\u8DB3\u6700\u4F4E\u542F\u52A8\u5668\u517C\u5BB9\u8981\u6C42\uFF1B\u684C\u9762\u5DE5\u5177\u9700\u5355\u72EC\u9A8C\u6536`);
  } catch {
    manifest = null;
    await add("versions", "\u684C\u9762\u4E0E CLI \u7248\u672C", "blocked", "\u684C\u9762\u3001CLI \u6216\u5B89\u88C5\u8DEF\u5F84\u4E0D\u7B26\u5408\u5F53\u524D\u542F\u52A8\u5668\u8981\u6C42\uFF0C\u8BF7\u66F4\u65B0\u517C\u5BB9\u5B9E\u73B0\u540E\u91CD\u65B0\u68C0\u67E5");
  }
  const config = environment.service.configStore.get();
  const cwd = config.codex.defaultWorkingDirectory;
  const directories = [context.codexHome, ...cwd ? [cwd] : []];
  const directoriesReady = await Promise.all(directories.map((directory) => fs10.stat(directory).then((stat) => stat.isDirectory(), () => false)));
  await add("directories", "\u6570\u636E\u4E0E\u5DE5\u4F5C\u76EE\u5F55", directoriesReady.every(Boolean) ? "passed" : "blocked", directoriesReady.every(Boolean) ? "\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D Codex \u6570\u636E\u76EE\u5F55\uFF1B\u51C6\u5907\u8FC7\u7A0B\u4E0D\u4FEE\u6539\u4EFB\u52A1\u5386\u53F2" : "Codex \u6570\u636E\u76EE\u5F55\u6216\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u5B58\u5728");
  const spaceReady = await fs10.statfs(path14.join(context.configDir, "migration")).then((stat) => stat.bavail * stat.bsize >= 64 * 1024 * 1024, () => false);
  await add("space", "\u51C6\u5907\u5305\u7A7A\u95F4", spaceReady ? "passed" : "blocked", spaceReady ? "\u51C6\u5907\u76EE\u5F55\u81F3\u5C11\u6709 64 MB \u53EF\u7528\u7A7A\u95F4\uFF1B\u6B63\u5F0F\u5386\u53F2\u5907\u4EFD\u9700\u53E6\u884C\u68C0\u67E5" : "\u65E0\u6CD5\u786E\u8BA4\u51C6\u5907\u76EE\u5F55\u7A7A\u95F4\uFF0C\u6216\u53EF\u7528\u7A7A\u95F4\u4E0D\u8DB3 64 MB");
  const related = env.processes.items.filter((item) => item.scope !== "other");
  await add("processes", "\u8FD0\u884C\u4E2D\u7684\u5BA2\u6237\u7AEF", env.processes.state === "ok" ? "warning" : "blocked", env.processes.state === "ok" ? `\u68C0\u6D4B\u5230 ${related.length} \u4E2A\u76F8\u5173\u8FDB\u7A0B\u3002\u51C6\u5907\u53EF\u7EE7\u7EED\uFF1B\u6B63\u5F0F\u5207\u6362\u524D\u9700\u7ED3\u675F\u4EFB\u52A1\u5E76\u91CD\u65B0\u68C0\u67E5\u5360\u7528` : "\u65E0\u6CD5\u786E\u8BA4\u8FDB\u7A0B\u5360\u7528\uFF0C\u6B63\u5F0F\u5207\u6362\u524D\u5FC5\u987B\u91CD\u65B0\u68C0\u67E5", "activation");
  const failedTools = env.migration.last?.failedPhase === "verifying_shared_runtime";
  await add("desktop_tools", "\u684C\u9762\u5DE5\u5177\u517C\u5BB9\u6027", env.desktopTools?.state === "passed" ? "passed" : "blocked", env.desktopTools?.message || (failedTools ? "\u4E0A\u6B21\u684C\u9762\u5DE5\u5177\u9A8C\u6536\u5931\u8D25\uFF0C\u9700\u5148\u89E3\u51B3\u7B7E\u540D\u6216\u5DE5\u5177\u8FDE\u63A5\u517C\u5BB9\u95EE\u9898" : "\u5C1A\u672A\u901A\u8FC7\u771F\u5B9E\u684C\u9762\u5DE5\u5177\u9A8C\u6536\uFF0C\u7248\u672C\u5339\u914D\u4E0D\u80FD\u8BC1\u660E\u4E24\u7AEF\u5171\u7528\u53EF\u7528"), "activation");
  await add("activation", "\u6B63\u5F0F\u5207\u6362", "blocked", "\u672C\u51C6\u5907\u5305\u5C1A\u4E0D\u5141\u8BB8\u6FC0\u6D3B\uFF1B\u51C6\u5907\u5B8C\u6210\u540E\u4ECD\u987B\u89E3\u51B3\u5207\u6362\u963B\u585E\u5E76\u5B8C\u6210\u771F\u5B9E\u684C\u9762\u9A8C\u6536", "activation");
  const readyToPrepare = checks.every((check) => check.scope !== "prepare" || check.state !== "blocked");
  return { report: { checkedAt: (/* @__PURE__ */ new Date()).toISOString(), checks, readyToPrepare, readyToActivate: false }, manifest, fingerprint };
}

// server/shared-backend-prepare.js
import fs11 from "node:fs/promises";
import path15 from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
async function prepareSharedBackend(manifest, production, { checkpoint = async () => {
}, verify = checkCompatibility } = {}) {
  await checkpoint();
  await verify(manifest);
  if (await fs11.lstat(manifest.root).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) {
    throw new Error("\u51C6\u5907\u5305\u76EE\u5F55\u5DF2\u5B58\u5728\uFF0C\u8BF7\u521B\u5EFA\u65B0\u7684\u51C6\u5907\u5305\uFF0C\u539F\u76EE\u5F55\u4FDD\u6301\u4E0D\u53D8");
  }
  const installed = JSON.parse(await fs11.readFile(path15.join(manifest.pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  if (installed.name !== "codex-relay-plugin") throw new Error("\u76EE\u6807\u76EE\u5F55\u4E0D\u662F codex-relay-plugin");
  const bundle = path15.join(production, "server/shared-backend-cli.js");
  const bundleHash = await digest(bundle);
  const stage = `${manifest.root}.preparing-${randomUUID2().slice(0, 8)}`;
  await fs11.mkdir(stage, { recursive: false, mode: 448 });
  try {
    await fs11.copyFile(bundle, path15.join(stage, "shared-backend-cli.js"));
    await fs11.writeFile(path15.join(stage, "package.json"), '{"type":"module"}\n', { mode: 384 });
    await fs11.cp(production, path15.join(stage, "plugin"), { recursive: true, filter: async () => {
      await checkpoint();
      return true;
    } });
    await writePrivate(path15.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`);
    const command = (operation) => `${shellQuote(manifest.node)} ${shellQuote(path15.join(manifest.root, "shared-backend-cli.js"))} ${operation} --manifest ${shellQuote(path15.join(manifest.root, "manifest.json"))}`;
    await fs11.writeFile(path15.join(stage, "codex-proxy"), `#!/bin/sh
exec ${command("proxy")} "$@"
`, { mode: 448 });
    for (const [name, action] of [["\u542F\u7528\u5171\u4EAB\u540E\u7AEF.command", "activate"], ["\u6062\u590D\u72EC\u7ACB\u540E\u7AEF.command", "rollback"], ["\u67E5\u770B\u5171\u4EAB\u72B6\u6001.command", "status"]]) {
      await fs11.writeFile(path15.join(stage, name), `#!/bin/sh
${command(action)}
result=$?
printf '\\n\u6309\u56DE\u8F66\u5173\u95ED\u7A97\u53E3\u2026'
read -r reply
exit "$result"
`, { mode: 448 });
    }
    const app = path15.join(stage, "Codex Shared.app/Contents");
    await fs11.mkdir(path15.join(app, "MacOS"), { recursive: true });
    await fs11.writeFile(path15.join(app, "Info.plist"), plist({ CFBundleIdentifier: "com.recodex.shared-launcher", CFBundleName: "Codex Shared", CFBundleExecutable: "launch", CFBundlePackageType: "APPL", CFBundleVersion: "1", LSUIElement: true }));
    await fs11.writeFile(path15.join(app, "MacOS/launch"), `#!/bin/sh
${command("desktop")} >> ${shellQuote(path15.join(manifest.root, "launcher.log"))} 2>&1
result=$?
if [ "$result" -ne 0 ]; then
  /usr/bin/osascript -e 'display alert "Codex Shared \u672A\u80FD\u542F\u52A8" message "\u8BF7\u5148\u68C0\u67E5\u51C6\u5907\u5305\u7684\u517C\u5BB9\u6027\u4E0E\u5171\u4EAB\u670D\u52A1\u72B6\u6001\uFF1B\u8BE6\u7EC6\u539F\u56E0\u89C1 launcher.log\u3002" as critical'
fi
exit "$result"
`, { mode: 448 });
    await writePrivate(path15.join(stage, "\u4F7F\u7528\u8BF4\u660E.txt"), `\u51C6\u5907\u5B8C\u6210\uFF0C\u5C1A\u672A\u5207\u6362\u3002

\u51C6\u5907\u5305\u4E0D\u4F1A\u4FEE\u6539\u5F53\u524D\u8FDE\u63A5\u3001\u7ED3\u675F\u8FDB\u7A0B\u6216\u590D\u5236\u4EFB\u52A1\u5386\u53F2\u3002
\u684C\u9762\u4E0E CLI \u7248\u672C\u5339\u914D\u4E0D\u4EE3\u8868\u684C\u9762\u5DE5\u5177\u7684\u7B7E\u540D\u517C\u5BB9\u6027\u5DF2\u901A\u8FC7\u3002\u8BF7\u5148\u89E3\u51B3\u63A7\u5236\u53F0\u68C0\u67E5\u62A5\u544A\u4E2D\u7684\u5207\u6362\u963B\u585E\uFF0C\u518D\u8FDB\u884C\u6B63\u5F0F\u9A8C\u6536\u3002
\u542F\u7528\u811A\u672C\u4F1A\u68C0\u67E5\u5360\u7528\uFF0C\u5907\u4EFD\u5386\u53F2\u3001\u914D\u7F6E\u4E0E\u63D2\u4EF6\uFF0C\u7136\u540E\u542F\u52A8\u5171\u4EAB\u670D\u52A1\u3002\u56DE\u6EDA\u53EA\u6062\u590D\u8FDE\u63A5\u8BBE\u7F6E\u4E0E\u672C\u6B21\u66FF\u6362\u7684\u63D2\u4EF6\uFF0C\u4FDD\u7559\u65B0\u4EFB\u52A1\u5386\u53F2\u3002
\u539F\u684C\u9762\u56FE\u6807\u542F\u52A8\uFF1A${manifest.originalIcon ? "\u542F\u7528\u540E\u4FDD\u6301\u539F\u56FE\u6807" : "\u4F7F\u7528 Codex Shared.app"}
CODEX_HOME\uFF1A${manifest.codexHome}
\u5171\u4EAB\u7AEF\u70B9\uFF1A${manifest.endpoint}
`);
    await checkpoint();
    if (await digest(bundle) !== bundleHash || await digest(path15.join(stage, "shared-backend-cli.js")) !== bundleHash) throw new Error("\u51C6\u5907\u671F\u95F4\u63D2\u4EF6\u6784\u5EFA\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
    await verify(manifest);
    await checkpoint();
    await fs11.rename(stage, manifest.root);
    return { root: manifest.root, endpoint: manifest.endpoint, codexHome: manifest.codexHome, createdAt: (/* @__PURE__ */ new Date()).toISOString(), activated: false };
  } finally {
    await fs11.rm(stage, { recursive: true, force: true });
  }
}

// server/shared-runtime-repair.js
import fs12 from "node:fs/promises";
import path16 from "node:path";
import { execFile as execFile6 } from "node:child_process";
import { promisify as promisify6 } from "node:util";
var exec5 = promisify6(execFile6);
var quiet2 = { info() {
}, warn() {
}, error() {
} };
var pause = () => new Promise((resolve) => setTimeout(resolve, 1e3));
async function sharedTasksIdle(client) {
  let cursor;
  const seen = /* @__PURE__ */ new Set();
  do {
    const result = await client.request("thread/loaded/list", { limit: 100, ...cursor ? { cursor } : {} }, 3e3);
    if (!Array.isArray(result.data)) return false;
    for (const threadId of result.data) {
      const { thread } = await client.request("thread/read", { threadId, includeTurns: false }, 3e3);
      if (!["idle", "notLoaded"].includes(thread?.status?.type)) return false;
    }
    cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) return false;
    seen.add(cursor);
  } while (cursor);
  return true;
}
async function repairSharedRuntime(environment, { checkpoint = async () => {
}, onProgress = async () => {
}, timeoutMs = 15 * 6e4, restart = replaceRuntime } = {}) {
  const manifest = await configuredSharedManifest(environment);
  if (!manifest || (await readJson(path16.join(manifest.root, "activation.json"), null))?.phase !== "active") throw new Error("\u672A\u627E\u5230\u5F53\u524D\u5DF2\u542F\u7528\u7684\u5171\u4EAB\u5B89\u88C5");
  await verifyOfficialRuntime(manifest.desktopApp);
  await checkCompatibility(manifest);
  const runtime = await ownedRuntime(manifest);
  if (!runtime) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u5171\u4EAB\u8FDB\u7A0B\u5F52\u5C5E\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u73AF\u5883");
  const client = new AppServerClient({ get: () => ({ codex: { connectionMode: "shared", appServerEndpoint: manifest.endpoint } }) }, quiet2, { initializeTimeoutMs: 3e3 });
  const deadline = Date.now() + timeoutMs;
  try {
    await client.start();
    while (Date.now() < deadline) {
      await checkpoint();
      const current = await configuredSharedManifest(environment);
      if (current?.root !== manifest.root || (await ownedRuntime(manifest))?.identity !== runtime.identity) throw new Error("\u5171\u4EAB\u5B89\u88C5\u6216\u8FDB\u7A0B\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
      const processes = await environment.inspectProcesses();
      if (processes.state !== "ok") throw new Error("\u65E0\u6CD5\u786E\u8BA4\u684C\u9762\u662F\u5426\u9000\u51FA\uFF0C\u5DF2\u505C\u6B62\u4FEE\u590D");
      if (processes.items.some((p) => p.kind === "desktop" && p.scope !== "other")) {
        await onProgress("\u7B49\u5F85\u9000\u51FA Codex \u684C\u9762\uFF1B\u9000\u51FA\u540E\u81EA\u52A8\u4FEE\u590D\u5E76\u91CD\u65B0\u6253\u5F00\u3002\u8BF7\u52FF\u4ECE Flutter \u53D1\u8D77\u65B0\u4EFB\u52A1\uFF0C\u53EF\u968F\u65F6\u53D6\u6D88\u3002");
      } else if (!await sharedTasksIdle(client)) {
        await onProgress("\u7B49\u5F85\u5171\u4EAB\u4EFB\u52A1\u5B8C\u6210\uFF1B\u4E0D\u4F1A\u4E2D\u65AD\u6267\u884C\u3001\u5F85\u5BA1\u6279\u6216\u5F85\u56DE\u590D\u7684\u4EFB\u52A1\u3002");
      } else {
        await checkpoint();
        const config = await readJson(manifest.relayConfig);
        if (config.codex?.connectionMode !== "shared" || config.codex.appServerEndpoint !== manifest.endpoint) throw new Error("\u8FDE\u63A5\u914D\u7F6E\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u4FEE\u590D");
        await onProgress("\u6B63\u5728\u5207\u6362\u5230\u5B98\u65B9\u7B7E\u540D\u8FD0\u884C\u65F6\uFF1B\u5B8C\u6210\u540E\u81EA\u52A8\u91CD\u65B0\u6253\u5F00\u684C\u9762\u3002", { committing: true });
        await checkpoint();
        await restart(manifest, environment.pluginRoot, runtime);
        return;
      }
      await pause();
    }
    throw new Error("\u7B49\u5F85\u9000\u51FA\u684C\u9762\u5DF2\u8D85\u65F6\uFF0C\u672A\u91CD\u542F\u5171\u4EAB\u670D\u52A1\uFF1B\u53EF\u91CD\u65B0\u63D0\u4EA4\u4FEE\u590D");
  } finally {
    await client.stop().catch(() => {
    });
  }
}
async function replaceRuntime(manifest, pluginRoot, expectedRuntime, dependencies = {}) {
  const run = dependencies.exec || exec5;
  const owned = dependencies.ownedRuntime || ownedRuntime;
  const ready = dependencies.waitReady || waitReady;
  const open = dependencies.openDesktop || openDesktop;
  const domain = `gui/${process.getuid()}`;
  const target = `${domain}/${manifest.label}`;
  const definition = JSON.parse((await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", manifest.launchAgent])).stdout);
  const expectedArgs = serviceDefinition(manifest).ProgramArguments.slice(1);
  if (definition.Label !== manifest.label || JSON.stringify(definition.ProgramArguments?.slice(1)) !== JSON.stringify(expectedArgs)) throw new Error("\u5171\u4EAB\u670D\u52A1\u5B9A\u4E49\u5DF2\u6539\u53D8\uFF0C\u62D2\u7EDD\u8986\u76D6");
  if ((await owned(manifest))?.identity !== expectedRuntime.identity) throw new Error("\u5171\u4EAB\u8FDB\u7A0B\u5DF2\u6539\u53D8\uFF0C\u5DF2\u505C\u6B62\u4FEE\u590D");
  const job = (await run("/bin/launchctl", ["print", target])).stdout;
  const parent = (await run("/bin/ps", ["-p", String(expectedRuntime.pid), "-o", "ppid="])).stdout.trim();
  if (!/^\d+$/.test(parent) || job.match(/^\s*pid = (\d+)\s*$/m)?.[1] !== parent) throw new Error("\u5171\u4EAB\u8FDB\u7A0B\u4E0D\u5C5E\u4E8E\u5F53\u524D\u6CE8\u518C\u670D\u52A1\uFF0C\u62D2\u7EDD\u505C\u6B62\u5176\u4ED6\u8FDB\u7A0B");
  const repaired = { ...manifest, node: officialNode(manifest.desktopApp) };
  const cli = path16.join(manifest.root, "shared-backend-cli.js");
  const manifestFile = path16.join(manifest.root, "manifest.json");
  const proxy = path16.join(manifest.root, "codex-proxy");
  const files = [manifestFile, cli, proxy, manifest.launchAgent];
  const backup = path16.join(manifest.root, "backups", `runtime-${Date.now()}`);
  await fs12.mkdir(backup, { recursive: true, mode: 448 });
  for (const file of files) await fs12.copyFile(file, path16.join(backup, path16.basename(file)));
  let stopped = false;
  const stop = async () => {
    await run("/bin/launchctl", ["bootout", target]);
    const deadline = Date.now() + 1e4;
    while (await owned(manifest)) {
      if (Date.now() > deadline) throw new Error("\u5171\u4EAB\u670D\u52A1\u505C\u6B62\u8D85\u65F6\uFF0C\u672A\u542F\u52A8\u7B2C\u4E8C\u4E2A\u540E\u7AEF");
      await pause();
    }
  };
  try {
    await stop();
    stopped = true;
    await writePrivate(cli, await fs12.readFile(path16.join(pluginRoot, "server/shared-backend-cli.js")));
    await writePrivate(manifestFile, `${JSON.stringify(repaired, null, 2)}
`);
    await writePrivate(proxy, `#!/bin/sh
exec ${shellQuote(repaired.node)} ${shellQuote(cli)} proxy --manifest ${shellQuote(manifestFile)} "$@"
`);
    await fs12.chmod(proxy, 448);
    await writePrivate(manifest.launchAgent, plist(serviceDefinition(repaired)));
    await run("/bin/launchctl", ["bootstrap", domain, manifest.launchAgent]);
    await ready(repaired);
    await open(repaired);
  } catch (error) {
    if (stopped) {
      const loaded = await run("/bin/launchctl", ["print", target]).then(() => true, () => false);
      if (loaded) await stop();
      for (const file of files) await fs12.copyFile(path16.join(backup, path16.basename(file)), file);
      await fs12.chmod(proxy, 448);
      await run("/bin/launchctl", ["bootstrap", domain, manifest.launchAgent]);
      await ready(manifest);
      await open(manifest);
    }
    throw error;
  }
}

// server/migration-preparation.js
var exec6 = promisify7(execFile7);
var UUID2 = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
var iso = () => (/* @__PURE__ */ new Date()).toISOString();
var exists = (file) => fs13.access(file).then(() => true, () => false);
var STARTUP_TOOL_STATES = /* @__PURE__ */ new Set(["no_desktop", "no_pipe", "shared_unloaded", "shared_failed", "shared_timeout"]);
async function verifyDesktopAfterRepair(environment, { verify = verifyDesktopCompatibility, checkpoint = async () => {
}, delay = () => new Promise((resolve) => setTimeout(resolve, 500)), onProgress = async () => {
} } = {}) {
  const deadline = Date.now() + 6e4;
  let proof;
  for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
    await checkpoint();
    proof = await verify(environment, { checkpoint, timeoutMs: Math.min(2e4, deadline - Date.now()) });
    if (proof.state === "passed" || !STARTUP_TOOL_STATES.has(proof.code) || attempt === 2) return proof;
    await onProgress("\u684C\u9762\u5DF2\u91CD\u65B0\u6253\u5F00\uFF0C\u5DE5\u5177\u76EE\u5F55\u4ECD\u5728\u521D\u59CB\u5316\uFF0C\u6B63\u5728\u590D\u67E5\u2026");
    await delay();
  }
  return proof;
}
var identity2 = async (pid) => exec6("/bin/ps", ["-p", String(pid), "-o", "lstart=,comm="], { timeout: 2e3, maxBuffer: 4096 }).then((result) => result.stdout.trim(), () => "");
var jobPath = (root, id2) => {
  if (!UUID2.test(id2 || "")) throw new RelayError("INVALID_JOB", "\u51C6\u5907\u4EFB\u52A1\u7F16\u53F7\u65E0\u6548");
  return path17.join(root, "jobs", `${id2}.json`);
};
async function runPreparationJob(configDir2, id2, { createEnvironment, inspect = inspectPreparation, prepare = prepareSharedBackend, fingerprint = preparationFingerprint, verify = checkCompatibility, verifyDesktop = verifyDesktopCompatibility, repairRuntime = repairSharedRuntime } = {}) {
  const root = path17.join(configDir2, "migration");
  const file = jobPath(root, id2);
  const lock = new InstanceLock(root, "worker.lock");
  await lock.acquire();
  let record;
  let timer;
  let writes = Promise.resolve();
  const save = () => {
    record.updatedAt = iso();
    const text2 = JSON.stringify(record);
    writes = writes.then(() => writePrivate(file, text2));
    return writes;
  };
  const checkpoint = async () => {
    if (await exists(`${file}.cancel`)) throw new RelayError("PREPARATION_CANCELLED", "\u5DF2\u53D6\u6D88\u51C6\u5907\uFF0C\u5F53\u524D\u8FDE\u63A5\u4FDD\u6301\u4E0D\u53D8");
  };
  try {
    record = await readJson(file);
    if (record.phase !== "queued" || record.context.configDir !== configDir2) {
      record = null;
      return;
    }
    record.owner = { pid: process.pid, identity: await identity2(process.pid) };
    record.phase = "checking";
    record.step = "\u68C0\u67E5\u8FC1\u79FB\u6761\u4EF6";
    await save();
    timer = setInterval(() => {
      void save().catch(() => {
      });
    }, 2e3);
    await checkpoint();
    const environment = await createEnvironment(record.context);
    if (record.operation === "repair-runtime") {
      await repairRuntime(environment, { checkpoint, onProgress: async (step, progress) => {
        record.step = step;
        if (progress?.committing) record.phase = "restarting";
        await save();
      } });
      record.step = "\u5171\u4EAB\u670D\u52A1\u5DF2\u91CD\u542F\uFF0C\u7B49\u5F85\u684C\u9762\u5DE5\u5177\u8FDE\u63A5";
      await save();
      const deadline = Date.now() + 3e4;
      while (Date.now() < deadline) {
        const target = await desktopTarget(environment);
        if (target?.pipe && target.serviceRuntime === "official") break;
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
    if (["verify-desktop", "repair-runtime"].includes(record.operation)) {
      record.step = "\u9A8C\u8BC1\u5B98\u65B9\u8FD0\u884C\u65F6\u7B7E\u540D\u4E0E\u771F\u5B9E\u684C\u9762\u5DE5\u5177\u76EE\u5F55";
      await save();
      const proof = record.operation === "repair-runtime" ? await verifyDesktopAfterRepair(environment, { verify: verifyDesktop, checkpoint, onProgress: async (step) => {
        record.step = step;
        await save();
      } }) : await verifyDesktop(environment, { checkpoint });
      await checkpoint();
      record.report = { scope: proof.scope, code: proof.code, checkedAt: proof.checkedAt, readyToPrepare: false, readyToActivate: false, checks: [
        { id: "signature", title: "\u5B98\u65B9\u8FD0\u884C\u65F6\u7B7E\u540D", state: proof.runtime?.verified ? "passed" : proof.code === "invalid_signature" ? "blocked" : "unchecked", detail: proof.runtime?.verified ? "\u5B98\u65B9\u8FD0\u884C\u65F6\u7B7E\u540D\u6709\u6548" : proof.code === "invalid_signature" ? "\u8FD0\u884C\u65F6\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5B98\u65B9\u5B89\u88C5" : "\u5C1A\u672A\u6267\u884C\u7B7E\u540D\u68C0\u67E5\uFF0C\u4E0D\u4EE3\u8868\u7B7E\u540D\u65E0\u6548", scope: "diagnostic" },
        { id: "desktop_tools", title: "\u771F\u5B9E\u684C\u9762\u5DE5\u5177\u76EE\u5F55", state: proof.state, detail: proof.message, scope: "diagnostic" }
      ] };
      record.phase = proof.state === "passed" ? "complete" : "blocked";
      record.step = proof.state === "passed" ? "\u5DE5\u5177\u76EE\u5F55\u68C0\u67E5\u901A\u8FC7\uFF1B\u5177\u4F53\u5DE5\u5177\u8C03\u7528\u9700\u5728\u4EFB\u52A1\u4E2D\u9A8C\u8BC1" : "\u684C\u9762\u5DE5\u5177\u68C0\u67E5\u5B58\u5728\u5F85\u5904\u7406\u9879\uFF1B\u4E0D\u4EE3\u8868\u6D88\u606F\u6267\u884C\u5931\u8D25";
      return;
    }
    const result = await inspect(record.context, { environment, checkpoint, onProgress: async (report) => {
      record.report = report;
      record.step = report.checks.at(-1)?.title || record.step;
      await save();
    } });
    record.report = result.report;
    await checkpoint();
    if (!result.report.readyToPrepare) {
      record.phase = "blocked";
      record.step = "\u8BF7\u5148\u89E3\u51B3\u51C6\u5907\u6761\u4EF6";
    } else if (record.operation === "check") {
      record.phase = "complete";
      record.step = "\u68C0\u67E5\u5B8C\u6210\uFF0C\u4ECD\u6709\u6B63\u5F0F\u5207\u6362\u963B\u585E";
    } else {
      if (!result.manifest || !result.fingerprint) throw new Error("Preparation inputs missing");
      record.phase = "packaging";
      record.step = "\u751F\u6210\u8FC1\u79FB\u51C6\u5907\u5305";
      await save();
      await fs13.mkdir(path17.dirname(record.context.packageRoot), { recursive: true, mode: 448 });
      const assertUnchanged = async () => {
        await checkpoint();
        if (await fingerprint(record.context) !== result.fingerprint) throw new RelayError("PREPARATION_CHANGED", "\u51C6\u5907\u671F\u95F4\u914D\u7F6E\u6216\u63D2\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
      };
      await assertUnchanged();
      record.artifact = await prepare(result.manifest, record.context.pluginRoot, { checkpoint, verify: async (manifest) => {
        await assertUnchanged();
        await verify(manifest);
      } });
      await writePrivate(path17.join(root, "prepared.json"), JSON.stringify({ id: id2, fingerprint: result.fingerprint, artifact: record.artifact }));
      record.phase = "complete";
      record.step = "\u51C6\u5907\u5305\u5DF2\u751F\u6210\uFF0C\u5C1A\u672A\u5207\u6362";
    }
  } catch (error) {
    if (!record) throw error;
    record.phase = error.code === "PREPARATION_CANCELLED" ? "cancelled" : "failed";
    record.error = ["PREPARATION_CANCELLED", "PREPARATION_CHANGED"].includes(error.code) ? error.message : record.operation === "repair-runtime" ? "\u5171\u4EAB\u8FD0\u884C\u65F6\u4FEE\u590D\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u5F53\u524D\u670D\u52A1\u72B6\u6001\u540E\u91CD\u8BD5\uFF1B\u73B0\u6709\u5386\u53F2\u548C\u8FDE\u63A5\u914D\u7F6E\u5DF2\u4FDD\u7559" : "\u8FC1\u79FB\u51C6\u5907\u5931\u8D25\uFF0C\u53EF\u91CD\u65B0\u68C0\u67E5\u540E\u91CD\u8BD5\uFF1B\u5F53\u524D\u8FDE\u63A5\u672A\u88AB\u5207\u6362";
    record.step = record.phase === "cancelled" ? "\u51C6\u5907\u5DF2\u53D6\u6D88" : "\u51C6\u5907\u672A\u5B8C\u6210";
  } finally {
    clearInterval(timer);
    try {
      if (record) {
        record.finishedAt = iso();
        await save();
      }
    } finally {
      await lock.release();
    }
  }
}

// server/migration-cli.js
var [configFlag, configDir, jobFlag, id] = process.argv.slice(2);
try {
  if (configFlag !== "--config-dir" || jobFlag !== "--job-id" || !path18.isAbsolute(configDir || "")) throw new Error("Invalid preparation arguments");
  await runPreparationJob(configDir, id, { createEnvironment: async (context) => {
    const configStore = new ConfigStore({ configDir });
    await configStore.load();
    const service = { configStore, status: async () => ({ appServer: {}, relay: {} }) };
    return new EnvironmentService(service, { pluginRoot: context.pluginRoot, sharedRoot: context.sharedRoot, env: { ...process.env, CODEX_HOME: context.codexHome } });
  } });
} catch {
  process.exitCode = 1;
}
