import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { resolveOtpProvider } from "../otp/provider";
import { getSettings } from "../settings";
import {
  manualPaymentProofs,
  memberships,
  paymentOrders,
  paymentTransactions,
  providerEvents,
  refunds,
  supportPlans,
  userProfiles,
} from "@/db/schema";
import { audit, type AuditActor } from "../audit";
import { randomCode } from "../crypto";
import { ApiError } from "../http";
import { getPaymentProvider, type NormalizedPaymentEvent } from "../payments/providers";
import { rateLimit } from "../rateLimit";
import { getEffectiveMembership, membershipReference } from "./membership";
import { notifyUser } from "./notifications";

type Plan = typeof supportPlans.$inferSelect;
type Order = typeof paymentOrders.$inferSelect;

function newOrderRef(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `CS-${ymd}-${randomCode(6)}`;
}

async function expireStale(db: Db, userId?: string) {
  const conds = [eq(paymentOrders.status, "pending"), lt(paymentOrders.expiresAt, new Date())];
  if (userId) conds.push(eq(paymentOrders.userId, userId));
  await db.update(paymentOrders).set({ status: "expired", updatedAt: new Date() }).where(and(...conds));
}

async function orderDto(db: Db, order: Order, plan: Pick<Plan, "code" | "name">) {
  return {
    id: order.id,
    orderRef: order.orderRef,
    plan: { code: plan.code, name: plan.name },
    amountPaise: order.amountPaise,
    currency: order.currency,
    status: order.status,
    provider: order.provider,
    checkout: order.status === "pending" || order.status === "awaiting_review" ? order.checkoutPayload : null,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
  };
}

/* ----------------------------------------------------------- create order */

export async function createOrder(db: Db, userId: string, planCode: string) {
  await rateLimit(db, `pay:create:${userId}`, 10, 60 * 60);
  const profile = await db.select({ id: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!profile[0]) throw new ApiError(409, "profile_required", "Complete your profile before buying a plan.");

  const plans = await db.select().from(supportPlans).where(eq(supportPlans.code, planCode)).limit(1);
  const plan = plans[0];
  if (!plan || !plan.isActive) throw new ApiError(404, "plan_unavailable", "This plan is not available right now.");

  const current = await getEffectiveMembership(db, userId);
  if (current?.isLifetime) throw new ApiError(409, "already_member", "You already have lifetime support.");
  if (current && !plan.isLifetime) throw new ApiError(409, "already_member", "Your support plan is already active.");

  await expireStale(db, userId);

  // Reuse an open order for the same plan instead of creating duplicates.
  const open = await db
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.userId, userId),
        eq(paymentOrders.planId, plan.id),
        inArray(paymentOrders.status, ["pending", "awaiting_review"]),
      ),
    )
    .orderBy(desc(paymentOrders.createdAt))
    .limit(1);
  if (open[0]) return orderDto(db, open[0], plan);

  const provider = getPaymentProvider();
  const orderRef = newOrderRef();
  const checkout = await provider.createCheckout(db, { orderRef, amountPaise: plan.pricePaise, currency: plan.currency });
  const created = await db
    .insert(paymentOrders)
    .values({
      orderRef,
      userId,
      planId: plan.id,
      amountPaise: plan.pricePaise, // always from the server-side plan, never from the client
      currency: plan.currency,
      status: "pending",
      provider: provider.name,
      checkoutPayload: checkout,
      expiresAt: new Date(Date.now() + provider.orderTtlMinutes * 60 * 1000),
    })
    .returning();
  return orderDto(db, created[0], plan);
}

export async function getOrder(db: Db, userId: string, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiError(404, "not_found", "Order not found.");
  await expireStale(db, userId);
  const rows = await db
    .select({ order: paymentOrders, plan: supportPlans })
    .from(paymentOrders)
    .innerJoin(supportPlans, eq(supportPlans.id, paymentOrders.planId))
    .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, "not_found", "Order not found.");
  const dto = await orderDto(db, rows[0].order, rows[0].plan);
  const membership = rows[0].order.status === "paid" ? await getEffectiveMembership(db, userId) : null;
  return { ...dto, membership };
}

/* --------------------------------------------------------------- history */

