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
  throw new ApiError(503, "otp_unavailable", "OTP service is not configured yet.");
}

export function setOtpProviderForTests(p: OtpProvider | null) {
  override = p;
}
let override: OtpProvider | null = null;
export function resolveOtpProvider(): OtpProvider {
  return override ?? getOtpProvider();
}
