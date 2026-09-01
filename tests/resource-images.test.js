import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { imageDataUrl, parseImageDataUrl, prepareEventImages } from "../server/resource-images.js";

test("parses image data URLs and rejects non-image data", () => {
  const value = imageDataUrl("image/png", Buffer.from("png-bytes"));
  assert.deepEqual(parseImageDataUrl(value), { mime: "image/png", bytes: Buffer.from("png-bytes") });
  assert.equal(parseImageDataUrl("data:text/plain;base64,dGVzdA=="), null);
  assert.equal(parseImageDataUrl("https://example.com/image.png"), null);
});

test("replaces inline image bytes with thumbnail and controlled resource metadata", async () => {
  const source = imageDataUrl("image/png", Buffer.from("small-image"));
  const event = { type: "item.completed", data: { type: "image", dataUrl: source } };
  const uploads = [];
  const prepared = await prepareEventImages(event, async (input) => {
    uploads.push(input);
    return { resourceUrl: "https://relay.example/api/resources/opaque", expiresAt: "2030-01-01T00:00:00Z" };
  });
  assert.equal(uploads.length, 1);
  assert.equal(prepared.data.type, "image");
  assert.equal(prepared.data.resourceUrl, "https://relay.example/api/resources/opaque");
  assert.equal(prepared.data.expiresAt, "2030-01-01T00:00:00Z");
  assert.equal(prepared.data.dataUrl, undefined);
  assert.match(prepared.data.thumbnailDataUrl, /^data:image\/png;base64,/);
});

test("uploads an allowed temporary image path without leaking the local path", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-image-test-"));
  const file = path.join(directory, "capture.png");
  await fs.writeFile(file, Buffer.from("temporary-image"));
  try {
    let uploaded;
    const prepared = await prepareEventImages(
      { type: "image", path: file },
      async (input) => {
        uploaded = input;
        return { resourceUrl: "https://relay.example/api/resources/local", expiresAt: "2030-01-01T00:00:00Z" };
      },
    );
    assert.equal(prepared.path, "https://relay.example/api/resources/local");
    assert.equal(uploaded.mime, "image/png");
    assert.equal(uploaded.bytes.toString(), "temporary-image");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
