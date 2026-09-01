import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const INLINE_THUMBNAIL_BYTES = 256 * 1024;
const execFileAsync = promisify(execFile);

/** Parse only RFC2397 image data URLs; arbitrary URLs are never fetched here. */
export function parseImageDataUrl(value) {
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

export function imageDataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function imageMimeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
  }[extension] || "";
}

function localPathFromValue(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("file://")) {
    try { return fileURLToPath(candidate); } catch { return null; }
  }
  return path.isAbsolute(candidate) ? candidate : null;
}

async function parseLocalImage(value, declaredMime, allowedRoots) {
  const candidate = localPathFromValue(value);
  if (!candidate) return null;
  const roots = await Promise.all([os.tmpdir(), ...(allowedRoots || [])]
    .filter((root) => typeof root === "string" && path.isAbsolute(root))
    .map(async (root) => {
      try { return await fs.realpath(root); } catch { return path.resolve(root); }
    }));
  let realPath;
  try { realPath = await fs.realpath(candidate); } catch { return null; }
  if (!roots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`))) return null;
  const mime = typeof declaredMime === "string" && declaredMime.toLowerCase().startsWith("image/")
    ? declaredMime.toLowerCase()
    : imageMimeForPath(realPath);
  if (!mime) return null;
  try {
    const stat = await fs.stat(realPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return null;
    return { mime, bytes: await fs.readFile(realPath) };
  } catch {
    return null;
  }
}

/**
 * Keep small images inline as thumbnails. Larger images use the platform
 * scaler when available and otherwise render from the controlled resource URL.
 */
export function thumbnailDataUrl(mime, bytes) {
  return bytes.length <= INLINE_THUMBNAIL_BYTES ? imageDataUrl(mime, bytes) : "";
}

/** Use the native macOS scaler when available without adding a large image
 * processing dependency to the connector. Other platforms safely fall back
 * to a network-rendered original. */
export async function createThumbnailDataUrl(mime, bytes) {
  const inline = thumbnailDataUrl(mime, bytes);
  if (inline || process.platform !== "darwin") return inline;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recodex-thumb-"));
  const extension = mime.split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "") || "img";
  const input = path.join(directory, `source.${extension}`);
  const output = path.join(directory, "thumbnail.jpg");
  try {
    await fs.writeFile(input, bytes, { mode: 0o600 });
    await execFileAsync("sips", ["--resampleWidth", "640", "--setProperty", "format", "jpeg", input, "--out", output], { timeout: 5_000 });
    const thumbnail = await fs.readFile(output);
    return thumbnail.length <= INLINE_THUMBNAIL_BYTES
      ? imageDataUrl("image/jpeg", thumbnail)
      : "";
  } catch {
    return "";
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Recursively replace inline image payloads with thumbnail metadata and a
 * Relay capability URL. Existing non-image event fields remain untouched.
 */
export async function prepareEventImages(value, upload, seen = new WeakSet(), options = {}) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => prepareEventImages(entry, upload, seen, options)));
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
      options.allowedRoots,
    );
    if (parsed) {
      sourceKey = key;
      source = parsed;
      break;
    }
  }
  if (!source) return result;

  const existingThumbnail = parseImageDataUrl(value.thumbnailDataUrl || value.thumbnail_data_url);
  const thumb = existingThumbnail
    ? imageDataUrl(existingThumbnail.mime, existingThumbnail.bytes)
    : await createThumbnailDataUrl(source.mime, source.bytes);
  if (thumb) result.thumbnailDataUrl = thumb;

  try {
    const ready = await upload({ mime: source.mime, bytes: source.bytes });
    if (ready?.resourceUrl) {
      result.resourceUrl = ready.resourceUrl;
      if (ready.expiresAt) result.expiresAt = ready.expiresAt;
      // Remove the potentially multi-megabyte inline source once Relay owns
      // the bytes. Keep URL-shaped fields useful to older consumers.
      if (sourceKey === "dataUrl" || sourceKey === "data_url" || sourceKey === "data") {
        delete result[sourceKey];
      } else {
        result[sourceKey] = ready.resourceUrl;
      }
    }
  } catch {
    // The event remains renderable from its inline thumbnail/source when Relay
    // is temporarily unavailable; the caller records the upload failure.
  }
  const removableSource = new Set(["dataUrl", "data_url", "data", "url", "imageUrl", "image_url", "path", "filePath", "file_path", "localPath", "local_path"]);
  const localSource = ["path", "filePath", "file_path", "localPath", "local_path"].includes(sourceKey) ||
    (sourceKey === "url" && localPathFromValue(value[sourceKey]) !== null);
  if (!result.resourceUrl && removableSource.has(sourceKey) && (localSource || source.bytes.length > INLINE_THUMBNAIL_BYTES)) {
    // Do not let a transient Relay outage turn a multi-megabyte inline image
    // into an oversized event frame. A later thread/read can provide it again.
    delete result[sourceKey];
  }
  return result;
}
