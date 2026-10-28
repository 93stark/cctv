import { and, count, desc, eq, gte, ilike, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  appSettings, auditLogs, banners, books, learningResources, manualPaymentProofs, memberships, notifications,
  paymentOrders, paymentTransactions, quoteItems, quotePackages, refunds, supportPlans, userProfiles, users, videos,
} from "@/db/schema";
import { audit, type AuditActor } from "../audit";
import { ApiError } from "../http";
import { SETTING_DEFS, getSettings, validateSettingsPatch, type SettingKey } from "../settings";
import { maskMobile } from "../util";
import { membershipReference } from "./membership";

type Actor = NonNullable<AuditActor>;

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(60).optional(),
  status: z.string().trim().max(30).optional(),
});

/* ------------------------------------------------------------ dashboard */

export async function dashboardStats(db: Db) {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400_000);
  const [totalUsers] = await db.select({ n: count() }).from(users).where(eq(users.status, "active"));
  const [newUsers] = await db.select({ n: count() }).from(users).where(gte(users.createdAt, since));
  const [gross] = await db.select({ s: sum(paymentTransactions.amountPaise), n: count() }).from(paymentTransactions);
  const [ref] = await db.select({ s: sum(refunds.amountPaise), n: count() }).from(refunds);
  const [active] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.status, "active"), or(sql`${memberships.endsAt} is null`, gte(memberships.endsAt, now))));
  const [pendingProofs] = await db.select({ n: count() }).from(manualPaymentProofs).where(eq(manualPaymentProofs.status, "pending"));
  const [pendingOrders] = await db.select({ n: count() }).from(paymentOrders).where(eq(paymentOrders.status, "pending"));
  const grossPaise = Number(gross.s ?? 0);
  const refundedPaise = Number(ref.s ?? 0);
  return {
    totalUsers: totalUsers.n,
    newUsers30d: newUsers.n,
    successfulPayments: gross.n,
    grossPaise,
    refundedPaise,
    netPaise: grossPaise - refundedPaise,
    activeMemberships: active.n,
    pendingManualReviews: pendingProofs.n,
    pendingOrders: pendingOrders.n,
  };
}

/* ---------------------------------------------------------------- users */

export async function listUsers(db: Db, q: z.infer<typeof pageQuery>, opts: { all?: boolean } = {}) {
  const conds = [];
  if (q.status) conds.push(eq(users.status, q.status));
  if (q.q) conds.push(or(ilike(users.mobileE164, `%${q.q}%`), ilike(userProfiles.fullName, `%${q.q}%`), ilike(userProfiles.location, `%${q.q}%`)));
  const where = conds.length ? and(...conds) : undefined;
  const base = db
    .select({
      id: users.id, mobile: users.mobileE164, status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
      fullName: userProfiles.fullName, location: userProfiles.location, pinCode: userProfiles.pinCode, category: userProfiles.category,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt));
  const rows = opts.all ? await base.limit(10000) : await base.limit(q.limit).offset((q.page - 1) * q.limit);
  const [total] = await db.select({ n: count() }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(where);
  return { rows, total: total.n };
}

export async function getUserDetail(db: Db, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new ApiError(404, "not_found", "User not found.");
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, id)).limit(1);
  const orders = await db.select().from(paymentOrders).where(eq(paymentOrders.userId, id)).orderBy(desc(paymentOrders.createdAt)).limit(50);
  const mem = await db.select().from(memberships).where(eq(memberships.userId, id)).orderBy(desc(memberships.createdAt));
  return { user: u, profile: profile ?? null, orders, memberships: mem.map((m) => ({ ...m, reference: membershipReference(m.id) })) };
}

export async function setUserStatus(db: Db, actor: Actor, id: string, status: "active" | "blocked", ip?: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new ApiError(404, "not_found", "User not found.");
  if (u.status === "deleted") throw new ApiError(409, "deleted", "Deleted accounts cannot be changed.");
  await db.update(users).set({ status }).where(eq(users.id, id));
  await audit(db, actor, "user.status", "user", id, { status: u.status }, { status }, ip);
}

/* ------------------------------------------------------------- payments */

