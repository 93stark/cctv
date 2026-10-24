# Deployment guide

## 1. Backend + Admin Panel (Vercel)
1. Create a PostgreSQL database (Neon or Supabase, free tier is fine to start). Copy the connection string.
2. Create a **new Vercel project** from this repo with *Root Directory* `backend` (keep the landing page project separate). Suggested domain: `app.siliconcorporation.in`.
3. Set environment variables (Project > Settings > Environment Variables). Never commit them.

| Variable | Value |
|---|---|
| `APP_ENV` | `production` (use `staging` for a test deployment) |
| `DATABASE_URL` | your Postgres URL (with `sslmode=require`) |
| `JWT_SECRET`, `OTP_SECRET` | two different values from `openssl rand -hex 32` |
| `OTP_PROVIDER` | `mock` is refused in production unless you also set `ALLOW_DEMO_OTP=true` (temporary demo, demo code `MOCK_OTP_CODE`, default 8899). Remove both once a real provider is live |
| `PAYMENT_PROVIDER` | `manual_upi` (QR + admin verification) until a gateway adapter exists |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token (required in production for uploads) |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | first owner login (min 12 chars). Remove after first seed |

4. Run once from your machine or a CI job: `cd backend && npm ci && npm run db:migrate && npm run db:seed`.
5. Open `/admin`, sign in, change settings: WhatsApp number (`+917797493140`), UPI QR image and payee name, support policy text, banners and videos.

The server **refuses to start** in staging/production with mock OTP, mock payments, placeholder secrets or missing `DATABASE_URL`/blob token.

## 2. Real WhatsApp OTP (not done yet)
Implement `OtpProvider` in `backend/src/server/otp/provider.ts` for your chosen service (WhatsApp Cloud API authentication template, MSG91, Gupshup, Twilio Verify) and select it with `OTP_PROVIDER`. You need a provider account, an approved template and business verification. **Do not announce login as working until a real OTP reaches a real phone.**

## 3. Payments
* `manual_upi` (ready): user pays the QR, submits the UTR; an admin with the `payments.verify_manual` permission checks the bank/PhonePe statement and approves with the exact received amount. Every decision is in the audit log. Slower, but the only safe option with a static QR.
* Gateway (not done): add a `PaymentProvider` (PhonePe PG, Razorpay, Cashfree) with signature verification in `backend/src/server/payments/providers.ts`. The webhook route, idempotency, amount/currency checks and refunds already exist.
* The static QR supplied shows a payee name different from the author's. Confirm the account belongs to you or the company before using it.

## 4. Backups and restore
Enable daily backups / point-in-time recovery in Neon or Supabase. Test a restore into a scratch database once before launch and after every schema change. Keep the `JWT_SECRET`/`OTP_SECRET` values in a password manager (rotating them logs everyone out).

## 5. Mobile app
Set Codemagic variable groups as described at the top of `codemagic.yaml`. `API_BASE_URL` must be the deployed backend (HTTPS). Push a tag `v1.0.0` to build the signed AAB.

## 6. Firebase push notifications (not done)
In-app notifications work. Push (FCM) needs a Firebase project, `google-services.json`, a device-token endpoint and a sender; not built yet.

## Vercel project "cctv-api" (already created)
Root Directory `backend`, auto-deploys on every push to `main`. The `vercel-build` script runs `db:migrate` and `db:seed` (both idempotent) before `next build`, so the database is prepared on every deploy. Add a Neon Postgres database from the project's Storage tab; it injects `DATABASE_URL` automatically.

## Real SMS OTP (apitxt.com)

1. In the apitxt dashboard create/copy the API key (Dashboard -> API Keys). Make sure the wallet has balance and, if you use your own SMS template, note its numeric template id (the template must contain `{otp}`).
2. In Vercel (project `cctv-api` -> Settings -> Environment Variables, Production) add `APITXT_AUTH_KEY` (mark Sensitive) and optionally `APITXT_TEMPLATE_ID`.
3. Set `OTP_PROVIDER=apitxt` and delete `ALLOW_DEMO_OTP` and `MOCK_OTP_CODE`, then redeploy. The demo code 8899 stops working.
4. apitxt allows 3 OTPs per mobile per minute; the API also limits 3 per 10 minutes per mobile.
