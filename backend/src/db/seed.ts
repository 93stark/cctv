import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index";
import { adminPermissions, adminRoles, adminUsers, appSettings, banners, books, learningResources, videos, quoteItems, quotePackages, quoteVariants, supportPlans } from "./schema";
import { hashPassword } from "@/server/crypto";
import { validateNewPassword } from "@/server/adminAuth";
import { ROLES } from "@/server/permissions";
import { config } from "@/server/config";
import { getGatewayConfig, saveGatewayConfig } from "@/server/payments/gatewayConfig";
import { HD_EXTRAS, IP_EXTRAS, iconUrlFor, type ExtraItem } from "@/server/genCatalog";

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

  // Owner's rates (v2) for the two sample packages, once. Skipped if the admin already changed any price.
  const rMarker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_rates_v2")).limit(1);
  if (!rMarker[0]) {
    const v1: Record<string, number> = { "HD Camera": 1200, DVR: 3500, SMPS: 650, HDD: 3200, "Coaxial Cable": 1800, "BNC / DC Connectors": 40, "IP Camera": 2800, NVR: 5500, "PoE Switch": 3000, "CAT6 Cable": 4500, "RJ45 Connectors": 15 };
    type Row = [string, string, number, number]; // name, unit, rupees, default qty
    const v2: Record<string, Row[]> = {
      "HD Camera Package": [["HD Bullet Camera", "pcs", 1200, 1], ["HD Dome Camera", "pcs", 1200, 1], ["DVR", "pcs", 4200, 1], ["SMPS", "pcs", 400, 1], ["Hard Disk 500GB", "pcs", 2200, 1], ["3+1 Coaxial Cable", "meter", 20, 30]],
      "IP Camera Package": [["IP Dome Camera", "pcs", 3400, 1], ["IP Bullet Camera", "pcs", 3500, 1], ["NVR", "pcs", 4500, 1], ["PoE Switch 4 Channel", "pcs", 1800, 1], ["Hard Disk 500GB", "pcs", 2200, 1], ["CAT6 Cable", "meter", 35, 30]],
    };
    for (const [name, rows] of Object.entries(v2)) {
      const [pkg] = await db.select().from(quotePackages).where(eq(quotePackages.name, name)).limit(1);
      if (!pkg) continue;
      const old = await db.select().from(quoteItems).where(eq(quoteItems.packageId, pkg.id));
      if (old.some((o) => v1[o.name] === undefined || v1[o.name] * 100 !== o.unitPricePaise)) continue; // admin edited it
      await db.delete(quoteItems).where(eq(quoteItems.packageId, pkg.id));
      await db.insert(quoteItems).values(rows.map(([n, unit, rs, qty], k) => ({ packageId: pkg.id, name: n, unit, unitPricePaise: rs * 100, defaultQty: qty, sortOrder: k })));
      await db.update(quotePackages).set({ status: "published" }).where(eq(quotePackages.id, pkg.id));
    }
    await db.insert(appSettings).values({ key: "quotes_rates_v2", valueJson: true }).onConflictDoNothing();
  }

  // Sample packages with variants (v3), once. IP/HD are rebuilt only if the admin never edited them; Common/Desktop are added.
  const v3Marker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_variants_v3")).limit(1);
  if (!v3Marker[0]) {
    type It = { name: string; unit?: string; qty?: number; variants: [string, number][] };
    const ch = (a: number, b: number, c: number): [string, number][] => [["4 Channel", a], ["8 Channel", b], ["16 Channel", c]];
    const hdd: [string, number][] = [["500GB", 2200], ["1TB", 3000], ["2TB", 4500], ["4TB", 7500]];
    const SAMPLE: Record<string, It[]> = {
      "IP Camera Package": [
        { name: "IP Camera", variants: [["Dome 2MP", 3400], ["Bullet 2MP", 3500], ["Dome 5MP", 4800], ["Bullet 5MP", 4900]] },
        { name: "NVR", variants: ch(4500, 6500, 9500) },
        { name: "PoE Switch", variants: [["4 Port Normal", 1800], ["8 Port Normal", 3000], ["16 Port Normal", 5500], ["8 Port Gigabit", 4200]] },
        { name: "Hard Disk", variants: hdd },
        { name: "CAT6 Cable", unit: "meter", qty: 30, variants: [["Per meter", 35]] },
      ],
      "HD Camera Package": [
        { name: "HD Camera", variants: [["Dome", 1200], ["Bullet", 1200]] },
        { name: "DVR", variants: ch(4200, 6000, 9000) },
        { name: "SMPS", variants: ch(400, 700, 1200) },
        { name: "Hard Disk", variants: hdd },
        { name: "3+1 Coaxial Cable", unit: "meter", qty: 30, variants: [["Per meter", 20]] },
      ],
      "Common Items": [
        { name: "Monitor", variants: [["15 inch", 3800], ["18.5 inch", 4800], ["22 inch", 6500], ["24 inch", 7500]] },
        { name: "Hard Disk", variants: hdd },
        { name: "UPS", variants: [["600VA", 2200], ["1KVA", 4500]] },
        { name: "Router", variants: [["SIM based", 2500], ["WiFi", 1200]] },
      ],
      "Desktop": [
        { name: "Desktop Computer", variants: [["Basic", 18000], ["Standard", 25000], ["Advanced", 38000]] },
        { name: "Monitor", variants: [["18.5 inch", 4800], ["22 inch", 6500], ["24 inch", 7500]] },
        { name: "Keyboard & Mouse", variants: [["Wired", 600], ["Wireless", 1100]] },
        { name: "UPS", variants: [["600VA", 2200], ["1KVA", 4500]] },
      ],
    };
    const v2: Record<string, number> = { "HD Bullet Camera": 1200, "HD Dome Camera": 1200, DVR: 4200, SMPS: 400, "Hard Disk 500GB": 2200, "3+1 Coaxial Cable": 20, "IP Dome Camera": 3400, "IP Bullet Camera": 3500, NVR: 4500, "PoE Switch 4 Channel": 1800, "CAT6 Cable": 35 };
    const build = async (pkgId: string, items: It[]) => {
      for (const [k, it] of items.entries()) {
        const [row] = await db.insert(quoteItems).values({ packageId: pkgId, name: it.name, unit: it.unit ?? "pcs", defaultQty: it.qty ?? 1, unitPricePaise: 0, sortOrder: k }).returning();
        await db.insert(quoteVariants).values(it.variants.map(([label, rs], n) => ({ itemId: row.id, label, unitPricePaise: rs * 100, sortOrder: n })));
      }
    };
    let order = 0;
    for (const [name, items] of Object.entries(SAMPLE)) {
      const [pkg] = await db.select().from(quotePackages).where(eq(quotePackages.name, name)).limit(1);
      if (pkg) {
        const old = await db.select().from(quoteItems).where(eq(quoteItems.packageId, pkg.id));
        if (old.every((o) => v2[o.name] !== undefined && v2[o.name] * 100 === o.unitPricePaise)) {
          await db.delete(quoteItems).where(eq(quoteItems.packageId, pkg.id));
          await build(pkg.id, items);
          await db.update(quotePackages).set({ status: "published", sortOrder: order }).where(eq(quotePackages.id, pkg.id));
        }
      } else if (name === "Common Items" || name === "Desktop") {
        const [created] = await db.insert(quotePackages).values({ name, status: "published", sortOrder: order }).returning();
        await build(created.id, items);
      }
      order++;
    }
    await db.insert(appSettings).values({ key: "quotes_variants_v3", valueJson: true }).onConflictDoNothing();
  }

  // Catalog v4 (once): fold "Other" into "IT Products", add small accessories to the HD / IP packages
  // at market rates, and give every item without a picture a free-licence icon.
  const v4Marker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_catalog_v4")).limit(1);
  if (!v4Marker[0]) {
    const pkgs = await db.select().from(quotePackages);
    const norm = (v: string) => v.trim().toLowerCase();
    const other = pkgs.find((p) => ["other", "others", "common items", "common"].includes(norm(p.name)));
    const itPkg = pkgs.find((p) => ["it products", "it product", "it", "desktop"].includes(norm(p.name)));
    if (other && itPkg && other.id !== itPkg.id) {
      const have = new Set((await db.select().from(quoteItems).where(eq(quoteItems.packageId, itPkg.id))).map((i) => norm(i.name)));
      let next = have.size;
      for (const it of await db.select().from(quoteItems).where(eq(quoteItems.packageId, other.id))) {
        if (have.has(norm(it.name))) continue;
        await db.update(quoteItems).set({ packageId: itPkg.id, sortOrder: next++ }).where(eq(quoteItems.id, it.id));
        have.add(norm(it.name));
      }
      await db.delete(quotePackages).where(eq(quotePackages.id, other.id));
    }
    const addExtras = async (pkgId: string, extras: ExtraItem[]) => {
      const cur = await db.select().from(quoteItems).where(eq(quoteItems.packageId, pkgId));
      const names = new Set(cur.map((i) => norm(i.name)));
      let order = cur.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
      for (const x of extras) {
        if (names.has(norm(x.name))) continue;
        const [row] = await db
          .insert(quoteItems)
          .values({ packageId: pkgId, name: x.name, unit: x.unit ?? "pcs", defaultQty: x.qty ?? 1, unitPricePaise: (x.price ?? 0) * 100, sortOrder: order++, imageUrl: iconUrlFor(x.name) })
          .returning();
        if (x.variants?.length) await db.insert(quoteVariants).values(x.variants.map(([label, rs], n) => ({ itemId: row.id, label, unitPricePaise: rs * 100, sortOrder: n })));
      }
    };
    const rest = await db.select().from(quotePackages);
    const hd = rest.find((p) => norm(p.name).startsWith("hd"));
    const ip = rest.find((p) => norm(p.name).startsWith("ip"));
    if (hd) await addExtras(hd.id, HD_EXTRAS);
    if (ip) await addExtras(ip.id, IP_EXTRAS);
    for (const it of await db.select().from(quoteItems)) {
      if (!it.imageUrl) await db.update(quoteItems).set({ imageUrl: iconUrlFor(it.name) }).where(eq(quoteItems.id, it.id));
    }
    await db.insert(appSettings).values({ key: "quotes_catalog_v4", valueJson: true }).onConflictDoNothing();
  }

  // Catalog v5 (once): swap the first-generation flat icons for the product pictures. Admin uploads are left alone.
  const v5Marker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_art_v5")).limit(1);
  if (!v5Marker[0]) {
    for (const it of await db.select().from(quoteItems)) {
      if (!it.imageUrl || it.imageUrl.includes("/gen-icons/")) await db.update(quoteItems).set({ imageUrl: iconUrlFor(it.name) }).where(eq(quoteItems.id, it.id));
    }
    await db.insert(appSettings).values({ key: "quotes_art_v5", valueJson: true }).onConflictDoNothing();
  }

  // Catalog v6 (once): any item still without a picture (e.g. created by hand in the admin) gets one.
  const v6Marker = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "quotes_art_v6")).limit(1);
  if (!v6Marker[0]) {
    for (const it of await db.select().from(quoteItems)) {
      if (!it.imageUrl || !it.imageUrl.trim()) await db.update(quoteItems).set({ imageUrl: iconUrlFor(it.name) }).where(eq(quoteItems.id, it.id));
    }
    await db.insert(appSettings).values({ key: "quotes_art_v6", valueJson: true }).onConflictDoNothing();
  }

  // Online payment (Razorpay) becomes the default gateway on real servers; the admin can switch back in "Payments setup".
  if (config().PAYMENT_PROVIDER !== "mock") {
    const gm = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "gateway_default_v1")).limit(1);
    if (!gm[0]) {
      if (!(await getGatewayConfig(db)).gateway) await saveGatewayConfig(db, null, { gateway: "razorpay" });
      await db.insert(appSettings).values({ key: "gateway_default_v1", valueJson: true }).onConflictDoNothing();
    }
  }

  // Three starter PDFs (served from /public/guides), in reading order. After this the owner can edit or reorder them in the admin.
  {
    const m = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "guides_pdfs_v1")).limit(1);
    if (!m[0]) {
      const base = (process.env.GEN_ICON_BASE_URL ?? "https://cctv-api-five.vercel.app").replace(/\/$/, "") + "/guides/";
      const docs = [
        ["CCTV Secret & Entrepreneurship: Book Introduction", "Free introductory edition: about the book, author note and the full 10-chapter contents.", "1-book-introduction.pdf"],
        ["Chapters 1 & 2: Illustrated Technical Summary", "CCTV foundations, camera types, connectors, power supplies and field tools.", "2-chapters-1-and-2-summary.pdf"],
        ["CCTV Business: Quotation & Invoice Templates", "Ready-to-use quotation and invoice formats for your CCTV installation business.", "3-quotation-and-invoice-templates.pdf"],
      ] as const;
      for (let i = 0; i < docs.length; i++) {
        await db.insert(learningResources).values({ type: "pdf", title: docs[i][0], summary: docs[i][1], fileUrl: base + docs[i][2], isFree: true, status: "published", sortOrder: i + 1 });
      }
      await db.insert(appSettings).values({ key: "guides_pdfs_v1", valueJson: true }).onConflictDoNothing();
    }
  }

  // Attractive thumbnails for the four starter videos (matched by title; a thumbnail the admin already set is kept).
  {
    const m = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "video_thumbs_v1")).limit(1);
    if (!m[0]) {
      const base = (process.env.GEN_ICON_BASE_URL ?? "https://cctv-api-five.vercel.app").replace(/\/$/, "") + "/video-thumbs/";
      const rules: [string, string][] = [["%camera training%", "cctv-training.jpg"], ["%smps%", "smps.jpg"], ["%dc conn%", "dc-connector.jpg"], ["%bnc%", "bnc-connector.jpg"]];
      for (const [pat, file] of rules) {
        await db.update(videos).set({ thumbnailUrl: base + file }).where(and(sql`lower(${videos.title}) like ${pat}`, sql`(${videos.thumbnailUrl} is null or ${videos.thumbnailUrl} = '')`));
      }
      await db.insert(appSettings).values({ key: "video_thumbs_v1", valueJson: true }).onConflictDoNothing();
    }
  }

  // Two CCTV training banners for the home screen (editable or removable in the admin Banners tab).
  {
    const m = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, "training_banners_v1")).limit(1);
    if (!m[0]) {
      const base = (process.env.GEN_ICON_BASE_URL ?? "https://cctv-api-five.vercel.app").replace(/\/$/, "") + "/banners/";
      await db.insert(banners).values([
        { imageUrl: base + "training-1.jpg", title: "CCTV Training", description: "Camera, DVR/NVR aur installation, step by step", status: "published", sortOrder: 10 },
        { imageUrl: base + "training-2.jpg", title: "Learn CCTV Secrets", description: "Connectors, SMPS aur wiring ki practical training", status: "published", sortOrder: 11 },
      ]);
      await db.insert(appSettings).values({ key: "training_banners_v1", valueJson: true }).onConflictDoNothing();
    }
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