export async function listPayments(db: Db, q: z.infer<typeof pageQuery>, opts: { all?: boolean } = {}) {
  const where = q.status ? eq(paymentOrders.status, q.status) : undefined;
  const base = db
    .select({
      orderId: paymentOrders.id, orderRef: paymentOrders.orderRef, status: paymentOrders.status, amountPaise: paymentOrders.amountPaise,
      provider: paymentOrders.provider, createdAt: paymentOrders.createdAt, userId: paymentOrders.userId, mobile: users.mobileE164,
      planCode: supportPlans.code, txnId: paymentTransactions.id, txnRef: paymentTransactions.providerTxnRef, txnStatus: paymentTransactions.status,
    })
    .from(paymentOrders)
    .innerJoin(users, eq(users.id, paymentOrders.userId))
    .innerJoin(supportPlans, eq(supportPlans.id, paymentOrders.planId))
    .leftJoin(paymentTransactions, eq(paymentTransactions.orderId, paymentOrders.id))
    .where(where)
    .orderBy(desc(paymentOrders.createdAt));
  const rows = opts.all ? await base.limit(10000) : await base.limit(q.limit).offset((q.page - 1) * q.limit);
  const proofs = await db
    .select({ id: manualPaymentProofs.id, orderId: manualPaymentProofs.orderId, utr: manualPaymentProofs.utr, status: manualPaymentProofs.status, createdAt: manualPaymentProofs.createdAt })
    .from(manualPaymentProofs)
    .where(eq(manualPaymentProofs.status, "pending"))
    .orderBy(manualPaymentProofs.createdAt);
  const [total] = await db.select({ n: count() }).from(paymentOrders).where(where);
  return { rows: rows.map((r) => ({ ...r, mobileMasked: maskMobile(r.mobile) })), pendingProofs: proofs, total: total.n };
}

/* ---------------------------------------------------------------- plans */

export const planPatch = z
  .object({
    name: z.string().trim().min(2).max(60),
    pricePaise: z.number().int().min(100).max(10_000_000),
    benefits: z.array(z.string().trim().min(1).max(200)).max(12),
    terms: z.string().trim().max(2000),
    isActive: z.boolean(),
    durationDays: z.number().int().min(1).max(3650),
    sortOrder: z.number().int().min(0).max(100),
  })
  .partial()
  .strict();

export async function updatePlan(db: Db, actor: Actor, id: string, patch: z.infer<typeof planPatch>, ip?: string) {
  const [p] = await db.select().from(supportPlans).where(eq(supportPlans.id, id)).limit(1);
  if (!p) throw new ApiError(404, "not_found", "Plan not found.");
  if (patch.durationDays !== undefined && p.isLifetime) throw new ApiError(400, "invalid_plan", "A lifetime plan has no duration.");
  await db.update(supportPlans).set({ ...patch, updatedAt: new Date() }).where(eq(supportPlans.id, id));
  // Existing orders keep the amount they were created with; only new orders use the new price.
  await audit(db, actor, "plan.update", "support_plan", id, p, patch, ip);
}

/* ------------------------------------------------------------- settings */

export async function readSettings(db: Db) {
  const values = await getSettings(db);
  return Object.entries(SETTING_DEFS).map(([key, def]) => ({
    key, value: values[key] ?? null, public: def.public, label: def.label,
  }));
}

export async function writeSettings(db: Db, actor: Actor, patch: Record<string, unknown>, canPayment: boolean, ip?: string) {
  const clean = validateSettingsPatch(patch);
  const paymentKeys = new Set<string>(["upi_qr_image_url", "upi_payee_name"]);
  for (const k of Object.keys(clean)) {
    if (paymentKeys.has(k) && !canPayment) throw new ApiError(403, "forbidden", "You cannot change payment settings.");
  }
  const before = await getSettings(db, Object.keys(clean) as SettingKey[]);
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(clean)) {
      await tx
        .insert(appSettings)
        .values({ key, valueJson: value === null ? sql`'null'::jsonb` : value, updatedByAdmin: actor.id })
        .onConflictDoUpdate({ target: appSettings.key, set: { valueJson: value === null ? sql`'null'::jsonb` : value, version: sql`${appSettings.version} + 1`, updatedAt: new Date(), updatedByAdmin: actor.id } });
    }
    await audit(tx as unknown as Db, actor, "settings.update", "app_settings", null, before, clean, ip);
  });
}

