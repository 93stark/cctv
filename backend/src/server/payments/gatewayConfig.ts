import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { appSettings } from "@/db/schema";
import { config } from "../config";

/**
 * Payment gateway credentials entered by the admin ("Payments setup" tab).
 * The key secret and webhook secret are encrypted (AES-256-GCM) before they reach the database,
 * are never returned by any API, and the key secret never leaves the server.
 */
export type Gateway = "razorpay" | "manual_upi";
export type GatewayConfig = {
  gateway: Gateway | null; // null = never chosen (falls back to the PAYMENT_PROVIDER environment variable)
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
};
type Stored = { gateway?: Gateway; keyId?: string; secretEnc?: string; webhookEnc?: string };

const KEY = "gateway.config";

function encKey(): Buffer {
  const c = config();
  return crypto.createHash("sha256").update(`gateway-config:${c.SETTINGS_ENCRYPTION_KEY || c.JWT_SECRET}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decryptSecret(enc: string): string | null {
  try {
    if (!enc.startsWith("v1.")) return null;
    const raw = Buffer.from(enc.slice(3), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", encKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null; // wrong key or tampered value
  }
}

async function readStored(db: Db): Promise<Stored> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return (rows[0]?.valueJson as Stored | undefined) ?? {};
}

export async function getGatewayConfig(db: Db): Promise<GatewayConfig> {
  const s = await readStored(db);
  return {
    gateway: s.gateway ?? null,
    keyId: s.keyId ?? null,
    keySecret: s.secretEnc ? decryptSecret(s.secretEnc) : null,
    webhookSecret: s.webhookEnc ? decryptSecret(s.webhookEnc) : null,
  };
}

const last4 = (v: string | null) => (v ? v.slice(-4) : null);

/** What the admin screen may see: no secrets, only whether they are saved and their last 4 characters. */
export async function gatewayAdminView(db: Db) {
  const c = await getGatewayConfig(db);
  return {
    gateway: c.gateway ?? "razorpay",
    keyId: c.keyId,
    mode: c.keyId?.startsWith("rzp_live_") ? ("live" as const) : c.keyId?.startsWith("rzp_test_") ? ("test" as const) : null,
    hasKeySecret: Boolean(c.keySecret),
    keySecretLast4: last4(c.keySecret),
    hasWebhookSecret: Boolean(c.webhookSecret),
    webhookSecretLast4: last4(c.webhookSecret),
    configured: Boolean(c.keyId && c.keySecret),
  };
}

export type GatewayPatch = { gateway?: Gateway; keyId?: string; keySecret?: string; webhookSecret?: string };

export async function saveGatewayConfig(db: Db, adminId: string | null, patch: GatewayPatch) {
  const cur = await readStored(db);
  const next: Stored = { ...cur };
  if (patch.gateway) next.gateway = patch.gateway;
  if (patch.keyId) next.keyId = patch.keyId;
  if (patch.keySecret) next.secretEnc = encryptSecret(patch.keySecret);
  if (patch.webhookSecret) next.webhookEnc = encryptSecret(patch.webhookSecret);
  await db
    .insert(appSettings)
    .values({ key: KEY, valueJson: next, updatedByAdmin: adminId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: next, version: sql`${appSettings.version} + 1`, updatedAt: new Date(), updatedByAdmin: adminId },
    });
}
