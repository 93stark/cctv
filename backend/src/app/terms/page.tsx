import { getDb } from "@/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms | CCTV Secret & Entrepreneurship" };

export default async function Terms() {
  const s = await getSettings(await getDb(), ["terms_text", "support_policy"]);
  return (
    <main className="doc">
      <h1>Terms of Use</h1>
      <p>{String(s.terms_text)}</p>
      <h2>Support policy</h2>
      <p>{String(s.support_policy)}</p>
    </main>
  );
}
