import { json, parseQuery } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { listUsers, pageQuery } from "@/server/services/admin";
import { audit } from "@/server/audit";
import { toCsv } from "@/server/util";
import { clientIp } from "@/server/http";
export const dynamic = "force-dynamic";

export const GET = adminRoute("users.view", async ({ db, req, admin }) => {
  const q = parseQuery(req, pageQuery.extend({}).passthrough());
  if (new URL(req.url).searchParams.get("format") === "csv") {
    if (!admin.permissions.has("users.export")) return json({ error: { code: "forbidden", message: "No export permission." } }, 403);
    const { rows } = await listUsers(db, q, { all: true });
    await audit(db, admin, "users.export", "user", null, null, { count: rows.length, filters: { q: q.q, status: q.status } }, clientIp(req));
    const csv = toCsv(
      ["Name", "Mobile", "Location", "Email", "Category", "Status", "Joined"],
      rows.map((r) => [r.fullName, r.mobile, r.location, r.email, r.category, r.status, r.createdAt.toISOString()]),
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="users.csv"', "Cache-Control": "no-store" } });
  }
  return json(await listUsers(db, q));
});
