import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { call, freshDb, req } from "./helpers";
import { POST as reqOtp } from "@/app/api/v1/auth/otp/request/route";
import { POST as verify } from "@/app/api/v1/auth/otp/verify/route";
import { loadConfig, resetConfigForTests } from "@/server/config";

beforeAll(async () => {
  await freshDb();
});

function useApitxt() {
  process.env.OTP_PROVIDER = "apitxt";
  process.env.APITXT_AUTH_KEY = "test-key-123";
  process.env.APITXT_TEMPLATE_ID = "42";
  resetConfigForTests();
}
afterEach(() => {
  process.env.OTP_PROVIDER = "mock";
  delete process.env.APITXT_AUTH_KEY;
  delete process.env.APITXT_TEMPLATE_ID;
  resetConfigForTests();
  vi.unstubAllGlobals();
});

describe("apitxt SMS OTP provider", () => {
  it("sends a random 6-digit code via apitxt and that code (not 8899) logs the user in", async () => {
    useApitxt();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "success", message: "Sms OTP Sent Successfully", data: { request_id: "SMS-OTP-X", mobile: "919000000101", cost: 0.25 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const m = "+919000000101";
    const r = await call(reqOtp, req("POST", "/x", { body: { mobile: m }, headers: { "x-real-ip": "9.9.8.1" } }));
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://apitxt.com/api/sendOTP");
    expect(init.method).toBe("POST");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("authkey")).toBe("test-key-123");
    expect(form.get("mobile")).toBe("919000000101");
    expect(form.get("channel")).toBe("sms");
    expect(form.get("template_id")).toBe("42");
    const code = form.get("otp")!;
    expect(code).toMatch(/^\d{6}$/);
    // The key and code never appear in the API response.
    expect(JSON.stringify(r.data)).not.toContain("test-key");
    expect(JSON.stringify(r.data)).not.toContain(code);
    const demo = code === "8899" ? "000000" : "8899";
    expect((await call(verify, req("POST", "/x", { body: { mobile: m, code: demo } }))).status).toBe(400);
    expect((await call(verify, req("POST", "/x", { body: { mobile: m, code } }))).status).toBe(200);
  });

  it("returns a clear 502 when apitxt rejects or is unreachable", async () => {
    useApitxt();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "error", message: "Insufficient balance" }), { status: 402 })));
    const a = await call(reqOtp, req("POST", "/x", { body: { mobile: "+919000000102" }, headers: { "x-real-ip": "9.9.8.2" } }));
    expect(a.status).toBe(502);
    expect(JSON.stringify(a.data)).not.toContain("balance");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const b = await call(reqOtp, req("POST", "/x", { body: { mobile: "+919000000103" }, headers: { "x-real-ip": "9.9.8.3" } }));
    expect(b.status).toBe(502);
  });

  it("live config requires the key and a numeric template id", () => {
    const base = { APP_ENV: "production", DATABASE_URL: "postgres://x", JWT_SECRET: "a".repeat(40), OTP_SECRET: "b".repeat(40), BLOB_READ_WRITE_TOKEN: "t", OTP_PROVIDER: "apitxt", PAYMENT_PROVIDER: "manual_upi" } as any;
    expect(() => loadConfig(base)).toThrow(/APITXT_AUTH_KEY/);
    expect(() => loadConfig({ ...base, APITXT_AUTH_KEY: "k" })).not.toThrow();
    expect(() => loadConfig({ ...base, APITXT_AUTH_KEY: "k", APITXT_TEMPLATE_ID: "abc" })).toThrow();
  });
});
