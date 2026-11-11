import { z } from "zod";
import { changeAdminPassword, cookieHeader } from "@/server/adminAuth";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).strict();

export const POST = adminRoute(null, async ({ db, admin, req }) => {
  const { currentPassword, newPassword } = await readJson(req, body);
  const token = await changeAdminPassword(db, admin.id, currentPassword, newPassword, clientIp(req));
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(token) });
});
