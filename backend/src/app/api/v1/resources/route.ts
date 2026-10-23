import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { listResources } from "@/server/services/content";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db, userId }) => json({ items: await listResources(db, userId) }));
