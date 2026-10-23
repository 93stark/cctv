import { ApiError, clientIp, json, readJson } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { deleteContent, isContentKind, updateContent } from "@/server/services/admin";
import { z } from "zod";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ kind: string; id: string }> };

async function resolve(ctx: P, perms: Set<string>) {
  const { kind, id } = await ctx.params;
  if (!isContentKind(kind)) throw new ApiError(404, "not_found", "Unknown content type.");
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found.");
  if (!perms.has(kind === "notifications" ? "notifications.manage" : "content.manage")) {
    throw new ApiError(403, "forbidden", "You do not have permission to do this.");
  }
  return { kind, id };
}

export const PUT = adminRoute<P>("dashboard.view", async ({ db, req, ctx, admin }) => {
  const { kind, id } = await resolve(ctx, admin.permissions);
  const input = await readJson(req, z.record(z.unknown()));
  return json({ item: await updateContent(db, admin, kind, id, input, clientIp(req)) });
});

export const DELETE = adminRoute<P>("dashboard.view", async ({ db, req, ctx, admin }) => {
  const { kind, id } = await resolve(ctx, admin.permissions);
  await deleteContent(db, admin, kind, id, clientIp(req));
  return json({ ok: true });
});
