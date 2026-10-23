# CCTV Secret & Entrepreneurship

Android app + backend + admin panel for the book *CCTV Secret & Entrepreneurship* by Ali Ansari (Silicon Corporation).

| Folder | What | Status |
|---|---|---|
| `backend/` | Next.js 15 API + Admin Panel, Drizzle + PostgreSQL | Built; 45 automated tests pass; `next build` OK |
| `mobile_app/` | Flutter app (login, profile, home, content, plans, UPI checkout, WhatsApp support, account deletion) | Source written; **never compiled or run yet** (no Flutter SDK was available). First Codemagic build may need small fixes |
| `landing/` | Static landing page (live at cctv.siliconcorporation.in) | Live |
| `docs/` | Architecture, API, deployment, security, Play release checklist | |
| `codemagic.yaml`, `.github/workflows` | CI | Written, not yet run |

## Honest status
Working and tested (automated, in-memory Postgres): OTP flow with the **mock** provider, sessions, profile, plans, orders, signed mock webhooks, manual UPI approval, refunds, memberships, WhatsApp link, content visibility, admin auth and permissions, settings, audit log.

**Not configured / not done:** real WhatsApp OTP provider, real payment gateway, FCM push notifications, Firebase, production database, Play Console, app icon/store graphics, signing key. See `docs/DEPLOYMENT.md`.

## Run the backend locally
```bash
cd backend
cp .env.example .env.local        # dev placeholders only
npm ci
ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_PASSWORD='a-long-password-1' npm run db:seed
npm run dev                        # http://localhost:3000/admin  (embedded Postgres, mock OTP code 8899)
npm test
```
## Run the app
```bash
cd mobile_app
bash scripts/prepare_android.sh    # generates android/ and applies manifest settings
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```
