import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return json({ status: "ok" });
  } catch {
    return json({ status: "error" }, 503);
  }
}
