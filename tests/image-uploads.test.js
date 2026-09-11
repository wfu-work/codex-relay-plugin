import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { ImageUploads, IMAGE_INPUT_LIMITS } from "../server/image-uploads.js";
import { CommandRouter } from "../server/command-router.js";
import { defaultConfig } from "../server/config-store.js";
import { AppServerClient } from "../server/app-server-client.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=", "base64");
const id = "image_test_0123456789";
const definition = bytes => ({ uploadId: id, mime: "image/png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-images-test-"));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  return { directory, store: new ImageUploads(directory) };
}

test("interrupted uploads resume across processes and repeated chunks do not corrupt the image", async t => {
  const { directory, store } = await setup(t);
  const context = { cwd: "/project", threadId: "thread-1" };
  await store.begin(definition(png), "phone", context);
  const first = { uploadId: id, offset: 0, data: png.subarray(0, 32).toString("base64") };
  await store.append(first, "phone");
  const resumed = new ImageUploads(directory);
  assert.equal((await resumed.begin(definition(png), "phone", context)).offset, 32);
  await resumed.append(first, "phone");
  await resumed.append({ uploadId: id, offset: 32, data: png.subarray(32).toString("base64") }, "phone");
  assert.equal((await resumed.finish(id, "phone")).attachmentId, id);
  await resumed.finish(id, "phone");
  await assert.rejects(resumed.resolve([id], "other-phone", context), { code: "IMAGE_ACCESS_DENIED" });
  await assert.rejects(resumed.resolve([id], "phone", { cwd: "/other", threadId: "thread-1" }), { code: "INVALID_IMAGE" });
  await assert.rejects(resumed.resolve([id], "phone", { cwd: "/project", threadId: "thread-2" }), { code: "INVALID_IMAGE" });
  const inputs = await resumed.resolve([id], "phone", context);
  assert.deepEqual(await fs.readFile(inputs[0].path), png);
  assert.equal((await resumed.remove(id, "phone")).removed, false, "sent pictures remain available in desktop history");
});

test("rejects invalid content, oversized frames, traversal and abandoned uploads can be removed", async t => {
  const { store } = await setup(t);
  await assert.rejects(store.begin({ ...definition(png), uploadId: "../../etc" }, "phone", { cwd: "/p" }), { code: "INVALID_IMAGE" });
  await assert.rejects(store.begin({ ...definition(png), size: IMAGE_INPUT_LIMITS.maxBytes + 1 }, "phone", { cwd: "/p" }), { code: "INVALID_IMAGE" });
  await store.begin(definition(png), "phone", { cwd: "/p" });
  await assert.rejects(store.append({ uploadId: id, offset: 0, data: "A".repeat(140000) }, "phone"), { code: "INVALID_IMAGE" });
  await assert.rejects(store.append({ uploadId: id, offset: 10, data: "YWJj" }, "phone"), { code: "INVALID_IMAGE" });
  await assert.rejects(store.finish(id, "phone"), { code: "INVALID_IMAGE" });
  assert.equal((await store.remove(id, "phone")).removed, true);
  const fake = Buffer.alloc(png.length, 65);
  await store.begin(definition(fake), "phone", { cwd: "/p" });
  await store.append({ uploadId: id, offset: 0, data: fake.toString("base64") }, "phone");
  await assert.rejects(store.finish(id, "phone"), { code: "INVALID_IMAGE" });
});

test("remote image commands enforce permissions and deliver localImage inputs exactly once", async t => {
  const { directory } = await setup(t);
  const config = defaultConfig();
  config.relay.spaceId = "s";
  config.relay.endpointId = "h";
  config.allowedProjects = ["/project"];
  const calls = [];
  const appServer = new AppServerClient({ get: () => config }, { warn() {} });
  appServer.start = async () => {};
  appServer.isShared = () => false;
  appServer.readThread = async threadId => ({ thread: { id: threadId, cwd: "/project" } });
  appServer.readThreadSnapshot = appServer.readThread;
  appServer.readThreadStatusSnapshot = appServer.readThread;
  appServer.request = async (method, params) => { calls.push({ method, params }); return { turn: { id: "t" } }; };
  const router = new CommandRouter({ configStore: { configDir: directory, get: () => config }, appServer, service: {}, logger: { warn() {} } });
  let counter = 0;
  const envelope = command => ({ version: 1, type: "codex.command", requestId: `r-${++counter}`, timestamp: new Date().toISOString(), deviceId: "phone", targetDeviceId: "h", spaceId: "s", command });
  const send = command => router.handle(envelope(command));
  const begin = { type: "image.upload.begin", ...definition(png), cwd: "/project" };
  config.readOnly = true;
  assert.equal((await send(begin)).error.code, "COMMAND_NOT_ALLOWED");
  config.readOnly = false;
  assert.equal((await send({ ...begin, cwd: "/private" })).error.code, "PROJECT_NOT_ALLOWED");
  assert.equal((await send(begin)).success, true);
  assert.equal((await send({ type: "image.upload.append", uploadId: id, offset: 0, data: png.toString("base64") })).success, true);
  assert.equal((await send({ type: "image.upload.finish", uploadId: id })).success, true);
  const turn = envelope({ type: "turn.start", threadId: "thread-1", text: "", attachmentIds: [id] });
  assert.equal((await router.handle(turn)).success, true);
  assert.equal((await router.handle(turn)).success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "turn/start");
  assert.equal(calls[0].params.input[0].type, "localImage");
  assert.deepEqual(await fs.readFile(calls[0].params.input[0].path), png);
  assert.equal((await send({ type: "turn.start", threadId: "thread-2", text: "look", attachmentIds: [id] })).error.code, "INVALID_IMAGE");
});
