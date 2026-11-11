import { json } from "@/server/http";
import { getGatewayConfig } from "@/server/payments/gatewayConfig";
import { rzpAuthHeader } from "@/server/payments/providers";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

/** Checks the saved Key ID and Key Secret against Razorpay without creating anything. */
export const POST = adminRoute("payment_settings.manage", async ({ db }) => {
  const { keyId, keySecret } = await getGatewayConfig(db);
  if (!keyId || !keySecret) return json({ ok: false, message: "Save the Key ID and Key Secret first." });
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { authorization: rzpAuthHeader(keyId, keySecret) },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return json({ ok: true, mode: keyId.startsWith("rzp_live_") ? "live" : "test", message: "Razorpay accepted these credentials." });
    if (res.status === 401) return json({ ok: false, message: "Razorpay rejected the Key ID / Key Secret. Check that both belong to the same mode (test or live)." });
    return json({ ok: false, message: `Razorpay answered with status ${res.status}.` });
  } catch {
    return json({ ok: false, message: "Could not reach Razorpay. Try again." });
  }
});
