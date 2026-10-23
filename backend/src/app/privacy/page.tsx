import { getDb } from "@/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy Policy | CCTV Secret & Entrepreneurship" };

export default async function Privacy() {
  const s = await getSettings(await getDb(), ["privacy_policy_text", "company_name", "company_info", "support_email", "office_phone"]);
  return (
    <main className="doc">
      <h1>Privacy Policy</h1>
      <p>{String(s.privacy_policy_text)}</p>
      <h2>Contact</h2>
      <p>
        {String(s.company_name)}
        {"\n"}
        {String(s.company_info)}
        {s.support_email ? `\nEmail: ${s.support_email}` : ""}
        {s.office_phone ? `\nPhone: ${s.office_phone}` : ""}
      </p>
      <h2>Account deletion</h2>
      <p>You can delete your account from the Profile screen of the app. Your personal details are removed; payment records are kept as required by law.</p>
    </main>
  );
}
