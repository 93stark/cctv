import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { approveManualProof } from "@/server/services/payments";
export const dynamic = "force-dynamic";

const body = z.object({ receivedAmountPaise: z.number().int().positive(), note: z.string().trim().min(3).max(300) }).strict();

export const POST = adminRoute<IdParams>("payments.verify_manual", async ({ db, req, ctx, admin }) => {
  const b = await readJson(req, body);
  return json(await approveManualProof(db, admin, (await ctx.params).id, b.receivedAmountPaise, b.note, clientIp(req)));
});
