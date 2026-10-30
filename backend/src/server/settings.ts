import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { appSettings } from "@/db/schema";

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "https:" && !p.username && !p.password;
    } catch {
      return false;
    }
  }, "Must be an https:// URL without credentials");
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Enter a valid phone number");
const text = (max: number) => z.string().trim().max(max);

type Def = { schema: z.ZodTypeAny; default: unknown; public: boolean; label: string };

/**
 * Every remotely configurable value. Only keys listed here can be read or written through the API,
 * and only keys flagged `public` are returned to the mobile app without membership checks.
 * Payment-provider secrets are NOT stored here; they live in server environment variables.
 */
export const SETTING_DEFS = {
  book_title: { schema: text(200).min(1), default: "CCTV Secret & Entrepreneurship", public: true, label: "Book title" },
  book_author: { schema: text(120).min(1), default: "Ali Ansari", public: true, label: "Book author" },
  amazon_url: {
    schema: httpsUrl,
    default: "https://www.amazon.in/Cctv-Secret-Entrepreneurship-Ali-Ansari/dp/B0DFTNR7JP",
    public: true,
    label: "Amazon book URL",
  },
  book_cover_url: { schema: httpsUrl.nullable(), default: null, public: true, label: "Book cover image URL" },
  company_name: { schema: text(120).min(1), default: "Silicon Corporation", public: true, label: "Company name" },
  company_website: { schema: httpsUrl, default: "https://siliconcorporation.in", public: true, label: "Company website" },
  company_info: {
    schema: text(2000),
    default: "Silicon Corporation, Balarampur, Purulia, West Bengal",
    public: true,
    label: "Company information",
  },
  office_phone: { schema: phone.nullable(), default: null, public: true, label: "Office contact number" },
  support_email: { schema: z.string().trim().email().max(200).nullable(), default: null, public: true, label: "Support email" },
  support_hours: { schema: text(300), default: "Monday to Saturday, 10 AM to 6 PM IST", public: true, label: "Support hours" },
  support_policy: {
    schema: text(5000),
    default:
      "Limited Support: WhatsApp support for 1000 days from the date of purchase, replies within 24 working hours. Lifetime Support: WhatsApp support for as long as the service runs, replies within 24 working hours. Support covers questions about the book and CCTV learning; on-site visits and repairs are not included.",
    public: true,
    label: "Support policy",
  },
  splash_text_en: { schema: text(200), default: "Learn CCTV, build your skills and start your own business!", public: true, label: "Splash text (English)" },
  splash_text_hi: {
    schema: text(200),
    default: "CCTV सीखें, हुनर बढ़ाएँ और अपना बिज़नेस शुरू करके कमाएँ!",
    public: true,
    label: "Splash text (Hindi)",
  },
  promo_text: { schema: text(300), default: "", public: true, label: "Promotional message" },
  privacy_policy_text: {
    schema: text(30000),
    default:
      "We collect your name, mobile number, location, PIN code and category to create your account and provide support. Payment records are kept as required by law. You can delete your account from the Profile screen. Contact the support email for any privacy request.",
    public: true,
    label: "Privacy policy",
  },
  terms_text: {
    schema: text(30000),
    default:
      "By using this app you agree to use the content for learning only. Paid support plans are one-time payments for the support described in the support policy. Refunds are handled case by case by Silicon Corporation.",
    public: true,
    label: "Terms and conditions",
  },
  /* Private settings: never in the public config. */
  admin_alert_mobile: { schema: phone.nullable(), default: "+917797493140", public: false, label: "Admin alert SMS number (new payment)" },
  whatsapp_number: { schema: phone.nullable(), default: "+917797493140", public: false, label: "WhatsApp support number" },
  whatsapp_message_template: {
    schema: text(500).min(1),
    default: "Hello, I am a premium user ({plan}, one-time payment of ₹{amount}) of the CCTV Secret & Entrepreneurship app. I need support. Name: {name}. Membership reference: {reference}.",
    public: false,
    label: "WhatsApp prefilled message ({plan}, {amount}, {name}, {reference} are replaced)",
  },
  upi_qr_image_url: { schema: httpsUrl.nullable(), default: null, public: false, label: "UPI QR image URL (manual UPI mode)" },
  upi_id: { schema: text(80).nullable(), default: "7797493140cbi@ybl", public: false, label: "UPI ID (used for the Pay button and the generated QR)" },
  upi_payee_name: { schema: text(120).nullable(), default: "Md Saddam Ansari", public: false, label: "UPI payee name shown at checkout" },
} as const satisfies Record<string, Def>;

export type SettingKey = keyof typeof SETTING_DEFS;
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];
export const PUBLIC_KEYS = SETTING_KEYS.filter((k) => SETTING_DEFS[k].public);

export function isSettingKey(k: string): k is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, k);
}

export async function getSettings(db: Db, keys: readonly SettingKey[] = SETTING_KEYS): Promise<Record<string, unknown>> {
  const rows = keys.length ? await db.select().from(appSettings).where(inArray(appSettings.key, keys as string[])) : [];
  const stored = new Map(rows.map((r) => [r.key, r.valueJson]));
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = stored.has(k) ? stored.get(k) : SETTING_DEFS[k].default;
  return out;
}

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<unknown> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0] ? rows[0].valueJson : SETTING_DEFS[key].default;
}

export async function getPublicConfig(db: Db) {
  const values = await getSettings(db, PUBLIC_KEYS);
  const versions = await db.select({ v: appSettings.version, k: appSettings.key }).from(appSettings);
  return { settings: values, version: versions.reduce((n, r) => n + r.v, 0) };
}

/** Validate a partial settings patch. Throws a ZodError listing every invalid key. */
export function validateSettingsPatch(patch: Record<string, unknown>): Partial<Record<SettingKey, unknown>> {
  const out: Partial<Record<SettingKey, unknown>> = {};
  const issues: z.ZodIssue[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!isSettingKey(k)) {
      issues.push({ code: "custom", path: [k], message: "Unknown setting" });
      continue;
    }
    const r = SETTING_DEFS[k].schema.safeParse(v);
    if (!r.success) {
      for (const i of r.error.issues) issues.push({ ...i, path: [k, ...i.path] });
    } else {
      out[k] = r.data;
    }
  }
  if (issues.length) throw new z.ZodError(issues);
  return out;
}
