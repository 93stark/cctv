import { json, readJson } from "@/server/http";
import { userRoute } from "@/server/routes";
import { userSummary } from "@/server/services/auth";
import { getEffectiveMembership } from "@/server/services/membership";
import { deleteAccount, profileInput, upsertProfile } from "@/server/services/profile";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db, userId }) => {
  const [user, membership] = await Promise.all([userSummary(db, userId), getEffectiveMembership(db, userId)]);
  return json({ user, membership });
});

export const PUT = userRoute(async ({ db, req, userId }) => {
  const input = await readJson(req, profileInput);
  await upsertProfile(db, userId, input);
  return json({ user: await userSummary(db, userId) });
});

export const DELETE = userRoute(async ({ db, userId }) => {
  await deleteAccount(db, userId);
  return json({ ok: true });
});
