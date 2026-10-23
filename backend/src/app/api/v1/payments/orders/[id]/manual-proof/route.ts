import { z } from "zod";
import { ApiError, json, readJson } from "@/server/http";
import { userRoute, type IdParams } from "@/server/routes";
import { submitManualProof } from "@/server/services/payments";

export const dynamic = "force-dynamic";

export const POST = userRoute<IdParams>(async ({ db, req, userId, ctx }) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "Order not found.");
  const { utr } = await readJson(req, z.object({ utr: z.string().min(6).max(40) }));
  return json(await submitManualProof(db, userId, id, utr));
});
