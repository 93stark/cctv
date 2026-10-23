import { ApiError, json } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { IMAGE_TYPES, PDF_TYPE, readUpload, storeFile } from "@/server/storage";
import { mediaAssets } from "@/db/schema";
export const dynamic = "force-dynamic";

export const POST = adminRoute("content.manage", async ({ db, req, admin }) => {
  const kind = new URL(req.url).searchParams.get("kind") === "pdf" ? "pdf" : "image";
  const allowed = kind === "pdf" ? [PDF_TYPE] : Object.keys(IMAGE_TYPES);
  const { bytes, mime } = await readUpload(req, { allowed, maxBytes: kind === "pdf" ? 15 * 1024 * 1024 : 5 * 1024 * 1024 });
  if (!bytes.length) throw new ApiError(400, "invalid_upload", "Empty file.");
  const stored = await storeFile(kind === "pdf" ? "pdf" : "admin-images", bytes, mime);
  await db.insert(mediaAssets).values({ url: stored.url, pathname: stored.pathname, purpose: kind === "pdf" ? "admin_pdf" : "admin_image", mime: stored.mime, sizeBytes: stored.sizeBytes, uploadedByAdmin: admin.id });
  return json({ url: stored.url }, 201);
});
