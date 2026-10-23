import { json } from "@/server/http";
import { userRoute, type IdParams } from "@/server/routes";
import { getOrder } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/** Status refresh. The app polls this after checkout; only the server decides if payment succeeded. */
export const GET = userRoute<IdParams>(async ({ db, userId, ctx }) => {
  const { id } = await ctx.params;
  return json({ order: await getOrder(db, userId, id) });
});
