import { z } from "zod";
import { json, readJson } from "@/server/http";
import { userRoute } from "@/server/routes";
import { createOrder } from "@/server/services/payments";

export const dynamic = "force-dynamic";

export const POST = userRoute(async ({ db, req, userId }) => {
  const { planCode } = await readJson(req, z.object({ planCode: z.string().min(1).max(40) }));
  return json({ order: await createOrder(db, userId, planCode) }, 201);
});
