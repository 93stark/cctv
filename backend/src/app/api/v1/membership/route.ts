import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { getEffectiveMembership } from "@/server/services/membership";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db, userId }) => json({ membership: await getEffectiveMembership(db, userId) }));