export async function paymentHistory(db: Db, userId: string) {
  const rows = await db
    .select({
      orderId: paymentOrders.id,
      orderRef: paymentOrders.orderRef,
      status: paymentOrders.status,
      amountPaise: paymentOrders.amountPaise,
      currency: paymentOrders.currency,
      createdAt: paymentOrders.createdAt,
      planName: supportPlans.name,
      planCode: supportPlans.code,
      txnRef: paymentTransactions.providerTxnRef,
      txnStatus: paymentTransactions.status,
      verifiedAt: paymentTransactions.verifiedAt,
      membershipId: memberships.id,
      membershipStatus: memberships.status,
      membershipEnds: memberships.endsAt,
    })
    .from(paymentOrders)
    .innerJoin(supportPlans, eq(supportPlans.id, paymentOrders.planId))
    .leftJoin(paymentTransactions, eq(paymentTransactions.orderId, paymentOrders.id))
    .leftJoin(memberships, eq(memberships.transactionId, paymentTransactions.id))
    .where(eq(paymentOrders.userId, userId))
    .orderBy(desc(paymentOrders.createdAt))
    .limit(100);

  const now = new Date();
  return rows.map((r) => {
    let membershipState: "none" | "active" | "expired" | "refunded" | "revoked" = "none";
    if (r.membershipStatus === "refunded") membershipState = "refunded";
    else if (r.membershipStatus === "revoked") membershipState = "revoked";
    else if (r.membershipStatus === "active") membershipState = r.membershipEnds && r.membershipEnds <= now ? "expired" : "active";
    return {
      orderId: r.orderId,
      orderRef: r.orderRef,
      transactionRef: r.txnRef,
      plan: r.planName,
      planCode: r.planCode,
      amountPaise: r.amountPaise,
      currency: r.currency,
      status: r.txnStatus === "refunded" ? "refunded" : r.status,
      date: r.verifiedAt ?? r.createdAt,
      membershipStatus: membershipState,
      membershipReference: r.membershipId ? membershipReference(r.membershipId) : null,
    };
  });
}

/* ---------------------------------------------------- activation (shared) */

async function activateOrder(
  tx: Db,
  order: Order,
  opts: { provider: string; txnRef: string; source: "webhook" | "manual_review"; adminId?: string },
) {
  const plans = await tx.select().from(supportPlans).where(eq(supportPlans.id, order.planId)).limit(1);
  const plan = plans[0];
  const txn = await tx
    .insert(paymentTransactions)
    .values({
      orderId: order.id,
      provider: opts.provider,
      providerTxnRef: opts.txnRef,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: "success",
      source: opts.source,
      verifiedByAdmin: opts.adminId ?? null,
    })
    .returning();
  await tx.update(paymentOrders).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
  const now = new Date();
  const membership = await tx
    .insert(memberships)
    .values({
      userId: order.userId,
      planId: plan.id,
      grantType: "payment",
      transactionId: txn[0].id,
      status: "active",
      startsAt: now,
      endsAt: plan.isLifetime ? null : new Date(now.getTime() + (plan.durationDays ?? 0) * 86400 * 1000),
    })
    .returning();
  const ref = membershipReference(membership[0].id);
  await notifyUser(tx, order.userId, "payment", "Payment confirmed", `We received your payment of ₹${order.amountPaise / 100} for ${plan.name}.`);
  await notifyUser(tx, order.userId, "membership", `${plan.name} activated`, `Your membership reference is ${ref}. You can now contact WhatsApp support from the Support tab.`);
  return { transaction: txn[0], membership: membership[0] };
}

/* ------------------------------------------------------ provider webhooks */

export type WebhookResult =
  | "paid"
  | "duplicate"
  | "already_paid"
  | "duplicate_payment"
  | "unknown_order"
  | "amount_mismatch"
  | "failed"
  | "cancelled"
  | "ignored";

