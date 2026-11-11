import { z } from "zod";
import { audit } from "@/server/audit";
import { clientIp, json, readJson } from "@/server/http";
import { gatewayAdminView, saveGatewayConfig } from "@/server/payments/gatewayConfig";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

const body = z
  .object({
    gateway: z.enum(["razorpay", "manual_upi"]).optional(),
    keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, "Key ID looks like rzp_test_xxxxxxxx or rzp_live_xxxxxxxx").optional(),
    keySecret: z.string().trim().regex(/^\S{10,80}$/, "Key Secret is 10-80 characters without spaces").optional(),
    webhookSecret: z.string().trim().regex(/^\S{6,128}$/, "Webhook secret is 6-128 characters without spaces").optional(),
  })
  .strict();

export const GET = adminRoute("payment_settings.manage", async ({ db }) => json({ gateway: await gatewayAdminView(db) }));

export const PUT = adminRoute("payment_settings.manage", async ({ db, req, admin }) => {
  const patch = await readJson(req, body);
  const before = await gatewayAdminView(db);
  // A new Key ID needs its matching secret, otherwise a test id could end up paired with a live secret.
  if (patch.keyId && patch.keyId !== before.keyId && !patch.keySecret) {
    return json({ error: { code: "validation_error", message: "Enter the Key Secret that belongs to the new Key ID." } }, 400);
  }
  if (patch.gateway === "razorpay" && !before.configured && !(patch.keyId && patch.keySecret)) {
    return json({ error: { code: "validation_error", message: "Save the Key ID and Key Secret first, then switch to Razorpay." } }, 400);
  }
  await saveGatewayConfig(db, admin.id, patch);
  const after = await gatewayAdminView(db);
  await audit(db, admin, "gateway.update", "app_settings", null, before, after, clientIp(req));
  return json({ gateway: after });
});
