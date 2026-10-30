import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { setOtpProviderForTests } from "@/server/otp/provider";
import { adminLogin, adminReq, call, completeProfile, freshDb, loginUser, req, signedWebhook } from "./helpers";
import { POST as createOrder } from "@/app/api/v1/payments/orders/route";
import { GET as getMembership } from "@/app/api/v1/membership/route";
import { GET as history } from "@/app/api/v1/payments/history/route";
import { POST as webhook } from "@/app/api/v1/webhooks/payments/[provider]/route";
import { POST as waLink } from "@/app/api/v1/support/whatsapp-link/route";
import { POST as manualProof } from "@/app/api/v1/payments/orders/[id]/manual-proof/route";
import { GET as adminPayments } from "@/app/api/admin/payments/route";
import { POST as approve } from "@/app/api/admin/payments/proofs/[id]/approve/route";
import { POST as reject } from "@/app/api/admin/payments/proofs/[id]/reject/route";
import { POST as refund } from "@/app/api/admin/payments/transactions/[id]/refund/route";
import { PUT as putSettings } from "@/app/api/admin/settings/route";
import { resetConfigForTests } from "@/server/config";
import { paymentTransactions, supportPlans, auditLogs, memberships, providerEvents } from "@/db/schema";
import type { Db } from "@/db";

let db: Db;
let n = 0;
beforeEach(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  db = await freshDb();
});

async function member() {
  const mobile = `+9170000${String(10000 + n++)}`;
  const s = await loginUser(mobile);
  await completeProfile(s.accessToken);
  return s;
}
const order = async (token: string, planCode = "limited") => (await call(createOrder, req("POST", "/x", { token, body: { planCode } })));
const pay = (o: any, over: Record<string, unknown> = {}) =>
  call(webhook, signedWebhook({ eventId: `evt_${Math.random()}`, orderRef: o.orderRef, txnRef: `tx_${Math.random()}`, amountPaise: o.amountPaise, currency: "INR", status: "success", ...over }), { provider: "mock" });

describe("payments (mock provider)", () => {
  it("takes the price from the server plan, ignoring any client amount", async () => {
    const s = await member();
    const r = await call(createOrder, req("POST", "/x", { token: s.accessToken, body: { planCode: "lifetime", amountPaise: 1 } }));
    expect(r.status).toBe(201);
    expect(r.data.order.amountPaise).toBe(99900);
  });

  it("requires a completed profile", async () => {
    const s = await loginUser(`+9171000${String(10000 + n++)}`);
    expect((await order(s.accessToken)).status).toBe(409);
  });

  it("rejects an unknown plan", async () => {
    const s = await member();
    expect((await order(s.accessToken, "nope")).status).toBe(404);
  });

  it("activates membership only after a valid signed webhook", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeNull();
    const r = await pay(o);
    expect(r.status).toBe(200);
    const m = (await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership;
    expect(m).toBeTruthy();
    expect(m.isLifetime).toBe(false);
  });

  it("rejects unsigned or badly signed webhooks", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    const raw = JSON.stringify({ eventId: "e1", orderRef: o.orderRef, txnRef: "t1", amountPaise: o.amountPaise, currency: "INR", status: "success" });
    const bad = await call(webhook, new Request("http://localhost/x", { method: "POST", headers: { "x-signature": "00" }, body: raw }), { provider: "mock" });
    expect(bad.status).toBe(401);
    const none = await call(webhook, new Request("http://localhost/x", { method: "POST", body: raw }), { provider: "mock" });
    expect(none.status).toBe(401);
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeNull();
  });

  it("is idempotent for duplicate events", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    const body = { eventId: "dup-1", orderRef: o.orderRef, txnRef: "dup-tx", amountPaise: o.amountPaise, currency: "INR", status: "success" };
    expect((await call(webhook, signedWebhook(body), { provider: "mock" })).status).toBe(200);
    expect((await call(webhook, signedWebhook(body), { provider: "mock" })).status).toBe(200);
    expect(await db.select().from(paymentTransactions)).toHaveLength(1);
    expect(await db.select().from(memberships)).toHaveLength(1);
    expect(await db.select().from(providerEvents)).toHaveLength(1);
  });

  it("does not activate on wrong amount, wrong currency, or failed status", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    await pay(o, { amountPaise: 100 });
    await pay(o, { currency: "USD" });
    await pay(o, { status: "failed" });
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeNull();
    expect(await db.select().from(paymentTransactions)).toHaveLength(0);
  });

  it("ignores events for unknown orders", async () => {
    const r = await pay({ orderRef: "NOPE", amountPaise: 9900 });
    expect([200, 404]).toContain(r.status);
    expect(await db.select().from(memberships)).toHaveLength(0);
  });

  it("blocks buying again when already a lifetime member, and shows history", async () => {
    const s = await member();
    const o = (await order(s.accessToken, "lifetime")).data.order;
    await pay(o);
    expect((await order(s.accessToken, "limited")).status).toBe(409);
    expect((await order(s.accessToken, "lifetime")).status).toBe(409);
    const h = await call(history, req("GET", "/x", { token: s.accessToken }));
    expect(JSON.stringify(h.data)).toContain("99900");
  });

  it("builds a WhatsApp link only for members", async () => {
    const s = await member();
    expect((await call(waLink, req("POST", "/x", { token: s.accessToken }))).status).toBe(403);
    const o = (await order(s.accessToken)).data.order;
    await pay(o);
    const ok = await call(waLink, req("POST", "/x", { token: s.accessToken }));
    expect(ok.status).toBe(200);
    expect(ok.data.url).toContain("wa.me/917797493140");
    expect(ok.data.url).toContain(encodeURIComponent(ok.data.reference));
    expect(decodeURIComponent(ok.data.url)).toContain("Test User");
    expect(decodeURIComponent(ok.data.url)).toContain("premium user");
    // Owner can clear the number; then the app gets a clear error instead of a broken link
    const { cookie } = await adminLogin();
    expect((await call(putSettings, adminReq("PUT", "/x", cookie, { whatsapp_number: null }))).status).toBe(200);
    expect((await call(waLink, req("POST", "/x", { token: s.accessToken }))).status).toBeGreaterThanOrEqual(400);
  });

  it("refund ends the membership and is audited; a second refund fails", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    await pay(o);
    const [txn] = await db.select().from(paymentTransactions);
    const { cookie } = await adminLogin();
    const r = await call(refund, adminReq("POST", "/x", cookie, { reason: "Customer asked" }), { id: txn.id });
    expect(r.status).toBe(200);
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeNull();
    expect((await call(refund, adminReq("POST", "/x", cookie, { reason: "Again please" }), { id: txn.id })).status).toBe(409);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "payment.refund"));
    expect(logs).toHaveLength(1);
    // After refund the user can buy again
    expect((await order(s.accessToken)).status).toBe(201);
  });

  it("plan price changes affect only new orders", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    await db.update(supportPlans).set({ pricePaise: 12900 }).where(eq(supportPlans.code, "limited"));
    const again = (await order(s.accessToken)).data.order;
    expect(again.id).toBe(o.id);
    expect(again.amountPaise).toBe(9900);
  });
});

