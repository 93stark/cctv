import { ApiError, handle, json } from "@/server/http";
import { getDb } from "@/db";
import { getPaymentProvider } from "@/server/payments/providers";
import { settleProviderEvent } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Provider callback. The signature is verified by the provider adapter BEFORE anything else.
 * Returns 200 for duplicates so the provider stops retrying.
 */
export const POST = handle<{ params: Promise<{ provider: string }> }>(async (req, ctx) => {
  const { provider: name } = await ctx.params;
  const provider = getPaymentProvider();
  if (provider.name !== name || !provider.supportsWebhooks || !provider.verifyWebhook) {
    throw new ApiError(404, "not_found", "Unknown payment provider.");
  }
  const raw = await req.text();
  if (raw.length > 64 * 1024) throw new ApiError(413, "payload_too_large", "Payload too large.");
  const event = provider.verifyWebhook(raw, req.headers);
  const db = await getDb();
  const result = await settleProviderEvent(db, provider.name, event);
  return json({ ok: true, result });
});
