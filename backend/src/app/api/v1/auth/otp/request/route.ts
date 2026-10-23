import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { publicRoute } from "@/server/routes";
import { requestOtp } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = publicRoute(async ({ db, req }) => {
  const { mobile } = await readJson(req, z.object({ mobile: z.string().min(8).max(25) }));
  const r = await requestOtp(db, mobile, clientIp(req));
  return json({ ok: true, expiresInSeconds: r.expiresInSeconds });
});
