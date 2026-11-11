import type { Db } from "@/db";
import { config } from "../config";
import { hmacHex, safeEqual } from "../crypto";
import { ApiError } from "../http";
import { getSettings } from "../settings";
import { getGatewayConfig, type GatewayConfig } from "./gatewayConfig";

export type CheckoutPayload =
  | { type: "mock"; message: string }
  | {
      type: "razorpay";
      /** Public key id (safe for the app). The key secret never leaves the server. */
      keyId: string;
      razorpayOrderId: string;
      orderRef: string;
      amountPaise: number;
      currency: string;
      mode: "test" | "live";
      /** Shown on the Razorpay checkout sheet. */
      merchantName: string;
      description: string;
    }
  | {
      type: "manual_upi";
      qrImageUrl: string | null;
      payeeName: string | null;
      /** Payee UPI ID; the app builds the QR and the "Pay" deep link from this. */
      upiId: string | null;
      /** upi://pay link with amount and note prefilled. */
      upiLink: string | null;
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
  readonly name: "mock" | "manual_upi" | "razorpay";
  readonly orderTtlMinutes: number;
  /** Whether verified server-to-server callbacks are available for this provider. */
  readonly supportsWebhooks: boolean;
  createCheckout(db: Db, order: { orderRef: string; amountPaise: number; currency: string }): Promise<CheckoutPayload>;
  /** Verify the callback signature and return a normalised event. Throws ApiError(401) if invalid. */
  /** Returns null for events that need no action (for example a failed attempt the user can retry). */
  verifyWebhook?(rawBody: string, headers: Headers): NormalizedPaymentEvent | null;
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
    const s = await getSettings(db, ["upi_qr_image_url", "upi_payee_name", "upi_id"]);
    const rupees = order.amountPaise / 100;
    const upiId = (s.upi_id as string | null) ?? null;
    const payeeName = (s.upi_payee_name as string | null) ?? null;
    const upiLink = upiId
      ? `upi://pay?pa=${encodeURIComponent(upiId).replace(/%40/g, "@")}&pn=${encodeURIComponent(payeeName ?? "")}&am=${(order.amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(order.orderRef)}`
      : null;
    return {
      type: "manual_upi",
      qrImageUrl: (s.upi_qr_image_url as string | null) ?? null,
      payeeName,
      upiId,
      upiLink,
      amountPaise: order.amountPaise,
      paymentNote: order.orderRef,
      instructions: [
        `Tap Pay to open your UPI app, or scan the QR from another phone. Pay exactly ₹${rupees}.`,
        `Write ${order.orderRef} in the payment remarks.`,
        "If you paid from another phone, enter the 12-digit UTR / transaction ID below.",
        "Your support plan is activated after our team verifies the payment.",
      ],
    };
  }
}

const RZP_API = "https://api.razorpay.com/v1";

export function rzpAuthHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** Razorpay Standard Checkout: the server creates the order, the app opens the checkout, the server confirms by signature and webhook. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly orderTtlMinutes = 24 * 60;
  readonly supportsWebhooks = true;
  constructor(private readonly creds: GatewayConfig) {}

  async createCheckout(db: Db, order: { orderRef: string; amountPaise: number; currency: string }): Promise<CheckoutPayload> {
    const { keyId, keySecret } = this.creds;
    if (!keyId || !keySecret) {
      throw new ApiError(503, "payments_unavailable", "Online payment is being set up. Please try again in a little while.");
    }
    let res: Response;
    try {
      res = await fetch(`${RZP_API}/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: rzpAuthHeader(keyId, keySecret) },
        body: JSON.stringify({ amount: order.amountPaise, currency: order.currency, receipt: order.orderRef, notes: { orderRef: order.orderRef } }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(502, "gateway_unreachable", "Could not reach the payment gateway. Please try again.");
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) {
      console.error("[razorpay] order create failed", res.status, body.error?.description ?? "");
      throw new ApiError(502, "gateway_error", "The payment gateway could not start this payment. Please try again later.");
    }
    const s = await getSettings(db, ["company_name"]);
    return {
      type: "razorpay",
      keyId,
      razorpayOrderId: body.id,
      orderRef: order.orderRef,
      amountPaise: order.amountPaise,
      currency: order.currency,
      mode: keyId.startsWith("rzp_live_") ? "live" : "test",
      merchantName: String(s.company_name ?? "Silicon Corporation"),
      description: "CCTV Secret & Entrepreneurship - Support plan",
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): NormalizedPaymentEvent | null {
    const secret = this.creds.webhookSecret;
    if (!secret) throw new ApiError(503, "webhook_not_configured", "Webhook secret is not configured.");
    if (!safeEqual(headers.get("x-razorpay-signature") ?? "", hmacHex(secret, rawBody))) {
      throw new ApiError(401, "invalid_signature", "Invalid signature.");
    }
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new ApiError(400, "invalid_json", "Invalid payload.");
    }
    const event = String(body?.event ?? "");
    if (event !== "payment.captured" && event !== "order.paid") return null; // failed attempts can be retried by the user
    const pay = body?.payload?.payment?.entity;
    const orderRef = pay?.notes?.orderRef ?? body?.payload?.order?.entity?.notes?.orderRef;
    if (!pay || typeof pay.id !== "string" || !Number.isInteger(pay.amount) || typeof orderRef !== "string") return null;
    if (event === "payment.captured" && pay.status !== "captured") return null;
    return {
      eventId: headers.get("x-razorpay-event-id") ?? `${event}:${pay.id}`,
      orderRef,
      providerTxnRef: pay.id,
      amountPaise: pay.amount,
      currency: String(pay.currency ?? "INR"),
      status: "success",
      payloadHash: hmacHex("payload", rawBody),
    };
  }
}

/** Which gateway new payments use: development mock, or whatever the admin chose in "Payments setup". */
export async function resolvePaymentProvider(db: Db): Promise<PaymentProvider> {
  const cfg = config();
  if (cfg.PAYMENT_PROVIDER === "mock") {
    if (cfg.isLive) throw new Error("Mock payment provider is not allowed outside development");
    return new MockProvider();
  }
  const g = await getGatewayConfig(db);
  if (g.gateway === "razorpay") return new RazorpayProvider(g);
  return new ManualUpiProvider();
}

/** Razorpay callbacks are always accepted (even if the admin switched gateway later) so no paid order is lost. */
export async function razorpayProviderFromDb(db: Db): Promise<RazorpayProvider> {
  return new RazorpayProvider(await getGatewayConfig(db));
}
