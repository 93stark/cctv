import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";

const enc = new TextEncoder();
const ISSUER = "cctv-platform";

function userKey() {
  return enc.encode(`${config().JWT_SECRET}:user`);
}
function adminKey() {
  return enc.encode(`${config().JWT_SECRET}:admin`);
}

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;
export const ADMIN_TTL_SECONDS = 8 * 60 * 60;

export async function signUserAccessToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(userKey());
}

export async function verifyUserAccessToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, userKey(), { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "user" || !payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export async function signAdminToken(adminId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ typ: "admin", tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(adminKey());
}

export async function verifyAdminToken(token: string): Promise<{ adminId: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, adminKey(), { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "admin" || !payload.sub || typeof payload.tv !== "number") return null;
    return { adminId: payload.sub, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}
