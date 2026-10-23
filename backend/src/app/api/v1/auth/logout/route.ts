import { z } from "zod";
import { json, readJson } from "@/server/http";
import { publicRoute } from "@/server/routes";
import { logout } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = publicRoute(async ({ db, req }) => {
  const { refreshToken } = await readJson(req, z.object({ refreshToken: z.string().min(20).max(200) }));
  await logout(db, refreshToken);
  return json({ ok: true });
});
