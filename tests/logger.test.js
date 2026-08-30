import assert from "node:assert/strict";
import test from "node:test";
import { Logger } from "../server/logger.js";

test("logger redacts secrets in messages and structured metadata", () => {
  const logger = new Logger();
  const entry = logger.error("relay", "authorization=Bearer-secret", {
    token: "top-secret",
    endpointGrant: "grant-secret",
    authorization: "Bearer abc.def",
  });
  assert.doesNotMatch(entry.message, /Bearer-secret/);
  assert.doesNotMatch(JSON.stringify(entry.data), /top-secret|grant-secret|abc\.def/);
});
