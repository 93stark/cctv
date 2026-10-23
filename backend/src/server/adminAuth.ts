import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { adminPermissions, adminUsers } from "@/db/schema";
import { audit } from "./audit";
import { config } from "./config";
import { hashPassword, verifyPassword } from "./crypto";
import { ApiError } from "./http";
import type { Permission } from "./permissions";
import { rateLimit, rateLimitPeek } from "./rateLimit";
import { ADMIN_TTL_SECONDS, signAdminToken, verifyAdminToken } from "./tokens";

export const ADMIN_COOKIE = "cctv_admin";
export const MIN_ADMIN_PASSWORD = 12;

export type AdminContext = { id: string; email: string; role: string; permissions: Set<string> };

// A valid hash of a random password, used to keep login timing similar when the email is unknown.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing-only"));

export function validateNewPassword(p: string) {
  if (p.length < MIN_ADMIN_PASSWORD) {
    throw new ApiError(400, "weak_password", `Password must be at least ${MIN_ADMIN_PASSWORD} characters.`);
  }
  if (/^(.)\1+$/.test(p) || /^(password|123456|qwerty)/i.test(p)) {
    throw new ApiError(400, "weak_password", "Choose a less guessable password.");
  }
}

export function cookieHeader(token: string | null): string {
  const secure = config().isLive ? "; Secure" : "";
  if (!token) return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_TTL_SECONDS}${secure}`;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function loginAdmin(db: Db, emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  // Only failed attempts consume the allowance, so a legitimate admin is never locked out by their own logins.
  const emailKey = `admin:login:email:${email}`;
  const ipKey = `admin:login:ip:${ip}`;
  await rateLimitPeek(db, emailKey, 5, 15 * 60);
  await rateLimitPeek(db, ipKey, 20, 15 * 60);

  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const admin = rows[0];
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDummyHash()));
  if (!admin || !ok || admin.disabled) {
    await rateLimit(db, emailKey, 5, 15 * 60).catch(() => {});
    await rateLimit(db, ipKey, 20, 15 * 60).catch(() => {});
    throw new ApiError(401, "invalid_credentials", "Incorrect email or password.");
  }
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
  await audit(db, { id: admin.id, email: admin.email }, "admin.login", "admin_user", admin.id, null, null, ip);
  return { admin, token: await signAdminToken(admin.id, admin.tokenVersion) };
}

export async function logoutAdmin(db: Db, adminId: string) {
  const rows = await db.select({ tv: adminUsers.tokenVersion }).from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  if (rows[0]) await db.update(adminUsers).set({ tokenVersion: rows[0].tv + 1 }).where(eq(adminUsers.id, adminId));
}

function checkCsrf(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.headers.get("x-admin-csrf") !== "1") throw new ApiError(403, "csrf", "Missing CSRF header.");
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* fall through */
    }
    if (!host || originHost !== host) throw new ApiError(403, "csrf", "Cross-origin request blocked.");
  }
}

/** Authenticate the admin cookie, check CSRF protections, and enforce the permission on the server. */
export async function requireAdmin(db: Db, req: Request, permission?: Permission): Promise<AdminContext> {
  const token = readCookie(req, ADMIN_COOKIE);
  const verified = token ? await verifyAdminToken(token) : null;
  if (!verified) throw new ApiError(401, "unauthorized", "Please sign in.");
  checkCsrf(req);

  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, verified.adminId)).limit(1);
  const admin = rows[0];
  if (!admin || admin.disabled || admin.tokenVersion !== verified.tokenVersion) {
    throw new ApiError(401, "unauthorized", "Please sign in again.");
  }
  const perms = await db
    .select({ p: adminPermissions.permission })
    .from(adminPermissions)
    .where(eq(adminPermissions.roleName, admin.roleName));
  const ctx: AdminContext = { id: admin.id, email: admin.email, role: admin.roleName, permissions: new Set(perms.map((r) => r.p)) };
  if (permission && !ctx.permissions.has(permission)) {
    throw new ApiError(403, "forbidden", "You do not have permission to do this.");
  }
  return ctx;
}

