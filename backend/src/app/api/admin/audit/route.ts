import { json, parseQuery } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { listAudit, pageQuery } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const GET = adminRoute("audit.view", async ({ db, req }) => json({ rows: await listAudit(db, parseQuery(req, pageQuery.passthrough())) }));
