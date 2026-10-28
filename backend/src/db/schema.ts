import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mobileE164: text("mobile_e164").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    lastLoginAt: ts("last_login_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    check("users_status_chk", sql`${t.status} in ('active','blocked','deleted')`),
    index("users_created_idx").on(t.createdAt),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    location: text("location").notNull(),
    pinCode: text("pin_code").notNull(),
    category: text("category").notNull(),
    photoUrl: text("photo_url"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "user_profiles_category_chk",
      sql`${t.category} in ('individual','technician','business_owner','student')`,
    ),
    check("user_profiles_pin_chk", sql`${t.pinCode} ~ '^[0-9]{4,6}$'`),
    index("user_profiles_category_idx").on(t.category),
  ],
);

export const otpRequests = pgTable(
  "otp_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mobileE164: text("mobile_e164").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_requests_mobile_idx").on(t.mobileE164, t.createdAt)],
);

/** Fixed-window rate limiter that works on serverless (state lives in the database). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    refreshHash: text("refresh_hash").notNull().unique(),
    deviceLabel: text("device_label"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_family_idx").on(t.familyId)],
);

/* ------------------------------------------------------------------ admin */

export const adminRoles = pgTable("admin_roles", {
  name: text("name").primaryKey(),
  description: text("description").notNull().default(""),
});

export const adminPermissions = pgTable(
  "admin_permissions",
  {
    roleName: text("role_name")
      .notNull()
      .references(() => adminRoles.name, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleName, t.permission] })],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleName: text("role_name")
    .notNull()
    .references(() => adminRoles.name),
  disabled: boolean("disabled").notNull().default(false),
  /** Bumped on logout / password change to invalidate existing admin cookies. */
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: createdAt(),
  lastLoginAt: ts("last_login_at"),
});

/* ---------------------------------------------------------------- content */

export const banners = pgTable(
  "banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    imageUrl: text("image_url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    buttonText: text("button_text"),
    destinationUrl: text("destination_url"),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("banners_status_chk", sql`${t.status} in ('draft','published','unpublished')`),
    index("banners_status_idx").on(t.status, t.sortOrder),
  ],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    description: text("description").notNull().default(""),
    coverUrl: text("cover_url"),
    buyUrl: text("buy_url").notNull(),
    buttonText: text("button_text").notNull().default("Buy now"),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("books_status_chk", sql`${t.status} in ('draft','published','unpublished')`),
    index("books_status_idx").on(t.status, t.sortOrder),
  ],
);

export const quotePackages = pgTable(
  "quote_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("quote_packages_status_chk", sql`${t.status} in ('draft','published','unpublished')`),
    index("quote_packages_status_idx").on(t.status, t.sortOrder),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id").notNull().references(() => quotePackages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    unit: text("unit").notNull().default("pcs"),
    unitPricePaise: integer("unit_price_paise").notNull().default(0),
    defaultQty: integer("default_qty").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("quote_items_price_chk", sql`${t.unitPricePaise} >= 0 and ${t.defaultQty} >= 0`),
    index("quote_items_pkg_idx").on(t.packageId, t.sortOrder),
  ],
);

export const quoteVariants = pgTable(
  "quote_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => quoteItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("quote_variants_price_chk", sql`${t.unitPricePaise} >= 0`),
    index("quote_variants_item_idx").on(t.itemId, t.sortOrder),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    videoUrl: text("video_url").notNull(),
    isFree: boolean("is_free").notNull().default(true),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("videos_status_chk", sql`${t.status} in ('draft','published','unpublished')`),
    index("videos_status_idx").on(t.status, t.sortOrder),
  ],
);

export const learningResources = pgTable(
  "learning_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    /** Markdown/plain text body for `page` resources. */
    body: text("body"),
    /** File or link for `pdf` resources. */
    fileUrl: text("file_url"),
    isFree: boolean("is_free").notNull().default(true),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("learning_resources_type_chk", sql`${t.type} in ('pdf','page')`),
    check("learning_resources_status_chk", sql`${t.status} in ('draft','published','unpublished')`),
    index("learning_resources_status_idx").on(t.status, t.sortOrder),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = broadcast to every user. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: text("type").notNull().default("announcement"),
    status: text("status").notNull().default("draft"),
    publishAt: ts("publish_at"),
    createdByAdmin: uuid("created_by_admin").references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("notifications_status_chk", sql`${t.status} in ('draft','published','inactive')`),
    check(
      "notifications_type_chk",
      sql`${t.type} in ('video','pdf','content','offer','payment','membership','announcement')`,
    ),
    index("notifications_user_idx").on(t.userId, t.status),
  ],
);

