import { cookieHeader, logoutAdmin } from "@/server/adminAuth";
import { json } from "@/server/http";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

export const POST = adminRoute(null, async ({ db, admin }) => {
  await logoutAdmin(db, admin.id);
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(null) });
});
