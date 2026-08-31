import assert from "node:assert/strict";
import test from "node:test";

import {
  createReleaseVersion,
  formatUtcTimestamp,
  updateManifestSource,
} from "../scripts/update-version.mjs";

test("formats cachebuster timestamps in UTC", () => {
  const date = new Date("2026-08-31T01:02:03.000Z");
  assert.equal(formatUtcTimestamp(date), "20260831010203");
});

test("preserves the semantic version and replaces old build metadata", () => {
  assert.equal(
    createReleaseVersion("1.2.3-beta.1+codex.previous", "20260831010203"),
    "1.2.3-beta.1+codex.20260831010203",
  );
});

test("adds a cachebuster when the manifest has no build metadata", () => {
  assert.equal(createReleaseVersion("1.0.0", "20260831010203"), "1.0.0+codex.20260831010203");
});

test("advances repeated publishes in the same second", () => {
  assert.equal(
    createReleaseVersion("1.0.0+codex.20260831010203", "20260831010203"),
    "1.0.0+codex.20260831010204",
  );
});

test("updates only the manifest version and keeps valid JSON", () => {
  const source = '{\n  "name": "codex-relay-plugin",\n  "version": "1.0.0+codex.old",\n  "description": "\\u6d4b\\u8bd5"\n}\n';
  const result = updateManifestSource(source, "20260831010203");

  assert.equal(result.nextVersion, "1.0.0+codex.20260831010203");
  assert.match(result.source, /"version": "1\.0\.0\+codex\.20260831010203"/);
  assert.match(result.source, /"description": "\\u6d4b\\u8bd5"/);
  assert.doesNotThrow(() => JSON.parse(result.source));
});

test("rejects malformed timestamps", () => {
  assert.throws(
    () => createReleaseVersion("1.0.0", "20260831999999"),
    /不是有效的 UTC 时间/,
  );
});
