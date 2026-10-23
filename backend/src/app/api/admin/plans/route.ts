import { asc } from "drizzle-orm";
import { supportPlans } from "@/db/schema";
import { json } from "@/server/http";
import { adminRoute } from "@/server/routes";
export const dynamic = "force-dynamic";

export const GET = adminRoute("dashboard.view", async ({ db }) =>
  json({ plans: await db.select().from(supportPlans).orderBy(asc(supportPlans.sortOrder)) }),
);