/* -------------------------------------------------------------- content */

const status3 = z.enum(["draft", "published", "unpublished"]);
const url = z.string().trim().url().max(1000).refine((u) => /^https:\/\//.test(u) || /^\/api\/v1\/dev-uploads\//.test(u) || /^http:\/\/localhost/.test(u), "Must be an https URL");
const optUrl = url.nullable().optional();

export const CONTENT = {
  banners: {
    table: banners,
    create: z.object({
      imageUrl: url, title: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(""),
      buttonText: z.string().trim().max(30).nullable().optional(), destinationUrl: optUrl, status: status3.default("draft"),
      sortOrder: z.number().int().min(0).max(1000).default(0), startsAt: z.coerce.date().nullable().optional(), endsAt: z.coerce.date().nullable().optional(),
    }).strict(),
  },
  books: {
    table: books,
    create: z.object({
      title: z.string().trim().min(1).max(160), author: z.string().trim().max(120).default(""), description: z.string().trim().max(1000).default(""),
      coverUrl: optUrl, buyUrl: url, buttonText: z.string().trim().min(1).max(40).default("Buy now"),
      status: status3.default("draft"), sortOrder: z.number().int().min(0).max(1000).default(0),
    }).strict(),
  },
  quote_packages: {
    table: quotePackages,
    create: z.object({
      name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(""),
      status: status3.default("draft"), sortOrder: z.number().int().min(0).max(1000).default(0),
    }).strict(),
  },
  quote_items: {
    table: quoteItems,
    create: z.object({
      packageId: z.string().uuid(), name: z.string().trim().min(1).max(160), description: z.string().trim().max(300).default(""),
      unit: z.string().trim().min(1).max(20).default("pcs"), unitPricePaise: z.number().int().min(0).max(100_000_000),
      defaultQty: z.number().int().min(0).max(1000).default(1), sortOrder: z.number().int().min(0).max(1000).default(0),
      isActive: z.boolean().default(true),
    }).strict(),
  },
  videos: {
    table: videos,
    create: z.object({
      title: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).default(""), thumbnailUrl: optUrl,
      videoUrl: url, isFree: z.boolean().default(true), status: status3.default("draft"), sortOrder: z.number().int().min(0).max(1000).default(0),
    }).strict(),
  },
  resources: {
    table: learningResources,
    create: z.object({
      type: z.enum(["pdf", "page"]), title: z.string().trim().min(1).max(160), summary: z.string().trim().max(500).default(""),
      body: z.string().max(50_000).nullable().optional(), fileUrl: optUrl, isFree: z.boolean().default(true),
      status: status3.default("draft"), sortOrder: z.number().int().min(0).max(1000).default(0),
    }).strict().refine((v) => (v.type === "pdf" ? !!v.fileUrl : !!v.body), "PDF needs a file URL; page needs a body"),
  },
  notifications: {
    table: notifications,
    create: z.object({
      title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(1000),
      type: z.enum(["video", "pdf", "content", "offer", "announcement"]).default("announcement"),
      status: z.enum(["draft", "published", "inactive"]).default("draft"), publishAt: z.coerce.date().nullable().optional(),
    }).strict(),
  },
} as const;
export type ContentKind = keyof typeof CONTENT;
export const isContentKind = (k: string): k is ContentKind => k in CONTENT;

export async function listContent(db: Db, kind: ContentKind) {
  const t = CONTENT[kind].table;
  return db.select().from(t).orderBy(desc(t.createdAt)).limit(500);
}

export async function createContent(db: Db, actor: Actor, kind: ContentKind, input: Record<string, unknown>, ip?: string) {
  const t = CONTENT[kind].table;
  const values = kind === "notifications" ? { ...input, createdByAdmin: actor.id } : input;
  const [row] = await db.insert(t).values(values as never).returning();
  await audit(db, actor, `${kind}.create`, kind, (row as { id: string }).id, null, input, ip);
  return row;
}