describe("manual UPI flow", () => {
  beforeEach(() => {
    process.env.PAYMENT_PROVIDER = "manual_upi";
    resetConfigForTests();
  });

  it("texts the admin the plan price (as the OTP-template code) when a UTR is submitted, and never fails the submit", async () => {
    const sent: [string, string][] = [];
    try {
      const s = await member();
      const o = (await order(s.accessToken)).data.order;
      setOtpProviderForTests({ isMock: true, send: async (m, c) => { sent.push([m, c]); } });
      const sub = await call(manualProof, req("POST", "/x", { token: s.accessToken, body: { utr: "ALERT1234567" } }), { id: o.id });
      expect(sub.status).toBe(200);
      expect(sent).toEqual([["+917797493140", "99"]]);
      // A failing SMS provider must not break the user's submission.
      const s2 = await member();
      const o2 = (await order(s2.accessToken)).data.order;
      setOtpProviderForTests({ isMock: true, send: async () => { throw new Error("sms down"); } });
      expect((await call(manualProof, req("POST", "/x", { token: s2.accessToken, body: { utr: "ALERT7654321" } }), { id: o2.id })).status).toBe(200);
    } finally {
      setOtpProviderForTests(null);
    }
  });

  it("needs admin approval with the exact amount; rejects reuse of a UTR", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    expect(o.provider).toBe("manual_upi");
    const sub = await call(manualProof, req("POST", "/x", { token: s.accessToken, body: { utr: "123456789012" } }), { id: o.id });
    expect(sub.status).toBe(200);
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeNull();

    const s2 = await member();
    const o2 = (await order(s2.accessToken)).data.order;
    const dup = await call(manualProof, req("POST", "/x", { token: s2.accessToken, body: { utr: "123456789012" } }), { id: o2.id });
    expect(dup.status).toBe(409);

    const { cookie } = await adminLogin();
    const list = await call(adminPayments, adminReq("GET", "/api/admin/payments", cookie));
    const proof = list.data.pendingProofs[0];
    const wrong = await call(approve, adminReq("POST", "/x", cookie, { receivedAmountPaise: 100, note: "short payment" }), { id: proof.id });
    expect(wrong.status).toBe(400);
    const ok = await call(approve, adminReq("POST", "/x", cookie, { receivedAmountPaise: 9900, note: "matched statement" }), { id: proof.id });
    expect(ok.status).toBe(200);
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership).toBeTruthy();
    expect((await call(approve, adminReq("POST", "/x", cookie, { receivedAmountPaise: 9900, note: "again again" }), { id: proof.id })).status).toBe(409);
  });

  it("reject returns the order to pending so the user can retry", async () => {
    const s = await member();
    const o = (await order(s.accessToken)).data.order;
    await call(manualProof, req("POST", "/x", { token: s.accessToken, body: { utr: "999888777666" } }), { id: o.id });
    const { cookie } = await adminLogin();
    const proof = (await call(adminPayments, adminReq("GET", "/x", cookie))).data.pendingProofs[0];
    expect((await call(reject, adminReq("POST", "/x", cookie, { note: "not in statement" }), { id: proof.id })).status).toBe(200);
    const retry = await call(manualProof, req("POST", "/x", { token: s.accessToken, body: { utr: "555444333222" } }), { id: o.id });
    expect(retry.status).toBe(200);
  });

  it("other users cannot submit proof for someone else's order", async () => {
    const a = await member();
    const b = await member();
    const o = (await order(a.accessToken)).data.order;
    const r = await call(manualProof, req("POST", "/x", { token: b.accessToken, body: { utr: "111122223333" } }), { id: o.id });
    expect(r.status).toBe(404);
  });
});