export const userNotifications = pgTable(
  "user_notifications",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    readAt: ts("read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.notificationId] })],
);

/* ------------------------------------------------ plans, payments, members */

export const supportPlans = pgTable(
  "support_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    pricePaise: integer("price_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    benefits: jsonb("benefits").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    terms: text("terms").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    isLifetime: boolean("is_lifetime").notNull().default(false),
    /** For non-lifetime plans: how long the entitlement lasts. */
    durationDays: integer("duration_days"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("support_plans_price_chk", sql`${t.pricePaise} > 0`),
    check("support_plans_currency_chk", sql`${t.currency} = 'INR'`),
    check(
      "support_plans_duration_chk",
      sql`(${t.isLifetime} = true and ${t.durationDays} is null) or (${t.isLifetime} = false and ${t.durationDays} > 0)`,
    ),
  ],
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderRef: text("order_ref").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => supportPlans.id),
    /** Copied from the plan when the order is created. Never read from the client. */
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    providerOrderRef: text("provider_order_ref"),
    checkoutPayload: jsonb("checkout_payload"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "payment_orders_status_chk",
      sql`${t.status} in ('pending','awaiting_review','paid','failed','cancelled','expired')`,
    ),
    index("payment_orders_user_idx").on(t.userId, t.createdAt),
    index("payment_orders_status_idx").on(t.status),
  ],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => paymentOrders.id),
    provider: text("provider").notNull(),
    providerTxnRef: text("provider_txn_ref").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    /** success | refunded. Failed attempts are recorded on the order, not here. */
    status: text("status").notNull(),
    /** webhook | manual_review */
    source: text("source").notNull(),
    verifiedByAdmin: uuid("verified_by_admin").references(() => adminUsers.id),
    verifiedAt: ts("verified_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    check("payment_transactions_status_chk", sql`${t.status} in ('success','refunded')`),
    check("payment_transactions_source_chk", sql`${t.source} in ('webhook','manual_review')`),
    uniqueIndex("payment_transactions_provider_ref_uq").on(t.provider, t.providerTxnRef),
    index("payment_transactions_order_idx").on(t.orderId),
  ],
);

/** User-submitted proof (UTR) for the manual UPI flow. Only an admin can turn it into a verified payment. */
export const manualPaymentProofs = pgTable(
  "manual_payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => paymentOrders.id),
    utr: text("utr").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedByAdmin: uuid("reviewed_by_admin").references(() => adminUsers.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    check("manual_payment_proofs_status_chk", sql`${t.status} in ('pending','approved','rejected')`),
    uniqueIndex("manual_payment_proofs_utr_uq").on(t.utr),
    index("manual_payment_proofs_order_idx").on(t.orderId),
  ],
);

/** Idempotency log for provider callbacks. */
export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    result: text("result").notNull(),
    processedAt: ts("processed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_events_uq").on(t.provider, t.eventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => paymentTransactions.id),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    providerRefundRef: text("provider_refund_ref"),
    createdByAdmin: uuid("created_by_admin").references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [check("refunds_amount_chk", sql`${t.amountPaise} > 0`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => supportPlans.id),
    /** payment | admin_grant */
    grantType: text("grant_type").notNull().default("payment"),
    transactionId: uuid("transaction_id").references(() => paymentTransactions.id),
    grantReason: text("grant_reason"),
    grantedByAdmin: uuid("granted_by_admin").references(() => adminUsers.id),
    status: text("status").notNull().default("active"),
    startsAt: ts("starts_at").notNull().defaultNow(),
    /** null for lifetime memberships. */
    endsAt: ts("ends_at"),
    endedReason: text("ended_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("memberships_status_chk", sql`${t.status} in ('active','refunded','revoked')`),
    check(
      "memberships_grant_chk",
      sql`(${t.grantType} = 'payment' and ${t.transactionId} is not null) or (${t.grantType} = 'admin_grant' and ${t.grantReason} is not null and ${t.grantedByAdmin} is not null)`,
    ),
    uniqueIndex("memberships_transaction_uq").on(t.transactionId),
    index("memberships_user_idx").on(t.userId, t.status),
  ],
);

export const supportEvents = pgTable(
  "support_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    channel: text("channel").notNull().default("whatsapp"),
    createdAt: createdAt(),
  },
  (t) => [index("support_events_user_idx").on(t.userId, t.createdAt)],
);

/* ----------------------------------------------- settings, media, auditing */

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedByAdmin: uuid("updated_by_admin").references(() => adminUsers.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  pathname: text("pathname").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  purpose: text("purpose").notNull(),
  uploadedByAdmin: uuid("uploaded_by_admin").references(() => adminUsers.id),
  uploadedByUser: uuid("uploaded_by_user").references(() => users.id),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => adminUsers.id),
    /** Snapshot so the log stays readable if the admin is later disabled. */
    adminEmail: text("admin_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);
