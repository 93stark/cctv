import { getDb } from "./index";
import { seed } from "./seed";
import { config } from "@/server/config";

async function main() {
  const cfg = config();
  const db = await getDb();
  const r = await seed(db, { adminEmail: cfg.ADMIN_BOOTSTRAP_EMAIL, adminPassword: cfg.ADMIN_BOOTSTRAP_PASSWORD });
  console.log(`Seed complete. Plans: ${r.plans}. Admin created: ${r.adminCreated}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
