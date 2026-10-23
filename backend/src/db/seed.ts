import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { adminPermissions, adminRoles, adminUsers, supportPlans } from "./schema";
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
        durationDays: 30,
        sortOrder: 1,
        benefits: [
          "WhatsApp support for 30 days from purchase",
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
