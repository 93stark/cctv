import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { recordRefund } from "@/server/services/payments";
export const dynamic = "force-dynamic";

const body = z.object({ reason: z.string().trim().min(5).max(300), providerRefundRef: z.string().trim().max(100).nullable().optional() }).strict();

export const POST = adminRoute<IdParams>("payments.refund", async ({ db, req, ctx, admin }) => {
  const b = await readJson(req, body);
  await recordRefund(db, admin, (await ctx.params).id, b.reason, b.providerRefundRef ?? null, clientIp(req));
  return json({ ok: true });
});
