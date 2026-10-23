import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { buildWhatsAppLink } from "@/server/services/membership";

export const dynamic = "force-dynamic";

/** Only paid members receive the WhatsApp link. The app opens it; we never claim a message was sent. */
export const POST = userRoute(async ({ db, userId }) => json(await buildWhatsAppLink(db, userId)));
