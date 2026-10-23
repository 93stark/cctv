import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { publicRoute } from "@/server/routes";
import { userSummary, verifyOtp } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = publicRoute(async ({ db, req }) => {
  const body = await readJson(
    req,
    z.object({
      mobile: z.string().min(8).max(25),
      code: z.string().regex(/^\d{4,6}$/, "Enter the verification code"),
      deviceLabel: z.string().max(120).optional(),
    }),
  );
  const r = await verifyOtp(db, body.mobile, body.code, clientIp(req), body.deviceLabel);
  const user = await userSummary(db, r.userId);
  return json({
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    expiresIn: r.expiresIn,
    isNewUser: r.isNewUser,
    user,
  });
});