/** Process a verified provider callback exactly once. Safe to call repeatedly with the same event. */
export async function settleProviderEvent(db: Db, providerName: string, ev: NormalizedPaymentEvent): Promise<WebhookResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(providerEvents)
      .values({ provider: providerName, eventId: ev.eventId, payloadHash: ev.payloadHash, result: "processing" })
      .onConflictDoNothing()
      .returning({ id: providerEvents.id });
    if (!inserted[0]) return "duplicate";

    const finish = async (result: WebhookResult) => {
      await tx.update(providerEvents).set({ result }).where(eq(providerEvents.id, inserted[0].id));
      return result;
    };

    const orders = await tx.select().from(paymentOrders).where(eq(paymentOrders.orderRef, ev.orderRef)).limit(1).for("update");
    const order = orders[0];
    if (!order || order.provider !== providerName) return finish("unknown_order");

    if (ev.status === "failed" || ev.status === "cancelled") {
      if (order.status === "pending" || order.status === "expired") {
        await tx.update(paymentOrders).set({ status: ev.status, updatedAt: new Date() }).where(eq(paymentOrders.id, order.id));
        return finish(ev.status);
      }
      return finish("ignored");
    }

    // status === success
    if (order.status === "paid") return finish("duplicate_payment");
    if (order.status === "cancelled") return finish("ignored");
    if (ev.amountPaise !== order.amountPaise || ev.currency !== order.currency) return finish("amount_mismatch");

    await activateOrder(tx as unknown as Db, order, { provider: providerName, txnRef: ev.providerTxnRef, source: "webhook" });
    return finish("paid");
  });
}

/* ------------------------------------------------------------ manual UPI */

export async function submitManualProof(db: Db, userId: string, orderId: string, rawUtr: string) {
  await rateLimit(db, `pay:proof:${userId}`, 10, 60 * 60);
  const utr = rawUtr.trim().toUpperCase();
  if (!/^[A-Z0-9]{10,22}$/.test(utr)) {
    throw new ApiError(400, "invalid_utr", "Enter the UTR / transaction ID from your UPI app (10 to 22 letters or digits).");
  }
  const rows = await db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.userId, userId)))
    .limit(1);
  const order = rows[0];
  if (!order) throw new ApiError(404, "not_found", "Order not found.");
  if (order.provider !== "manual_upi") throw new ApiError(409, "not_manual", "This order does not use manual verification.");
  if (!["pending", "awaiting_review", "expired"].includes(order.status)) {
    throw new ApiError(409, "order_closed", "This order can no longer accept payment details.");
  }
  const existing = await db.select({ n: count() }).from(manualPaymentProofs).where(eq(manualPaymentProofs.orderId, orderId));
  if ((existing[0]?.n ?? 0) >= 3) throw new ApiError(429, "too_many_proofs", "Too many submissions for this order. Please contact support.");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(manualPaymentProofs).values({ orderId, utr });
      await tx.update(paymentOrders).set({ status: "awaiting_review", updatedAt: new Date() }).where(eq(paymentOrders.id, orderId));
    });
  } catch (e) {
    if (/manual_payment_proofs_utr_uq|duplicate key|unique/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: Error })?.cause?.message ?? ""))) {
      throw new ApiError(409, "utr_already_used", "This transaction ID has already been submitted.");
    }
    throw e;
  }
  await alertAdminNewPayment(db, order.amountPaise);
  return { status: "awaiting_review" as const };
}

/**
 * Tells the owner a UTR is waiting for approval. SMS templates are pre-approved OTP-only, so the "code" is the plan
 * price in rupees (99 or 999): the owner sees which plan came in, then opens the admin panel. Best effort only.
 */
async function alertAdminNewPayment(db: Db, amountPaise: number) {
  try {
    const { admin_alert_mobile: mobile } = await getSettings(db, ["admin_alert_mobile"]);
    if (!mobile) return;
    await resolveOtpProvider().send(String(mobile), String(Math.round(amountPaise / 100)));
  } catch (e) {
    console.error("[payments] admin alert SMS failed:", e instanceof Error ? e.message : "error");
  }
}

