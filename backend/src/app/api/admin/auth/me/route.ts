import { json } from "@/server/http";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

export const GET = adminRoute(null, async ({ admin }) =>
  json({ admin: { email: admin.email, role: admin.role, permissions: [...admin.permissions] } }),
);
