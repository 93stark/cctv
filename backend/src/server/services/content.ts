import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { banners, learningResources, supportPlans, videos } from "@/db/schema";
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
  const [bannerList, videoList, resourceList, settings, membership] = await Promise.all([
    visibleBanners(db),
    listVideos(db, userId, 6),
    listResources(db, userId, 6),
    getSettings(db, ["book_title", "book_author", "amazon_url", "book_cover_url", "promo_text"]),
    getEffectiveMembership(db, userId),
  ]);
  return {
    banners: bannerList,
    book: {
      title: settings.book_title,
      author: settings.book_author,
      amazonUrl: settings.amazon_url,
      coverUrl: settings.book_cover_url,
    },
    promoText: settings.promo_text,
    freeVideos: videoList,
    resources: resourceList,
    membership,
  };
}
