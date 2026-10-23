import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { revokeMembership } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const POST = adminRoute<IdParams>("memberships.manage", async ({ db, req, ctx, admin }) => {
  const { reason } = await readJson(req, z.object({ reason: z.string().trim().min(5).max(300) }).strict());
  await revokeMembership(db, admin, (await ctx.params).id, reason, clientIp(req));
  return json({ ok: true });
});
