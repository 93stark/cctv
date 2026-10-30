import { getDb, resetDbForTests } from "@/db";
import { seed } from "@/db/seed";
import { resetConfigForTests } from "@/server/config";
import { hmacHex } from "@/server/crypto";

export const ADMIN_EMAIL = "owner@example.test";
export const ADMIN_PASSWORD = "correct-horse-battery-1";

export async function freshDb() {
  await resetDbForTests();
  resetConfigForTests();
  const db = await getDb();
  await seed(db, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD });
  return db;
}

export function req(method: string, path: string, opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": "10.0.0.1", ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export async function call<T = any>(handler: (r: Request, c: any) => Promise<Response>, r: Request, params: Record<string, string> = {}) {
  const res = await handler(r, { params: Promise.resolve(params) });
  const text = await res.text();
  let data: T = undefined as T;
  try {
    data = JSON.parse(text);
  } catch {
    data = text as T;
  }
  return { status: res.status, data, headers: res.headers };
}

let ipCounter = 1;
export async function loginUser(mobile: string) {
  const { POST: reqOtp } = await import("@/app/api/v1/auth/otp/request/route");
  const { POST: verify } = await import("@/app/api/v1/auth/otp/verify/route");
  const ip = `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  const h = { "x-real-ip": ip };
  const a = await call(reqOtp, req("POST", "/api/v1/auth/otp/request", { body: { mobile }, headers: h }));
  if (a.status !== 200) throw new Error("otp request failed " + JSON.stringify(a.data));
  const v = await call(verify, req("POST", "/api/v1/auth/otp/verify", { body: { mobile, code: "8899" }, headers: h }));
  if (v.status !== 200) throw new Error("verify failed " + JSON.stringify(v.data));
  return v.data as { accessToken: string; refreshToken: string; user: { id: string } };
}

export async function completeProfile(token: string) {
  const { PUT } = await import("@/app/api/v1/me/route");
  return call(PUT, req("PUT", "/api/v1/me", { token, body: { fullName: "Test User", location: "Purulia, West Bengal", category: "student" } }));
}

export function signedWebhook(body: object) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/v1/webhooks/payments/mock", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": hmacHex("test-webhook-secret", raw) },
    body: raw,
  });
}

export async function adminLogin() {
  const { POST } = await import("@/app/api/admin/auth/login/route");
  const r = await call(POST, req("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }));
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { cookie, status: r.status };
}

export function adminReq(method: string, path: string, cookie: string, body?: unknown) {
  return req(method, path, { body, headers: { cookie, "x-admin-csrf": "1" } });
}
