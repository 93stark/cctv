import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { quotePackageList } from "@/server/services/content";

export const dynamic = "force-dynamic";

export const GET = userRoute(async ({ db }) => json(await quotePackageList(db)));
