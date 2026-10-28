import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index";
import { adminPermissions, adminRoles, adminUsers, appSettings, books, quoteItems, quotePackages, supportPlans } from "./schema";
import { hashPassword } from "@/server/crypto";
import { validateNewPassword } from "@/server/adminAuth";
import { ROLES } from "@/server/permissions";

/**
 * Idempotent seed. Safe to run on every deploy: it never overwrites plans or admins that already exist,
 * so prices and descriptions edited in the Admin Panel are preserved.
 */
export async function seed(db: Db, opts: { adminEmail?: string; adminPassword?: string } = {}) {
  for (const [name, role] of Object.entries(ROLES)) {
    await db.insert(adminRoles).values({ name, description: role.description }).onConflictDoNothing();
    // Permissions are code-defined: keep them in sync with ROLES on every seed.
    await db.delete(adminPermissions).where(eq(adminPermissions.roleName, name));
    await db.insert(adminPermissions).values(role.permissions.map((permission) => ({ roleName: name, permission })));
  }

  // PLACEHOLDER TERMS: the owner must review and confirm what "Limited" and "Lifetime" support mean
  // (see docs/ARCHITECTURE.md, open decision 4). They are editable in Admin > Plans.
  await db
    .insert(supportPlans)
    .values([
      {
        code: "limited",
        name: "Limited Support",
        pricePaise: 9900,
        isLifetime: false,
        durationDays: 1000,
        sortOrder: 1,
        benefits: [
          "WhatsApp support for 1000 days from purchase",
          "Replies within 24 working hours",
          "Questions about the book and CCTV learning",
        ],
        terms: "One-time payment of ₹99. No renewal or recurring charge. On-site visits and repairs are not included.",
      },
      {
        code: "lifetime",
        name: "Lifetime Support",
        pricePaise: 99900,
        isLifetime: true,
        durationDays: null,
        sortOrder: 2,
        benefits: [
          "WhatsApp support with no expiry date",
          "Replies within 24 working hours",
          "One-time payment, no renewals",
        ],
        terms: "One-time payment of ₹999. Lifetime means for as long as this support service is offered. On-site visits and repairs are not included.",
      },
    ])
    .onConflictDoNothing({ target: supportPlans.code });

  // Owner decision (Oct 2026): Limited Support is valid for 1000 days. Only touches rows still on the old 30-day default.
  await db
    .update(supportPlans)
    .set({
      durationDays: 1000,
      benefits: [
        "WhatsApp support for 1000 days from purchase",
        "Replies within 24 working hours",
        "Questions about the book and CCTV learning",
      ],
    })
    .where(and(eq(supportPlans.code, "limited"), eq(supportPlans.durationDays, 30)));

  // Default book (the author's own), added once so the Home screen is not empty. Admin can edit, replace or delete it;
  // a marker row stops it coming back after a delete.
  const marker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "books_seeded")).limit(1);
  if (!marker[0]) {
    const existing = await db.select({ id: books.id }).from(books).limit(1);
    if (!existing[0]) {
      await db.insert(books).values({
        title: "CCTV Secret & Entrepreneurship",
        author: "Ali Ansari",
        buyUrl: "https://www.amazon.in/Cctv-Secret-Entrepreneurship-Ali-Ansari/dp/B0DFTNR7JP",
        buttonText: "Get the book on Amazon",
        status: "published",
        sortOrder: 0,
      });
    }
    await db.insert(appSettings).values({ key: "books_seeded", valueJson: true }).onConflictDoNothing();
  }

  // Sample quotation packages (drafts, prices 0) so the admin has a starting point; added once.
  const qMarker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_seeded")).limit(1);
  if (!qMarker[0]) {
    const existing = await db.select({ id: quotePackages.id }).from(quotePackages).limit(1);
    if (!existing[0]) {
      const sets: [string, string[]][] = [
        ["HD Camera Package", ["HD Camera", "DVR", "SMPS", "HDD", "Coaxial Cable", "BNC / DC Connectors"]],
        ["IP Camera Package", ["IP Camera", "NVR", "PoE Switch", "HDD", "CAT6 Cable", "RJ45 Connectors"]],
      ];
      for (const [i, [name, items]] of sets.entries()) {
        const [pkg] = await db.insert(quotePackages).values({ name, sortOrder: i, status: "draft" }).returning();
        await db.insert(quoteItems).values(items.map((n, k) => ({ packageId: pkg.id, name: n, sortOrder: k, unitPricePaise: 0, defaultQty: 1 })));
      }
    }
    await db.insert(appSettings).values({ key: "quotes_seeded", valueJson: true }).onConflictDoNothing();
  }

  // Dummy prices + published for the two sample packages, once, so GEN works out of the box. Admin replaces with real prices.
  const pMarker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_demo_priced")).limit(1);
  if (!pMarker[0]) {
    const demo: Record<string, Record<string, number>> = {
      "HD Camera Package": { "HD Camera": 1200, DVR: 3500, SMPS: 650, HDD: 3200, "Coaxial Cable": 1800, "BNC / DC Connectors": 40 },
      "IP Camera Package": { "IP Camera": 2800, NVR: 5500, "PoE Switch": 3000, HDD: 3200, "CAT6 Cable": 4500, "RJ45 Connectors": 15 },
    };
    for (const [name, prices] of Object.entries(demo)) {
      const [pkg] = await db.select().from(quotePackages).where(eq(quotePackages.name, name)).limit(1);
      if (!pkg) continue;
      const rows = await db.select().from(quoteItems).where(eq(quoteItems.packageId, pkg.id));
      if (rows.some((r) => r.unitPricePaise > 0)) continue; // admin already priced it
      for (const r of rows) if (prices[r.name] !== undefined) await db.update(quoteItems).set({ unitPricePaise: prices[r.name] * 100 }).where(eq(quoteItems.id, r.id));
      await db.update(quotePackages).set({ status: "published" }).where(eq(quotePackages.id, pkg.id));
    }
    await db.insert(appSettings).values({ key: "quotes_demo_priced", valueJson: true }).onConflictDoNothing();
  }

  let adminCreated = false;
  const email = opts.adminEmail?.trim().toLowerCase();
  if (email && opts.adminPassword) {
    const existing = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (!existing[0]) {
      validateNewPassword(opts.adminPassword);
      await db.insert(adminUsers).values({ email, passwordHash: await hashPassword(opts.adminPassword), roleName: "owner" });
      adminCreated = true;
    }
  }
  const counts = await db.select({ n: sql<number>`count(*)::int` }).from(supportPlans);
  return { plans: counts[0].n, adminCreated };
}
