import { getDb } from "@/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delete your account | CCTV Secret & Entrepreneurship" };

export default async function AccountDeletion() {
  const s = await getSettings(await getDb(), ["support_email", "office_phone"]);
  const email = String(s.support_email || "info@siliconcorporation.in");
  const phone = String(s.office_phone || "+91 77974 93140");
  return (
    <main className="doc">
      <h1>Delete your account</h1>
      <p>App: CCTV Secret & Entrepreneurship, by Silicon Corporation.</p>
      <h2>Delete inside the app</h2>
      <p>Open the app, go to Account, tap "Delete my account" and confirm. Your account is closed immediately.</p>
      <h2>Request deletion without the app</h2>
      <p>Email {email} (or call/WhatsApp {phone}) from your registered mobile number or mention it in the message, with the subject "Delete my account". We delete the account within 30 days and confirm to you.</p>
      <h2>What is deleted and what is kept</h2>
      <p>Deleted or anonymised: your name, mobile number, city, email, category, and support messages. Kept: payment and invoice records (amount, date, status), because Indian tax and accounting law requires them; they are no longer linked to your personal details beyond what the law requires.</p>
      <p>Read the full <a href="/privacy">Privacy Policy</a>.</p>
    </main>
  );
}
