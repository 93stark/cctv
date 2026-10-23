import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { listNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db, userId }) => {
  const items = await listNotifications(db, userId);
  return json({ items, unreadCount: items.filter((n) => !n.isRead).length });
});
