import type { Db } from "@/db";
import { config } from "../config";
import { hmacHex, safeEqual } from "../crypto";
import { ApiError } from "../http";
import { getSettings } from "../settings";

export type CheckoutPayload =
  | { type: "mock"; message: string }
  | {
      type: "manual_upi";
      qrImageUrl: string | null;
      payeeName: string | null;
      amountPaise: number;
      /** Ask the user to put this in the UPI remarks so the payment can be matched. */
      paymentNote: string;
      instructions: string[];
    };

export type NormalizedPaymentEvent = {
  /** Unique per provider callback; used for idempotency. */
  eventId: string;
  orderRef: string;
  providerTxnRef: string;
  amountPaise: number;
  currency: string;
  status: "success" | "failed" | "cancelled";
  payloadHash: string;
};

export interface PaymentProvider {
  readonly name: "mock" | "manual_upi";
  readonly orderTtlMinutes: number;
  /** Whether verified server-to-server callbacks are available for this provider. */
  readonly supportsWebhooks: boolean;
  createCheckout(db: Db, order: { orderRef: string; amountPaise: number; currency: string }): Promise<CheckoutPayload>;
  /** Verify the callback signature and return a normalised event. Throws ApiError(401) if invalid. */
  verifyWebhook?(rawBody: string, headers: Headers): NormalizedPaymentEvent;
}

class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly orderTtlMinutes = 30;
  readonly supportsWebhooks = true;
  async createCheckout(): Promise<CheckoutPayload> {
    return { type: "mock", message: "Development checkout. Complete the payment with the signed mock webhook." };
  }
  verifyWebhook(rawBody: string, headers: Headers): NormalizedPaymentEvent {
    const secret = config().MOCK_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, "webhook_not_configured", "Webhook secret is not configured.");
    const sig = headers.get("x-signature") ?? "";
    if (!safeEqual(sig, hmacHex(secret, rawBody))) throw new ApiError(401, "invalid_signature", "Invalid signature.");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new ApiError(400, "invalid_json", "Invalid payload.");
    }
    const status = body.status;
    if (
      typeof body.eventId !== "string" ||
      typeof body.orderRef !== "string" ||
      typeof body.txnRef !== "string" ||
      !Number.isInteger(body.amountPaise) ||
      typeof body.currency !== "string" ||
      (status !== "success" && status !== "failed" && status !== "cancelled")
    ) {
      throw new ApiError(400, "invalid_payload", "Invalid payload.");
    }
    return {
      eventId: body.eventId,
      orderRef: body.orderRef,
      providerTxnRef: body.txnRef,
      amountPaise: body.amountPaise as number,
      currency: body.currency,
      status,
      payloadHash: hmacHex("payload", rawBody),
    };
  }
}

/**
 * Manual UPI mode: the user pays the merchant QR, submits the UTR, and an admin verifies it against
 * the bank/PhonePe statement before membership is activated. There is no automatic confirmation.
 */
class ManualUpiProvider implements PaymentProvider {
  readonly name = "manual_upi" as const;
  readonly orderTtlMinutes = 24 * 60;
  readonly supportsWebhooks = false;
  async createCheckout(db: Db, order: { orderRef: string; amountPaise: number }): Promise<CheckoutPayload> {
    const s = await getSettings(db, ["upi_qr_image_url", "upi_payee_name"]);
    const rupees = order.amountPaise / 100;
    return {
      type: "manual_upi",
      qrImageUrl: (s.upi_qr_image_url as string | null) ?? null,
      payeeName: (s.upi_payee_name as string | null) ?? null,
      amountPaise: order.amountPaise,
      paymentNote: order.orderRef,
      instructions: [
        `Scan the QR with any UPI app and pay exactly ₹${rupees}.`,
        `Write ${order.orderRef} in the payment remarks.`,
        "After paying, enter the 12-digit UTR / transaction ID shown in your UPI app.",
        "Your support plan is activated after our team verifies the payment.",
      ],
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const cfg = config();
  if (cfg.PAYMENT_PROVIDER === "mock") {
    if (cfg.isLive) throw new Error("Mock payment provider is not allowed outside development");
    return new MockProvider();
  }
  return new ManualUpiProvider();
}
