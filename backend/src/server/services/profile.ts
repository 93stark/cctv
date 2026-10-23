import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  authSessions,
  mediaAssets,
  notifications,
  paymentOrders,
  userNotifications,
  userProfiles,
  users,
} from "@/db/schema";
import { ApiError } from "../http";
import { readUpload, storeFile, IMAGE_TYPES } from "../storage";

export const CATEGORIES = ["individual", "technician", "business_owner", "student"] as const;

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export const profileInput = z.object({
  fullName: z.string().transform(clean).pipe(z.string().min(2, "Enter your full name").max(80)),
  location: z.string().transform(clean).pipe(z.string().min(3, "Enter your location").max(200)),
  pinCode: z.string().trim().regex(/^[0-9]{6}$/, "PIN code must be 6 digits"),
  category: z.enum(CATEGORIES),
});
export type ProfileInput = z.infer<typeof profileInput>;

export async function upsertProfile(db: Db, userId: string, input: ProfileInput) {
  await db
    .insert(userProfiles)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...input, updatedAt: new Date() } });
}

export async function setProfilePhoto(db: Db, userId: string, req: Request): Promise<string> {
  const profile = await db.select({ id: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!profile[0]) throw new ApiError(409, "profile_required", "Complete your profile before uploading a photo.");
  const { bytes, mime } = await readUpload(req, { allowed: Object.keys(IMAGE_TYPES), maxBytes: 2 * 1024 * 1024 });
  const stored = await storeFile(`avatars/${userId}`, bytes, mime);
  await db.insert(mediaAssets).values({
    url: stored.url,
    pathname: stored.pathname,
    mime,
    sizeBytes: stored.sizeBytes,
    purpose: "avatar",
    uploadedByUser: userId,
  });
  await db.update(userProfiles).set({ photoUrl: stored.url, updatedAt: new Date() }).where(eq(userProfiles.userId, userId));
  return stored.url;
}

/**
 * Account deletion: remove personal data and sign the user out everywhere.
 * Payment orders, transactions and memberships are kept (anonymised) because tax and
 * accounting rules require payment records to be retained.
 */
export async function deleteAccount(db: Db, userId: string) {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await tx.delete(userNotifications).where(eq(userNotifications.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(mediaAssets).where(eq(mediaAssets.uploadedByUser, userId));
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, userId));
    await tx
      .update(paymentOrders)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(eq(paymentOrders.userId, userId), inArray(paymentOrders.status, ["pending", "awaiting_review"])));
    await tx
      .update(users)
      .set({ status: "deleted", deletedAt: now, mobileE164: `deleted:${userId}` })
      .where(eq(users.id, userId));
  });
}
