import { json } from "@/server/http";
import { publicRoute } from "@/server/routes";
import { getPublicConfig } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Public remote configuration (no secrets). Cacheable by the app for offline use. */
export const GET = publicRoute(async ({ db }) => json(await getPublicConfig(db)));
