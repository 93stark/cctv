import fs from "node:fs/promises";
import path from "node:path";
import { ApiError, handle } from "@/server/http";
import { config } from "@/server/config";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

/** Development-only file server for local uploads. Disabled in staging/production. */
export const GET = handle<{ params: Promise<{ path: string[] }> }>(async (_req, ctx) => {
  if (config().isLive) throw new ApiError(404, "not_found", "Not found.");
  const { path: parts } = await ctx.params;
  const root = path.join(process.cwd(), ".uploads");
  const full = path.resolve(root, ...parts);
  if (!full.startsWith(root + path.sep)) throw new ApiError(400, "bad_path", "Bad path.");
  const ext = path.extname(full).slice(1).toLowerCase();
  if (!TYPES[ext]) throw new ApiError(404, "not_found", "Not found.");
  try {
    const data = await fs.readFile(full);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": TYPES[ext], "X-Content-Type-Options": "nosniff" } });
  } catch {
    throw new ApiError(404, "not_found", "Not found.");
  }
});
