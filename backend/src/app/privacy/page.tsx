import { getDb } from "@/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy Policy | CCTV Secret & Entrepreneurship" };

export default async function Privacy() {
  const s = await getSettings(await getDb(), ["company_name", "support_email", "office_phone"]);
  const company = String(s.company_name || "Silicon Corporation");
  const email = String(s.support_email || "info@siliconcorporation.in");
  const phone = String(s.office_phone || "+91 77974 93140");
  return (
    <main className="doc">
      <h1>Privacy Policy</h1>
      <p>App: CCTV Secret & Entrepreneurship (in.siliconcorporation.cctvsecret){"\n"}Published by {company}, West Bengal, India.{"\n"}Last updated: 16 November 2026</p>

      <h2>1. What this policy covers</h2>
      <p>This policy explains what information the CCTV Secret & Entrepreneurship mobile app collects, why, how it is protected and how you can have it deleted. By using the app you agree to this policy.</p>

      <h2>2. Information we collect</h2>
      <p>
        Account details: your mobile number (used to sign in with an OTP), your name, city, optional email and your category (for example technician or shop owner).{"\n"}
        Payments: when you buy a support plan we store the order, plan, amount, status and the payment reference given by our payment provider. Your card, UPI or bank details are entered on the payment provider's secure screen (Razorpay) and are never seen or stored by us.{"\n"}
        Support: messages or details you send us when you ask for help.{"\n"}
        Quotation maker (GEN): the customer name and items you enter while making a quotation are kept on your phone to create the PDF. Your own name, mobile number and city appear on the PDF header.{"\n"}
        Technical data: basic server logs (such as time and app version of a request) that help us fix errors.
      </p>

      <h2>3. How we use it</h2>
      <p>To create and secure your account and sign you in by OTP; to unlock paid support after payment; to give support; to show you new videos, offers and updates inside the app; to prevent fraud and misuse; and to meet legal and accounting requirements. We do not sell your personal information and we do not show third-party advertising.</p>

      <h2>4. Permissions the app asks for</h2>
      <p>
        Internet: to load content and talk to our server.{"\n"}
        SMS one-time code: when you sign in, Android may ask you to allow the app to read the single OTP message. This uses Google's one-tap "SMS User Consent" prompt, only the code message you approve is shared, and the app cannot read your other messages.{"\n"}
        Sharing / files: used only when you share a quotation PDF or the app with someone.
      </p>

      <h2>5. Services we use</h2>
      <p>Your data is processed by service providers that help us run the app: Razorpay (online payments), an SMS provider (sending OTP messages) and our cloud hosting and database providers. They may use your data only to provide their service to us.</p>

      <h2>6. How long we keep data</h2>
      <p>We keep your account details while your account is active. If you delete your account your personal details are removed or anonymised. Payment records are kept for the period required by Indian tax and accounting law.</p>

      <h2>7. Security</h2>
      <p>Data travels over encrypted connections (HTTPS). Sign-in uses OTP and secure session tokens, and payment secrets are stored encrypted. No system is perfectly secure, but we work to protect your information.</p>

      <h2>8. Your choices and account deletion</h2>
      <p>You can view and update your details, and delete your account yourself from inside the app: Account → Delete my account. You can also request deletion by email or phone below; see <a href="/account-deletion">/account-deletion</a>. We act on deletion requests within 30 days.</p>

      <h2>9. Children</h2>
      <p>The app is meant for adults and learners aged 18 and above. We do not knowingly collect information from children under 13.</p>

      <h2>10. Changes to this policy</h2>
      <p>If we change this policy we will update the date above and, for important changes, tell you in the app.</p>

      <h2>11. Contact</h2>
      <p>
        {company}, West Bengal, India{"\n"}
        Email: {email}{"\n"}
        Phone / WhatsApp: {phone}{"\n"}
        Website: www.siliconcorporation.in
      </p>
    </main>
  );
}
