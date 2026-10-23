import { ApiError, json } from "@/server/http";
import { userRoute, type IdParams } from "@/server/routes";
import { markNotificationRead } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export const POST = userRoute<IdParams>(async ({ db, userId, ctx }) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "Notification not found.");
  await markNotificationRead(db, userId, id);
  return json({ ok: true });
});
