import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { banners, books, quoteItems, quotePackages, learningResources, supportPlans, videos } from "@/db/schema";
import { getSettings } from "../settings";
import { getEffectiveMembership } from "./membership";

export async function visibleBanners(db: Db, now = new Date()) {
  const rows = await db
    .select()
    .from(banners)
    .where(
      and(
        eq(banners.status, "published"),
        or(isNull(banners.startsAt), lte(banners.startsAt, now)),
        or(isNull(banners.endsAt), gte(banners.endsAt, now)),
      ),
    )
    .orderBy(asc(banners.sortOrder), desc(banners.createdAt));
  return rows.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    title: b.title,
    description: b.description,
    buttonText: b.buttonText,
    destinationUrl: b.destinationUrl,
  }));
}

export async function visibleBooks(db: Db) {
  const rows = await db.select().from(books).where(eq(books.status, "published")).orderBy(asc(books.sortOrder), desc(books.createdAt));
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    description: b.description,
    coverUrl: b.coverUrl,
    buyUrl: b.buyUrl,
    buttonText: b.buttonText,
  }));
}

export async function listVideos(db: Db, userId: string, limit = 100) {
  const member = await getEffectiveMembership(db, userId);
  const rows = await db
    .select()
    .from(videos)
    .where(eq(videos.status, "published"))
    .orderBy(asc(videos.sortOrder), desc(videos.createdAt))
    .limit(limit);
  return rows.map((v) => {
    const locked = !v.isFree && !member;
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      thumbnailUrl: v.thumbnailUrl,
      isFree: v.isFree,
      locked,
      videoUrl: locked ? null : v.videoUrl,
    };
  });
}

export async function listResources(db: Db, userId: string, limit = 100) {
  const member = await getEffectiveMembership(db, userId);
  const rows = await db
    .select()
    .from(learningResources)
    .where(eq(learningResources.status, "published"))
    .orderBy(asc(learningResources.sortOrder), desc(learningResources.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const locked = !r.isFree && !member;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      summary: r.summary,
      isFree: r.isFree,
      locked,
      body: locked ? null : r.body,
      fileUrl: locked ? null : r.fileUrl,
    };
  });
}

export async function listActivePlans(db: Db) {
  const rows = await db
    .select()
    .from(supportPlans)
    .where(eq(supportPlans.isActive, true))
    .orderBy(asc(supportPlans.sortOrder), asc(supportPlans.pricePaise));
  return rows.map((p) => ({
    code: p.code,
    name: p.name,
    pricePaise: p.pricePaise,
    currency: p.currency,
    priceDisplay: `₹${(p.pricePaise / 100).toFixed(p.pricePaise % 100 === 0 ? 0 : 2)}`,
    benefits: p.benefits,
    terms: p.terms,
    isLifetime: p.isLifetime,
    durationDays: p.durationDays,
    oneTime: true,
  }));
}

export async function homeFeed(db: Db, userId: string) {
  const [bannerList, bookList, videoList, resourceList, settings, membership] = await Promise.all([
    visibleBanners(db),
    visibleBooks(db),
    listVideos(db, userId, 6),
    listResources(db, userId, 6),
    getSettings(db, ["book_title", "book_author", "amazon_url", "book_cover_url", "promo_text"]),
    getEffectiveMembership(db, userId),
  ]);
  return {
    banners: bannerList,
    books: bookList,
    // Older app versions read a single `book`; keep serving it (first published book, else the legacy settings).
    book: bookList[0]
      ? { title: bookList[0].title, author: bookList[0].author, amazonUrl: bookList[0].buyUrl, coverUrl: bookList[0].coverUrl }
      : { title: settings.book_title, author: settings.book_author, amazonUrl: settings.amazon_url, coverUrl: settings.book_cover_url },
    promoText: settings.promo_text,
    freeVideos: videoList,
    resources: resourceList,
    membership,
  };
}

/** Published quotation packages with their active items, for the app's GEN screen. Prices are integer paise. */
export async function quotePackageList(db: Db) {
  const pkgs = await db.select().from(quotePackages).where(eq(quotePackages.status, "published")).orderBy(asc(quotePackages.sortOrder), asc(quotePackages.createdAt));
  const items = pkgs.length
    ? await db.select().from(quoteItems).where(eq(quoteItems.isActive, true)).orderBy(asc(quoteItems.sortOrder), asc(quoteItems.createdAt))
    : [];
  const s = await getSettings(db, ["whatsapp_number", "company_name", "company_info", "office_phone"]);
  return {
    company: { name: s.company_name, info: s.company_info, phone: s.office_phone },
    orderWhatsapp: s.whatsapp_number,
    items: pkgs.map((p) => ({
      id: p.id, name: p.name, description: p.description,
      items: items.filter((i) => i.packageId === p.id).map((i) => ({
        id: i.id, name: i.name, description: i.description, imageUrl: i.imageUrl, unit: i.unit, unitPricePaise: i.unitPricePaise, defaultQty: i.defaultQty,
      })),
    })),
  };
}
