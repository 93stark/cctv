import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute, type IdParams } from "@/server/routes";
import { getUserDetail, setUserStatus } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const GET = adminRoute<IdParams>("users.view", async ({ db, ctx }) => json(await getUserDetail(db, (await ctx.params).id)));

export const PATCH = adminRoute<IdParams>("users.manage", async ({ db, req, ctx, admin }) => {
  const { status } = await readJson(req, z.object({ status: z.enum(["active", "blocked"]) }).strict());
  await setUserStatus(db, admin, (await ctx.params).id, status, clientIp(req));
  return json({ ok: true });
});
