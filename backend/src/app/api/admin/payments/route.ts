import { audit } from "@/server/audit";
import { clientIp, json, parseQuery } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { listPayments, pageQuery } from "@/server/services/admin";
import { toCsv } from "@/server/util";
export const dynamic = "force-dynamic";

export const GET = adminRoute("payments.view", async ({ db, req, admin }) => {
  const q = parseQuery(req, pageQuery.passthrough());
  if (new URL(req.url).searchParams.get("format") === "csv") {
    if (!admin.permissions.has("payments.export")) return json({ error: { code: "forbidden", message: "No export permission." } }, 403);
    const { rows } = await listPayments(db, q, { all: true });
    await audit(db, admin, "payments.export", "payment_order", null, null, { count: rows.length }, clientIp(req));
    const csv = toCsv(
      ["Order", "Date", "Mobile", "Plan", "Amount INR", "Status", "Provider", "Txn ref"],
      rows.map((r) => [r.orderRef, r.createdAt.toISOString(), r.mobileMasked, r.planCode, r.amountPaise / 100, r.status, r.provider, r.txnRef ?? ""]),
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments.csv"', "Cache-Control": "no-store" } });
  }
  return json(await listPayments(db, q));
});
