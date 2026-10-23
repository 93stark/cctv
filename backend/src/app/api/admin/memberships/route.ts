import { clientIp, json, parseQuery, readJson } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { grantInput, grantMembership, listMemberships, pageQuery } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const GET = adminRoute("memberships.view", async ({ db, req }) => json({ rows: await listMemberships(db, parseQuery(req, pageQuery.passthrough())) }));

export const POST = adminRoute("memberships.manage", async ({ db, req, admin }) => {
  const m = await grantMembership(db, admin, await readJson(req, grantInput), clientIp(req));
  return json({ id: m.id }, 201);
});
