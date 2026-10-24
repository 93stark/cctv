import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().optional().default(""),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  OTP_SECRET: z.string().min(32, "OTP_SECRET must be at least 32 characters"),
  OTP_PROVIDER: z.enum(["mock", "apitxt", "none"]).default("mock"),
  /** apitxt.com SMS OTP: Dashboard -> API Keys. Keep it only in the server environment. */
  APITXT_AUTH_KEY: z.string().optional().default(""),
  /** Optional apitxt SMS template id (integer, from Dashboard -> SMS Templates). Empty = apitxt system default template. */
  APITXT_TEMPLATE_ID: z.string().regex(/^\d*$/, "APITXT_TEMPLATE_ID must be a number").optional().default(""),
  MOCK_OTP_CODE: z.string().regex(/^\d{4,6}$/).default("8899"),
  /** Explicit opt-in to run the demo OTP on a deployed server. Remove once a real OTP provider is live. */
  ALLOW_DEMO_OTP: z.enum(["true", "false"]).default("false"),
  PAYMENT_PROVIDER: z.enum(["mock", "manual_upi"]).default("mock"),
  MOCK_WEBHOOK_SECRET: z.string().optional().default(""),
  ADMIN_BOOTSTRAP_EMAIL: z.string().optional().default(""),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional().default(""),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isLive: boolean;
};

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${msg}`);
  }
  const c = parsed.data;
  const isProduction = c.APP_ENV === "production";
  const isLive = isProduction || c.APP_ENV === "staging";

  if (isLive) {
    const problems: string[] = [];
    if (!c.DATABASE_URL) problems.push("DATABASE_URL is required");
    if (/change-me/i.test(c.JWT_SECRET) || /change-me/i.test(c.OTP_SECRET)) {
      problems.push("JWT_SECRET and OTP_SECRET must be real random secrets");
    }
    if (!c.BLOB_READ_WRITE_TOKEN) problems.push("BLOB_READ_WRITE_TOKEN is required for file uploads");
    if (c.OTP_PROVIDER === "mock" && c.ALLOW_DEMO_OTP !== "true") {
      problems.push("OTP_PROVIDER=mock is not allowed outside development (set ALLOW_DEMO_OTP=true only for a temporary demo)");
    }
    if (c.OTP_PROVIDER === "apitxt" && !c.APITXT_AUTH_KEY) problems.push("APITXT_AUTH_KEY is required when OTP_PROVIDER=apitxt");
    if (c.OTP_PROVIDER === "none") problems.push("OTP_PROVIDER=none cannot send OTPs");
    if (c.PAYMENT_PROVIDER === "mock") problems.push("PAYMENT_PROVIDER=mock is not allowed outside development");
    if (problems.length) throw new Error(`Unsafe configuration for ${c.APP_ENV}: ${problems.join("; ")}`);
  }

  return {
    ...c,
    isProduction,
    isLive,
  };
}

export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Tests only. */
export function resetConfigForTests() {
  cached = null;
}
