import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import { memberships, supportEvents, supportPlans, userProfiles } from "@/db/schema";
import { ApiError } from "../http";
import { getSettings } from "../settings";

export function membershipReference(id: string): string {
  return `M-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type MembershipDto = {
  id: string;
  reference: string;
  planCode: string;
  planName: string;
  isLifetime: boolean;
  status: "active";
  startsAt: Date;
  endsAt: Date | null;
};

/** The membership that currently gives the user paid support (lifetime wins over limited). */
export async function getEffectiveMembership(db: Db, userId: string, now = new Date()): Promise<MembershipDto | null> {
  const rows = await db
    .select({
      id: memberships.id,
      startsAt: memberships.startsAt,
      endsAt: memberships.endsAt,
      planCode: supportPlans.code,
      planName: supportPlans.name,
      isLifetime: supportPlans.isLifetime,
    })
    .from(memberships)
    .innerJoin(supportPlans, eq(supportPlans.id, memberships.planId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        or(isNull(memberships.endsAt), gt(memberships.endsAt, now)),
      ),
    )
    .orderBy(desc(supportPlans.isLifetime), desc(memberships.createdAt))
    .limit(1);
  const m = rows[0];
  if (!m) return null;
  return { ...m, reference: membershipReference(m.id), status: "active" };
}

export async function buildWhatsAppLink(db: Db, userId: string): Promise<{ url: string; reference: string }> {
  const membership = await getEffectiveMembership(db, userId);
  if (!membership) {
    throw new ApiError(403, "membership_required", "A paid support plan is required for WhatsApp support.");
  }
  const s = await getSettings(db, ["whatsapp_number", "whatsapp_message_template"]);
  const number = typeof s.whatsapp_number === "string" ? s.whatsapp_number.replace(/\D/g, "") : "";
  if (!number) {
    throw new ApiError(503, "whatsapp_not_configured", "WhatsApp support number is not set yet. Please contact the office.");
  }
  const template = String(s.whatsapp_message_template);
  const plan = await db.select({ pricePaise: supportPlans.pricePaise }).from(supportPlans).where(eq(supportPlans.code, membership.planCode)).limit(1);
  const prof = await db.select({ fullName: userProfiles.fullName }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const amount = plan[0] ? String(plan[0].pricePaise / 100) : "";
  const message = template
    .replace(/\{reference\}/g, membership.reference)
    .replace(/\{plan\}/g, membership.planName)
    .replace(/\{amount\}/g, amount)
    .replace(/\{name\}/g, prof[0]?.fullName ?? "");
  await db.insert(supportEvents).values({ userId, membershipId: membership.id });
  return { url: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, reference: membership.reference };
}
