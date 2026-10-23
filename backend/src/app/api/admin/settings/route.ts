import { z } from "zod";
import { clientIp, json, readJson } from "@/server/http";
import { adminRoute } from "@/server/routes";
import { readSettings, writeSettings } from "@/server/services/admin";
export const dynamic = "force-dynamic";

export const GET = adminRoute("settings.manage", async ({ db }) => json({ settings: await readSettings(db) }));

export const PUT = adminRoute("settings.manage", async ({ db, req, admin }) => {
  const patch = await readJson(req, z.record(z.unknown()));
  await writeSettings(db, admin, patch, admin.permissions.has("payment_settings.manage"), clientIp(req));
  return json({ ok: true });
});
