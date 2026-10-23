import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { notifications, userNotifications } from "@/db/schema";
import { ApiError } from "../http";

export async function listNotifications(db: Db, userId: string, limit = 50) {
  const now = new Date();
  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      type: notifications.type,
      createdAt: notifications.createdAt,
      publishAt: notifications.publishAt,
      readAt: userNotifications.readAt,
    })
    .from(notifications)
    .leftJoin(
      userNotifications,
      and(eq(userNotifications.notificationId, notifications.id), eq(userNotifications.userId, userId)),
    )
    .where(
      and(
        eq(notifications.status, "published"),
        or(isNull(notifications.userId), eq(notifications.userId, userId)),
        or(isNull(notifications.publishAt), lte(notifications.publishAt, now)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    type: r.type,
    createdAt: r.publishAt ?? r.createdAt,
    isRead: r.readAt !== null,
  }));
}

export async function markNotificationRead(db: Db, userId: string, notificationId: string) {
  const n = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.status, "published"),
        or(isNull(notifications.userId), eq(notifications.userId, userId)),
      ),
    )
    .limit(1);
  if (!n[0]) throw new ApiError(404, "not_found", "Notification not found.");
  await db.insert(userNotifications).values({ userId, notificationId }).onConflictDoNothing();
}

/** Create and publish a notification addressed to one user (payment and membership events). */
export async function notifyUser(
  db: Db,
  userId: string,
  type: "payment" | "membership",
  title: string,
  body: string,
) {
  await db.insert(notifications).values({ userId, type, title, body, status: "published" });
}
