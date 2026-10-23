import { ApiError, clientIp, json, readJson } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { CONTENT, createContent, isContentKind, listContent } from "@/server/services/admin";
import type { Permission } from "@/server/permissions";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ kind: string }> };
const perm = (kind: string): Permission => (kind === "notifications" ? "notifications.manage" : "content.manage");

async function kindOf(ctx: P) {
  const kind = (await ctx.params).kind;
  if (!isContentKind(kind)) throw new ApiError(404, "not_found", "Unknown content type.");
  return kind;
}

// Permission depends on the kind, so authorise inside after resolving it.
export const GET = adminRoute<P>("dashboard.view", async ({ db, ctx, admin }) => {
  const kind = await kindOf(ctx);
  if (!admin.permissions.has(perm(kind))) throw new ApiError(403, "forbidden", "You do not have permission to do this.");
  return json({ items: await listContent(db, kind) });
});

export const POST = adminRoute<P>("dashboard.view", async ({ db, req, ctx, admin }) => {
  const kind = await kindOf(ctx);
  if (!admin.permissions.has(perm(kind))) throw new ApiError(403, "forbidden", "You do not have permission to do this.");
  const input = await readJson(req, CONTENT[kind].create as never);
  return json({ item: await createContent(db, admin, kind, input as Record<string, unknown>, clientIp(req)) }, 201);
});
