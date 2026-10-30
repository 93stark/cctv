import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { authSessions, otpRequests, userProfiles, users } from "@/db/schema";
import { config } from "../config";
import { hmacHex, randomDigits, randomToken, safeEqual, sha256Hex } from "../crypto";
import { ApiError } from "../http";
import { resolveOtpProvider } from "../otp/provider";
import { rateLimit } from "../rateLimit";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS, signUserAccessToken, verifyUserAccessToken } from "../tokens";
import { crypto_randomUUID } from "../util";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

/** Returns +<country><number> or throws. Indian numbers must be 10 digits starting 6-9. */
export function normalizeMobile(input: string): string {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) {
    throw new ApiError(400, "invalid_mobile", "Enter a valid mobile number with country code, e.g. +919876543210.");
  }
  if (s.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(s)) {
    throw new ApiError(400, "invalid_mobile", "Enter a valid 10-digit Indian mobile number.");
  }
  return s;
}

function hashOtp(mobile: string, code: string): string {
  return hmacHex(config().OTP_SECRET, `${mobile}:${code}`);
}

export async function requestOtp(db: Db, rawMobile: string, ip: string): Promise<{ expiresInSeconds: number }> {
  const mobile = normalizeMobile(rawMobile);
  await rateLimit(db, `otp:req:mobile:${mobile}`, 3, 10 * 60);
  await rateLimit(db, `otp:req:ip:${ip}`, 20, 10 * 60);

  const provider = resolveOtpProvider();
  const code = provider.isMock ? config().MOCK_OTP_CODE : randomDigits(6);

  const existing = await db.select({ status: users.status }).from(users).where(eq(users.mobileE164, mobile)).limit(1);
  if (existing[0]?.status === "blocked") {
    throw new ApiError(403, "account_blocked", "This account is not allowed to sign in. Please contact support.");
  }

  await db.insert(otpRequests).values({
    mobileE164: mobile,
    codeHash: hashOtp(mobile, code),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    ip,
  });
  await provider.send(mobile, code);
  return { expiresInSeconds: OTP_TTL_SECONDS };
}

export type SessionTokens = { accessToken: string; refreshToken: string; expiresIn: number };

async function createSession(db: Db, userId: string, familyId: string, deviceLabel?: string | null): Promise<SessionTokens> {
  const refreshToken = randomToken(48);
  await db.insert(authSessions).values({
    userId,
    familyId,
    refreshHash: sha256Hex(refreshToken),
    deviceLabel: deviceLabel?.slice(0, 120) ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400 * 1000),
  });
  return { accessToken: await signUserAccessToken(userId), refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

export async function verifyOtp(
  db: Db,
  rawMobile: string,
  code: string,
  ip: string,
  deviceLabel?: string | null,
): Promise<SessionTokens & { isNewUser: boolean; userId: string }> {
  const mobile = normalizeMobile(rawMobile);
  await rateLimit(db, `otp:verify:mobile:${mobile}`, 10, 15 * 60);
  await rateLimit(db, `otp:verify:ip:${ip}`, 40, 15 * 60);

  const invalid = () => new ApiError(400, "invalid_otp", "The code is incorrect or has expired. Please request a new one.");

  // 1. Latest live OTP for this number.
  const latest = await db
    .select({ id: otpRequests.id })
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.mobileE164, mobile),
        isNull(otpRequests.consumedAt),
        gt(otpRequests.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  if (!latest[0]) throw invalid();

  // 2. Count the attempt atomically (and refuse once the limit is reached).
  const counted = await db
    .update(otpRequests)
    .set({ attempts: sql`${otpRequests.attempts} + 1` })
    .where(
      and(
        eq(otpRequests.id, latest[0].id),
        isNull(otpRequests.consumedAt),
        lt(otpRequests.attempts, OTP_MAX_ATTEMPTS),
      ),
    )
    .returning({ id: otpRequests.id, codeHash: otpRequests.codeHash });
  if (!counted[0]) throw invalid();

  // 3. Constant-time comparison of the HMAC of the submitted code.
  if (!safeEqual(counted[0].codeHash, hashOtp(mobile, code))) throw invalid();

  // 4. Consume exactly once, then sign the user in.
  return db.transaction(async (tx) => {
    const consumed = await tx
      .update(otpRequests)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpRequests.id, counted[0].id), isNull(otpRequests.consumedAt)))
      .returning({ id: otpRequests.id });
    if (!consumed[0]) throw invalid();

    const found = await tx.select().from(users).where(eq(users.mobileE164, mobile)).limit(1);
    let userId: string;
    let isNewUser = false;
    if (found[0]) {
      if (found[0].status === "blocked") throw new ApiError(403, "account_blocked", "This account is not allowed to sign in.");
      userId = found[0].id;
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    } else {
      const created = await tx.insert(users).values({ mobileE164: mobile, lastLoginAt: new Date() }).returning({ id: users.id });
      userId = created[0].id;
      isNewUser = true;
    }
    const tokens = await createSession(tx as unknown as Db, userId, crypto_randomUUID(), deviceLabel);
    return { ...tokens, isNewUser, userId };
  });
}

export async function refreshSession(db: Db, refreshToken: string): Promise<SessionTokens> {
  const hash = sha256Hex(refreshToken);
  const unauthorized = () => new ApiError(401, "invalid_refresh_token", "Please sign in again.");

  const outcome = await db.transaction(async (tx) => {
    const rows = await tx.select().from(authSessions).where(eq(authSessions.refreshHash, hash)).limit(1).for("update");
    const s = rows[0];
    if (!s) return { kind: "invalid" as const };
    if (s.revokedAt) {
      // A rotated token was used again: treat as theft and revoke the whole family.
      await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.familyId, s.familyId), isNull(authSessions.revokedAt)));
      return { kind: "reuse" as const };
    }
    if (s.expiresAt <= new Date()) return { kind: "invalid" as const };

    const user = await tx.select({ status: users.status }).from(users).where(eq(users.id, s.userId)).limit(1);
    if (user[0]?.status !== "active") return { kind: "invalid" as const };

    await tx.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, s.id));
    const tokens = await createSession(tx as unknown as Db, s.userId, s.familyId, s.deviceLabel);
    return { kind: "ok" as const, tokens };
  });

  if (outcome.kind !== "ok") throw unauthorized();
  return outcome.tokens;
}

export async function logout(db: Db, refreshToken: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.refreshHash, sha256Hex(refreshToken)), isNull(authSessions.revokedAt)));
}

/** Authenticate a request's Bearer token and make sure the account is still active. */
export async function requireUser(db: Db, req: Request): Promise<{ userId: string }> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) throw new ApiError(401, "unauthorized", "Please sign in.");
  const verified = await verifyUserAccessToken(m[1]);
  if (!verified) throw new ApiError(401, "unauthorized", "Your session has expired. Please sign in again.");
  const rows = await db.select({ status: users.status }).from(users).where(eq(users.id, verified.userId)).limit(1);
  if (rows[0]?.status !== "active") throw new ApiError(401, "unauthorized", "Please sign in again.");
  return { userId: verified.userId };
}

export async function userSummary(db: Db, userId: string) {
  const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const p = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return {
    id: userId,
    mobile: u[0].mobileE164,
    registeredAt: u[0].createdAt,
    profileComplete: Boolean(p[0]),
    profile: p[0]
      ? {
          fullName: p[0].fullName,
          location: p[0].location,
          email: p[0].email,
          category: p[0].category,
          photoUrl: p[0].photoUrl,
        }
      : null,
  };
}