export async function updateContent(db: Db, actor: Actor, kind: ContentKind, id: string, input: Record<string, unknown>, ip?: string) {
  const t = CONTENT[kind].table;
  const partial = (CONTENT[kind].create as unknown as z.ZodObject<z.ZodRawShape>).partial?.() ;
  const parsed = partial ? partial.parse(input) : input;
  // .partial() keeps schema defaults, which would silently reset omitted fields; keep only what was sent.
  const clean = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in input));
  const [before] = await db.select().from(t).where(eq(t.id, id)).limit(1);
  if (!before) throw new ApiError(404, "not_found", "Not found.");
  const set = kind === "notifications" ? clean : { ...clean, updatedAt: new Date() };
  const [row] = await db.update(t).set(set as never).where(eq(t.id, id)).returning();
  await audit(db, actor, `${kind}.update`, kind, id, before, clean, ip);
  return row;
}

export async function deleteContent(db: Db, actor: Actor, kind: ContentKind, id: string, ip?: string) {
  const t = CONTENT[kind].table;
  const [before] = await db.select().from(t).where(eq(t.id, id)).limit(1);
  if (!before) throw new ApiError(404, "not_found", "Not found.");
  try {
    await db.delete(t).where(eq(t.id, id));
  } catch {
    throw new ApiError(409, "in_use", "This item is in use. Unpublish it instead.");
  }
  await audit(db, actor, `${kind}.delete`, kind, id, before, null, ip);
}

/* ---------------------------------------------------------- memberships */

export async function listMemberships(db: Db, q: z.infer<typeof pageQuery>) {
  const rows = await db
    .select({
      id: memberships.id, userId: memberships.userId, mobile: users.mobileE164, plan: supportPlans.code, status: memberships.status,
      grantType: memberships.grantType, grantReason: memberships.grantReason, startsAt: memberships.startsAt, endsAt: memberships.endsAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(supportPlans, eq(supportPlans.id, memberships.planId))
    .where(q.status ? eq(memberships.status, q.status) : undefined)
    .orderBy(desc(memberships.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);
  return rows.map((r) => ({ ...r, reference: membershipReference(r.id), mobileMasked: maskMobile(r.mobile), mobile: undefined }));
}

export const grantInput = z.object({ userId: z.string().uuid(), planCode: z.string().min(1).max(30), reason: z.string().trim().min(10).max(300) }).strict();

export async function grantMembership(db: Db, actor: Actor, input: z.infer<typeof grantInput>, ip?: string) {
  const [u] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!u || u.status === "deleted") throw new ApiError(404, "not_found", "User not found.");
  const [plan] = await db.select().from(supportPlans).where(eq(supportPlans.code, input.planCode)).limit(1);
  if (!plan) throw new ApiError(404, "not_found", "Plan not found.");
  const now = new Date();
  const endsAt = plan.isLifetime ? null : new Date(now.getTime() + (plan.durationDays ?? 0) * 86400_000);
  const [m] = await db
    .insert(memberships)
    .values({ userId: u.id, planId: plan.id, grantType: "admin_grant", grantReason: input.reason, grantedByAdmin: actor.id, startsAt: now, endsAt })
    .returning();
  await audit(db, actor, "membership.grant", "membership", m.id, null, { userId: u.id, plan: plan.code, reason: input.reason }, ip);
  return m;
}

export async function revokeMembership(db: Db, actor: Actor, id: string, reason: string, ip?: string) {
  const [m] = await db.select().from(memberships).where(eq(memberships.id, id)).limit(1);
  if (!m) throw new ApiError(404, "not_found", "Membership not found.");
  if (m.status !== "active") throw new ApiError(409, "not_active", "Membership is not active.");
  await db.update(memberships).set({ status: "revoked", endedReason: reason, endsAt: new Date() }).where(eq(memberships.id, id));
  await audit(db, actor, "membership.revoke", "membership", id, { status: "active" }, { status: "revoked", reason }, ip);
}

/* ---------------------------------------------------------------- audit */

export async function listAudit(db: Db, q: z.infer<typeof pageQuery>) {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(q.q ? ilike(auditLogs.action, `%${q.q}%`) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);
  return rows;
}


