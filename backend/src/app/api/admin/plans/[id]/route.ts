import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { planPatch, updatePlan } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const PUT = adminRoute<IdParams>("plans.manage", async ({ db, req, ctx, admin }) => {
  await updatePlan(db, admin, (await ctx.params).id, await readJson(req, planPatch), clientIp(req));
  return json({ ok: true });
});
