import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";
import { ApiError } from "./http";

/**
 * Fixed-window rate limit stored in the database (works on serverless).
 * Throws 429 when `limit` is exceeded inside `windowSeconds`.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - windowSeconds * 1000).toISOString();

  const rows = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${cutoffIso}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${cutoffIso}::timestamptz then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const row = rows[0];
  if (row.count > limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000),
    );
    throw new ApiError(429, "rate_limited", "Too many attempts. Please wait and try again.", {
      retryAfterSeconds: retryAfter,
    });
  }
}

/** Throws 429 if `key` has already used up its allowance in the window, without consuming any. */
export async function rateLimitPeek(db: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const row = rows[0];
  if (!row) return;
  const expires = row.windowStart.getTime() + windowSeconds * 1000;
  if (expires > Date.now() && row.count >= limit) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please wait and try again.", {
      retryAfterSeconds: Math.max(1, Math.ceil((expires - Date.now()) / 1000)),
    });
  }
}
