import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { ApiError } from "./http";
import { randomToken } from "./crypto";

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const PDF_TYPE = "application/pdf";

/** Detect the real type from magic bytes; never trust the client-supplied Content-Type. */
export function sniffType(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return PDF_TYPE;
  return null;
}

export type StoredFile = { url: string; pathname: string; mime: string; sizeBytes: number };

export async function readUpload(
  req: Request,
  opts: { allowed: string[]; maxBytes: number; field?: string },
): Promise<{ bytes: Uint8Array; mime: string }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > opts.maxBytes + 64 * 1024) throw new ApiError(413, "file_too_large", "File is too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_upload", "Upload must be multipart form data.");
  }
  const file = form.get(opts.field ?? "file");
  if (!(file instanceof File)) throw new ApiError(400, "invalid_upload", "No file was uploaded.");
  if (file.size > opts.maxBytes) throw new ApiError(413, "file_too_large", "File is too large.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffType(bytes);
  if (!mime || !opts.allowed.includes(mime)) {
    throw new ApiError(415, "unsupported_file_type", "This file type is not allowed.");
  }
  return { bytes, mime };
}

export async function storeFile(folder: string, bytes: Uint8Array, mime: string): Promise<StoredFile> {
  const cfg = config();
  const ext = mime === PDF_TYPE ? "pdf" : IMAGE_TYPES[mime as keyof typeof IMAGE_TYPES];
  const pathname = `${folder}/${Date.now()}-${randomToken(9)}.${ext}`;

  if (cfg.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      contentType: mime,
      token: cfg.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return { url: blob.url, pathname, mime, sizeBytes: bytes.length };
  }
  if (cfg.isLive) throw new ApiError(503, "storage_unavailable", "File storage is not configured.");

  // Development fallback: local disk, served by /api/v1/dev-uploads/[...path] (disabled in production).
  const full = path.join(process.cwd(), ".uploads", pathname);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return { url: `/api/v1/dev-uploads/${pathname}`, pathname, mime, sizeBytes: bytes.length };
}
