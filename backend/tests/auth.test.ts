import { beforeAll, describe, expect, it } from "vitest";
import { call, completeProfile, freshDb, loginUser, req } from "./helpers";
import { POST as reqOtp } from "@/app/api/v1/auth/otp/request/route";
import { POST as verify } from "@/app/api/v1/auth/otp/verify/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as me, DELETE as delMe } from "@/app/api/v1/me/route";
import { GET as membership } from "@/app/api/v1/membership/route";

beforeAll(async () => {
  await freshDb();
});

describe("OTP auth", () => {
  it("rejects a wrong code and accepts the right one once", async () => {
    const m = "+919000000001";
    await call(reqOtp, req("POST", "/x", { body: { mobile: m }, headers: { "x-real-ip": "9.9.9.1" } }));
    const bad = await call(verify, req("POST", "/x", { body: { mobile: m, code: "000000" } }));
    expect(bad.status).toBe(400);
    const ok = await call(verify, req("POST", "/x", { body: { mobile: m, code: "8899" } }));
    expect(ok.status).toBe(200);
    expect(ok.data.isNewUser).toBe(true);
    const replay = await call(verify, req("POST", "/x", { body: { mobile: m, code: "8899" } }));
    expect(replay.status).toBe(400);
  });

  it("locks the code after 5 wrong attempts", async () => {
    const m = "+919000000002";
    await call(reqOtp, req("POST", "/x", { body: { mobile: m }, headers: { "x-real-ip": "9.9.9.2" } }));
    for (let i = 0; i < 5; i++) await call(verify, req("POST", "/x", { body: { mobile: m, code: "111111" } }));
    const r = await call(verify, req("POST", "/x", { body: { mobile: m, code: "8899" } }));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("rate limits OTP requests per mobile", async () => {
    const m = "+919000000003";
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await call(reqOtp, req("POST", "/x", { body: { mobile: m }, headers: { "x-real-ip": "9.9.9.3" } }))).status);
    }
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[4]).toBe(429);
  });

  it("rejects an invalid mobile number", async () => {
    const r = await call(reqOtp, req("POST", "/x", { body: { mobile: "12345678" } }));
    expect(r.status).toBe(400);
  });

  it("requires a token for protected routes", async () => {
    expect((await call(me, req("GET", "/x"))).status).toBe(401);
    expect((await call(me, req("GET", "/x", { token: "garbage" }))).status).toBe(401);
  });

  it("validates profile and persists it", async () => {
    const s = await loginUser("+919000000004");
    const { PUT } = await import("@/app/api/v1/me/route");
    const bad = await call(PUT, req("PUT", "/x", { token: s.accessToken, body: { fullName: "A", location: "x", category: "hacker" } }));
    expect(bad.status).toBe(400);
    expect((await completeProfile(s.accessToken)).status).toBe(200); // no PIN, no email needed
    const got = await call(me, req("GET", "/x", { token: s.accessToken }));
    expect(got.data.user.profile.email).toBeNull();
    expect(got.data.user.profile.pinCode).toBeUndefined();
    const body = (email?: string) => ({ fullName: "Test User", location: "Purulia", category: "student", ...(email === undefined ? {} : { email }) });
    expect((await call(PUT, req("PUT", "/x", { token: s.accessToken, body: body("not-an-email") }))).status).toBe(400);
    expect((await call(PUT, req("PUT", "/x", { token: s.accessToken, body: body("Ali@Example.COM") }))).status).toBe(200);
    expect((await call(me, req("GET", "/x", { token: s.accessToken }))).data.user.profile.email).toBe("ali@example.com");
    // Leaving the field out keeps it; an empty value clears it.
    await call(PUT, req("PUT", "/x", { token: s.accessToken, body: body() }));
    expect((await call(me, req("GET", "/x", { token: s.accessToken }))).data.user.profile.email).toBe("ali@example.com");
    await call(PUT, req("PUT", "/x", { token: s.accessToken, body: body("") }));
    expect((await call(me, req("GET", "/x", { token: s.accessToken }))).data.user.profile.email).toBeNull();
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const s = await loginUser("+919000000005");
    const r1 = await call(refresh, req("POST", "/x", { body: { refreshToken: s.refreshToken } }));
    expect(r1.status).toBe(200);
    const reuse = await call(refresh, req("POST", "/x", { body: { refreshToken: s.refreshToken } }));
    expect(reuse.status).toBe(401);
    const afterReuse = await call(refresh, req("POST", "/x", { body: { refreshToken: r1.data.refreshToken } }));
    expect(afterReuse.status).toBe(401);
  });

  it("logout invalidates the refresh token and login again keeps the same account", async () => {
    const s = await loginUser("+919000000006");
    await call(logout, req("POST", "/x", { token: s.accessToken, body: { refreshToken: s.refreshToken } }));
    expect((await call(refresh, req("POST", "/x", { body: { refreshToken: s.refreshToken } }))).status).toBe(401);
    const again = await loginUser("+919000000006");
    expect(again.user.id).toBe(s.user.id);
  });

  it("deletes an account and anonymises it", async () => {
    const s = await loginUser("+919000000007");
    await completeProfile(s.accessToken);
    const d = await call(delMe, req("DELETE", "/x", { token: s.accessToken }));
    expect(d.status).toBe(200);
    expect((await call(membership, req("GET", "/x", { token: s.accessToken }))).status).toBe(401);
  });
});

describe("demo OTP safety", () => {
  it("refuses mock OTP on a live server unless explicitly allowed", async () => {
    const { loadConfig } = await import("@/server/config");
    const base = { APP_ENV: "production", DATABASE_URL: "postgres://x", JWT_SECRET: "a".repeat(40), OTP_SECRET: "b".repeat(40), BLOB_READ_WRITE_TOKEN: "t", OTP_PROVIDER: "mock", PAYMENT_PROVIDER: "manual_upi" } as any;
    expect(() => loadConfig(base)).toThrow(/ALLOW_DEMO_OTP/);
    expect(() => loadConfig({ ...base, ALLOW_DEMO_OTP: "true" })).not.toThrow();
    expect(loadConfig({ ...base, ALLOW_DEMO_OTP: "true" }).MOCK_OTP_CODE).toBe("8899");
  });
});
