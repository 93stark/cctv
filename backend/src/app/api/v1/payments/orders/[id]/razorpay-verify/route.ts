import { z } from "zod";
import { ApiError, json, readJson } from "@/server/http";
import { userRoute, type IdParams } from "@/server/routes";
import { verifyRazorpayPayment } from "@/server/services/payments";

export const dynamic = "force-dynamic";

const body = z
  .object({
    razorpayPaymentId: z.string().trim().min(5).max(64),
    razorpayOrderId: z.string().trim().min(5).max(64),
    razorpaySignature: z.string().trim().min(20).max(256),
  })
  .strict();

export const POST = userRoute<IdParams>(async ({ db, req, userId, ctx }) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "Order not found.");
  const b = await readJson(req, body);
  const order = await verifyRazorpayPayment(db, userId, id, { paymentId: b.razorpayPaymentId, razorpayOrderId: b.razorpayOrderId, signature: b.razorpaySignature });
  return json({ order });
});
