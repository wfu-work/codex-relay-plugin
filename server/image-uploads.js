import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { RelayError } from "./errors.js";

export const IMAGE_INPUT_LIMITS = Object.freeze({ version: 1, maxImages: 4, maxBytes: 6 * 1024 * 1024, chunkBytes: 96 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] });
const TTL = 24 * 60 * 60 * 1000;
const hash = value => createHash("sha256").update(value).digest("hex");
const invalid = message => new RelayError("INVALID_IMAGE", message);
const imageName = meta => `image.${{ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[meta.mime]}`;

// Uploads travel in bounded Relay commands. The desktop receives only paths
// created here, never a path or URL supplied by the remote client.
export class ImageUploads {
  #tail = Promise.resolve();
  constructor(configDir) { this.directory = configDir ? path.join(configDir, "image-uploads") : null; }
  run(action) {
    const result = this.#tail.catch(() => {}).then(action);
    this.#tail = result;
    return result;
  }
  owner(config, envelope) {
    return hash(JSON.stringify([config.relay.url, config.relay.spaceId, config.relay.endpointId, envelope.deviceId]));
  }
  folder(id) {
    if (!this.directory) throw new RelayError("IMAGE_UPLOAD_UNAVAILABLE", "图片存储未配置");
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw invalid("图片标识无效");
    return path.join(this.directory, id);
  }
  async read(id, owner) {
    let meta;
    try { meta = JSON.parse(await fs.readFile(path.join(this.folder(id), "meta.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; throw new RelayError("IMAGE_UPLOAD_EXPIRED", "图片上传已过期，请重试上传"); }
    if (meta.owner !== owner) throw new RelayError("IMAGE_ACCESS_DENIED", "图片不属于当前接入端");
    return meta;
  }
  async save(id, meta) {
    const temporary = path.join(this.folder(id), `${randomUUID()}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(meta), { mode: 0o600 });
    await fs.rename(temporary, path.join(this.folder(id), "meta.json"));
  }
  begin(command, owner, context) { return this.run(async () => {
    const { uploadId: id, mime, size, sha256 } = command;
    const directory = this.folder(id);
    if (!IMAGE_INPUT_LIMITS.mimeTypes.includes(mime) || !Number.isSafeInteger(size) || size <= 0 || size > IMAGE_INPUT_LIMITS.maxBytes || !/^[a-f0-9]{64}$/.test(sha256 || "")) throw invalid("请选择不超过 6 MB 的 PNG、JPEG 或 WebP 图片");
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.prune();
    const definition = { owner, mime, size, sha256, cwd: context.cwd, threadId: context.threadId || null };
    try {
      const meta = await this.read(id, owner);
      if (Object.keys(definition).some(key => meta[key] !== definition[key])) throw invalid("上传标识已用于其他图片或任务");
      const stat = await fs.stat(path.join(directory, meta.ready ? imageName(meta) : "partial"));
      return { uploadId: id, offset: stat.size, ready: !!meta.ready };
    } catch (error) { if (error.code !== "IMAGE_UPLOAD_EXPIRED") throw error; }
    let pendingBytes = 0;
    let pendingCount = 0;
    for (const name of await fs.readdir(this.directory)) {
      const meta = await fs.readFile(path.join(this.directory, name, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
      if (meta && !meta.retained) { pendingBytes += meta.size; pendingCount++; }
    }
    if (pendingCount >= 32 || pendingBytes + size > 96 * 1024 * 1024) throw new RelayError("IMAGE_UPLOAD_QUOTA", "待发送图片过多，请先发送或删除已有附件");
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.writeFile(path.join(directory, "partial"), Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    await this.save(id, { ...definition, createdAt: Date.now(), ready: false });
    return { uploadId: id, offset: 0, ready: false };
  }); }
  append(command, owner) { return this.run(async () => {
    const { uploadId: id, offset, data } = command;
    const meta = await this.read(id, owner);
    if (!Number.isSafeInteger(offset) || offset < 0 || typeof data !== "string" || data.length > Math.ceil(IMAGE_INPUT_LIMITS.chunkBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw invalid("图片分块无效");
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length || bytes.toString("base64") !== data || offset + bytes.length > meta.size) throw invalid("图片分块大小无效");
    const file = path.join(this.folder(id), meta.ready ? imageName(meta) : "partial");
    const handle = await fs.open(file, "r+");
    try {
      const stat = await handle.stat();
      if (offset < stat.size && offset + bytes.length <= stat.size) {
        const previous = Buffer.alloc(bytes.length);
        await handle.read(previous, 0, previous.length, offset);
        if (!previous.equals(bytes)) throw invalid("重复图片分块内容不一致");
      } else {
        if (meta.ready || offset !== stat.size) throw invalid("图片分块顺序不正确，请恢复上传");
        let written = 0;
        while (written < bytes.length) {
          const result = await handle.write(bytes, written, bytes.length - written, offset + written);
          written += result.bytesWritten;
        }
        await handle.sync();
      }
    } finally { await handle.close(); }
    return { offset: (await fs.stat(file)).size };
  }); }
  finish(id, owner) { return this.run(async () => {
    const meta = await this.read(id, owner);
    const directory = this.folder(id);
    const source = path.join(directory, meta.ready ? imageName(meta) : "partial");
    const bytes = await fs.readFile(source);
    if (bytes.length !== meta.size || hash(bytes) !== meta.sha256 || sniffImageMime(bytes) !== meta.mime) throw invalid("图片校验失败，请重新选择或上传");
    if (!meta.ready) await fs.copyFile(source, path.join(directory, imageName(meta)));
    await this.save(id, { ...meta, ready: true });
    await fs.rm(path.join(directory, "partial"), { force: true });
    return { attachmentId: id };
  }); }
  remove(id, owner) { return this.run(async () => {
    const meta = await this.read(id, owner);
    if (!meta.retained) await fs.rm(this.folder(id), { recursive: true, force: true });
    return { removed: !meta.retained };
  }); }
  resolve(ids, owner, context) { return this.run(async () => {
    if (!Array.isArray(ids) || !ids.length || ids.length > IMAGE_INPUT_LIMITS.maxImages || new Set(ids).size !== ids.length) throw invalid("每条消息最多添加 4 张图片");
    const images = [];
    for (const id of ids) {
      const meta = await this.read(id, owner);
      if (!meta.ready || meta.cwd !== context.cwd || (meta.threadId && meta.threadId !== context.threadId)) throw invalid("图片未上传完成或不属于当前任务，请重新上传");
      images.push({ id, meta });
    }
    // Preserve sent images for desktop history, even if the acknowledgement
    // is lost. Only abandoned uploads expire; cleanup must not break a turn.
    for (const { id, meta } of images) await this.save(id, { ...meta, retained: true, threadId: context.threadId });
    return images.map(({ id, meta }) => ({ type: "localImage", path: path.join(this.folder(id), imageName(meta)) }));
  }); }
  async prune() {
    for (const name of await fs.readdir(this.directory)) {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(name)) continue;
      const directory = this.folder(name);
      const meta = await fs.readFile(path.join(directory, "meta.json"), "utf8").then(JSON.parse).catch(() => null);
      const stat = await fs.stat(directory).catch(() => null);
      if (!meta?.retained && stat && Date.now() - (meta?.createdAt || stat.mtimeMs) > TTL) await fs.rm(directory, { recursive: true, force: true });
    }
  }
}

export function sniffImageMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}
