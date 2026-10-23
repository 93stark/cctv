import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { rejectManualProof } from "@/server/services/payments";
export const dynamic = "force-dynamic";

export const POST = adminRoute<IdParams>("payments.verify_manual", async ({ db, req, ctx, admin }) => {
  const b = await readJson(req, z.object({ note: z.string().trim().min(3).max(300) }).strict());
  await rejectManualProof(db, admin, (await ctx.params).id, b.note, clientIp(req));
  return json({ ok: true });
});
