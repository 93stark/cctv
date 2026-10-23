import { z } from "zod";
import { cookieHeader, loginAdmin } from "@/server/adminAuth";
import { clientIp, json, readJson } from "@/server/http";
import { publicRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

const body = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) }).strict();

export const POST = publicRoute(async ({ db, req }) => {
  const { email, password } = await readJson(req, body);
  const { admin, token } = await loginAdmin(db, email, password, clientIp(req));
  return json({ admin: { email: admin.email, role: admin.roleName } }, 200, { "Set-Cookie": cookieHeader(token) });
});
