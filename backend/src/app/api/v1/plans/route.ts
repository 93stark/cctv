import { json } from "@/server/http";
import { publicRoute } from "@/server/routes";
import { listActivePlans } from "@/server/services/content";

export const dynamic = "force-dynamic";

export const GET = publicRoute(async ({ db }) => json({ items: await listActivePlans(db) }));
