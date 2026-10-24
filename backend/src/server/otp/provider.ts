import { config } from "../config";
import { ApiError } from "../http";

export interface OtpProvider {
  /** True only for the development mock. The mock always accepts MOCK_OTP_CODE. */
  readonly isMock: boolean;
  send(mobileE164: string, code: string): Promise<void>;
}

class MockOtpProvider implements OtpProvider {
  readonly isMock = true;
  async send(mobileE164: string): Promise<void> {
    // Never log the code itself; testers use the documented MOCK_OTP_CODE.
    console.log(`[mock-otp] OTP "sent" to ${mobileE164}. Use the MOCK_OTP_CODE value from your .env.`);
  }
}

/**
 * apitxt.com Unified OTP API (SMS only). We generate and hash the code ourselves; apitxt only delivers it.
 * POST https://apitxt.com/api/sendOTP, application/x-www-form-urlencoded: authkey, mobile, otp, channel=sms,
 * optional template_id. Success: {"status":"success","message":...,"data":{"request_id","mobile","cost"}}.
 * apitxt limits 3 OTPs per mobile per minute and refunds failed deliveries.
 */
class ApitxtOtpProvider implements OtpProvider {
  readonly isMock = false;
  async send(mobileE164: string, code: string): Promise<void> {
    const cfg = config();
    const body = new URLSearchParams({
      authkey: cfg.APITXT_AUTH_KEY,
      mobile: mobileE164.replace(/\D/g, ""),
      otp: code,
      channel: "sms",
    });
    if (cfg.APITXT_TEMPLATE_ID) body.set("template_id", cfg.APITXT_TEMPLATE_ID);
    let status = 0;
    type Resp = { status?: string; message?: string; data?: { request_id?: string } };
    let json = null as Resp | null;
    try {
      const res = await fetch("https://apitxt.com/api/sendOTP", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      json = (await res.json().catch(() => null)) as Resp | null;
    } catch (e) {
      console.error("[otp] apitxt request failed:", e instanceof Error ? e.name : "error");
      throw new ApiError(502, "otp_send_failed", "Could not send the OTP right now. Please try again in a minute.");
    }
    if (status < 200 || status >= 300 || String(json?.status).toLowerCase() !== "success") {
      // Never log the code or the key.
      console.error(`[otp] apitxt rejected the request: http=${status} status=${json?.status ?? "?"} message=${String(json?.message ?? "").slice(0, 120)}`);
      throw new ApiError(502, "otp_send_failed", "Could not send the OTP right now. Please try again in a minute.");
    }
    console.log(`[otp] apitxt accepted OTP request ${json?.data?.request_id ?? ""}`);
  }
}

/**
 * Add real providers here (WhatsApp Cloud API, MSG91, Gupshup, Twilio Verify, ...).
 * Each one implements OtpProvider and is selected by OTP_PROVIDER.
 * Until one is configured, production refuses to start with OTP_PROVIDER=mock (see config.ts).
 */
export function getOtpProvider(): OtpProvider {
  const cfg = config();
  if (cfg.OTP_PROVIDER === "mock") {
    if (cfg.isLive && cfg.ALLOW_DEMO_OTP !== "true") throw new Error("Mock OTP provider is not allowed outside development");
    return new MockOtpProvider();
  }
  if (cfg.OTP_PROVIDER === "apitxt") {
    if (!cfg.APITXT_AUTH_KEY) throw new ApiError(503, "otp_unavailable", "OTP service is not configured yet.");
    return new ApitxtOtpProvider();
  }
  throw new ApiError(503, "otp_unavailable", "OTP service is not configured yet.");
}

export function setOtpProviderForTests(p: OtpProvider | null) {
  override = p;
}
let override: OtpProvider | null = null;
export function resolveOtpProvider(): OtpProvider {
  return override ?? getOtpProvider();
}
