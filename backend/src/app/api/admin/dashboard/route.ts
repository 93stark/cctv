import { json } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { dashboardStats } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const GET = adminRoute("dashboard.view", async ({ db }) => json(await dashboardStats(db)));