export async function approveManualProof(
  db: Db,
  actor: NonNullable<AuditActor>,
  proofId: string,
  receivedAmountPaise: number,
  note: string,
  ip?: string,
) {
  return db.transaction(async (tx) => {
    const proofs = await tx.select().from(manualPaymentProofs).where(eq(manualPaymentProofs.id, proofId)).limit(1).for("update");
    const proof = proofs[0];
    if (!proof) throw new ApiError(404, "not_found", "Payment proof not found.");
    if (proof.status !== "pending") throw new ApiError(409, "already_reviewed", "This proof was already reviewed.");
    const orders = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, proof.orderId)).limit(1).for("update");
    const order = orders[0];
    if (order.status === "paid" || order.status === "cancelled") {
      throw new ApiError(409, "order_closed", `Order is already ${order.status}.`);
    }
    if (receivedAmountPaise !== order.amountPaise) {
      throw new ApiError(400, "amount_mismatch", `Received amount must equal the order amount (₹${order.amountPaise / 100}).`);
    }
    const result = await activateOrder(tx as unknown as Db, order, {
      provider: "manual_upi",
      txnRef: proof.utr,
      source: "manual_review",
      adminId: actor.id,
    });
    await tx
      .update(manualPaymentProofs)
      .set({ status: "approved", reviewedByAdmin: actor.id, reviewedAt: new Date(), reviewNote: note })
      .where(eq(manualPaymentProofs.id, proofId));
    await audit(tx as unknown as Db, actor, "payment.manual_approve", "payment_order", order.id, { status: order.status }, {
      status: "paid",
      utr: proof.utr,
      receivedAmountPaise,
      note,
    }, ip);
    return { orderId: order.id, membershipId: result.membership.id };
  });
}

export async function rejectManualProof(db: Db, actor: NonNullable<AuditActor>, proofId: string, note: string, ip?: string) {
  await db.transaction(async (tx) => {
    const proofs = await tx.select().from(manualPaymentProofs).where(eq(manualPaymentProofs.id, proofId)).limit(1).for("update");
    const proof = proofs[0];
    if (!proof) throw new ApiError(404, "not_found", "Payment proof not found.");
    if (proof.status !== "pending") throw new ApiError(409, "already_reviewed", "This proof was already reviewed.");
    await tx
      .update(manualPaymentProofs)
      .set({ status: "rejected", reviewedByAdmin: actor.id, reviewedAt: new Date(), reviewNote: note })
      .where(eq(manualPaymentProofs.id, proofId));
    // Back to "pending" so the user can submit a corrected UTR, unless another proof is still waiting.
    const waiting = await tx
      .select({ n: count() })
      .from(manualPaymentProofs)
      .where(and(eq(manualPaymentProofs.orderId, proof.orderId), eq(manualPaymentProofs.status, "pending")));
    if ((waiting[0]?.n ?? 0) === 0) {
      await tx.update(paymentOrders).set({ status: "pending", updatedAt: new Date() }).where(and(eq(paymentOrders.id, proof.orderId), eq(paymentOrders.status, "awaiting_review")));
    }
    await audit(tx as unknown as Db, actor, "payment.manual_reject", "payment_order", proof.orderId, null, { utr: proof.utr, note }, ip);
  });
}

/* --------------------------------------------------------------- refunds */

export async function recordRefund(
  db: Db,
  actor: NonNullable<AuditActor>,
  transactionId: string,
  reason: string,
  providerRefundRef: string | null,
  ip?: string,
) {
  return db.transaction(async (tx) => {
    const txns = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, transactionId)).limit(1).for("update");
    const txn = txns[0];
    if (!txn) throw new ApiError(404, "not_found", "Transaction not found.");
    if (txn.status !== "success") throw new ApiError(409, "already_refunded", "This transaction is not refundable.");
    await tx.insert(refunds).values({
      transactionId,
      amountPaise: txn.amountPaise,
      reason,
      providerRefundRef,
      createdByAdmin: actor.id,
    });
    await tx.update(paymentTransactions).set({ status: "refunded" }).where(eq(paymentTransactions.id, transactionId));
    const ended = await tx
      .update(memberships)
      .set({ status: "refunded", endedReason: "refund", endsAt: new Date() })
      .where(eq(memberships.transactionId, transactionId))
      .returning({ userId: memberships.userId });
    if (ended[0]) {
      await notifyUser(tx as unknown as Db, ended[0].userId, "membership", "Payment refunded", "Your payment was refunded and the support plan has ended.");
    }
    await audit(tx as unknown as Db, actor, "payment.refund", "payment_transaction", transactionId, { status: "success" }, {
      status: "refunded",
      amountPaise: txn.amountPaise,
      reason,
      providerRefundRef,
    }, ip);
  });
}

