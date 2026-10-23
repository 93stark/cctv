import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { paymentHistory } from "@/server/services/payments";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db, userId }) => json({ items: await paymentHistory(db, userId) }));
