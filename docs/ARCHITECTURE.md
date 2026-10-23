# CCTV Secret & Entrepreneurship: Architecture and Implementation Plan

Owner: Ali Ansari, Silicon Corporation
Status: original plan document (Phase 1-2). The backend and admin panel are now built; see README.md for the current status. Items below describe the design, not what is deployed.

## 1. What exists today

| Item | Status |
|---|---|
| Book landing page at cctv.siliconcorporation.in | Live (static HTML, Vercel project `cctv`) |
| GitHub repo 93stark/cctv | Only README. Claude has no push access yet |
| Flutter app, backend, admin panel | Not started |
| WhatsApp OTP provider | Not chosen |
| Payment gateway (API + webhooks) | Not chosen. Only a static PhonePe QR image supplied |
| Codemagic, Play Console, signing key | Not connected |

## 2. Recommended technical decisions (defaults, change if you disagree)

| Area | Choice | Why |
|---|---|---|
| Mobile app | Flutter, Riverpod, go_router, dio, flutter_secure_storage, firebase_messaging, url_launcher | As requested; feature-based folders |
| Backend + Admin Panel | One Next.js (TypeScript) project on Vercel: `/api/*` for REST, `/admin` for the panel | Same stack as your other Vercel projects, one deployment, shared types |
| Database | PostgreSQL (Neon or Supabase, free tier to start) with Drizzle ORM migrations | Relational, cheap, no server to manage |
| File storage | Vercel Blob or Supabase Storage (images, PDFs) | No large blobs in the database |
| Push | Firebase Cloud Messaging | Free |
| OTP | Provider adapter (WhatsApp Cloud API, MSG91, Gupshup or Twilio Verify) | Provider can be swapped without app changes |
| Payments | Payment adapter (PhonePe Payment Gateway first, Razorpay/Cashfree as alternatives) | Same reason |
| CI/CD | GitHub Actions for backend, Codemagic for Flutter | As requested |

Environments: `development` (mock OTP and mock payments allowed), `staging`, `production` (mocks hard-disabled).

## 3. System overview

```
Flutter app ──HTTPS──┐
                     ├── Next.js API (Vercel) ── PostgreSQL
Admin web panel ─────┘          │  ├── Blob storage (media)
                                │  ├── OTP provider (WhatsApp)
                                │  ├── Payment provider (webhook -> API)
                                │  └── FCM (push)
```

The app and admin panel never talk to the database or providers directly. Every rule (price, entitlement, auth) lives on the server.

## 4. Database schema (PostgreSQL)

Money is stored as integer paise (`9900`, `99900`) with a `currency` column (`INR`).

| Table | Purpose | Key columns |
|---|---|---|
| users | Account per mobile number | id, mobile_e164 (unique), status, created_at, deleted_at |
| user_profiles | Profile data | user_id, full_name, location, pin_code, category (individual/technician/business_owner/student), photo_url |
| otp_requests | OTP verification | id, mobile_e164, code_hash (HMAC, never plaintext), expires_at, attempts, consumed_at, ip |
| auth_sessions | Refresh tokens | id, user_id, token_hash, device, expires_at, revoked_at |
| admin_users | Admin accounts | id, email, password_hash (argon2), role_id, mfa_secret_enc, disabled |
| admin_roles | Roles | id, name (owner, manager, support, viewer) |
| admin_permissions | Role to permission map | role_id, permission_key |
| banners | Home carousel | id, image_url, title, description, button_text, destination_url, status, sort_order, starts_at, ends_at |
| support_plans | Plans | id, code (limited, lifetime), name, price_paise, currency, benefits_json, terms, is_active, is_lifetime |
| videos | Learning videos | id, title, thumbnail_url, description, video_url, is_free, status, sort_order |
| learning_resources | PDFs and pages | id, type (pdf/page), title, body_or_file_url, is_free, status |
| notifications | Admin-created notices | id, title, body, type, status, publish_at |
| user_notifications | Per-user read state | user_id, notification_id, read_at |
| payment_orders | One per checkout attempt | id, order_ref (unique), user_id, plan_id, amount_paise (copied from plan at creation), currency, status (created, pending, paid, failed, cancelled, expired), provider |
| payment_transactions | Provider-side events | id, order_id, provider_txn_ref (unique per provider), amount_paise, status, raw_event_hash, verified_at |
| provider_events | Webhook log for idempotency | id, provider, event_id (unique), payload_hash, processed_at |
| refunds | Refunds and reversals | id, transaction_id, amount_paise, status, reason, created_by |
| memberships | Entitlements | id, user_id, plan_id, transaction_id (required), status (active, refunded, revoked), starts_at, ends_at (null for lifetime) |
| support_events | WhatsApp support handoff log | id, user_id, membership_id, created_at |
| app_settings | Remote config | key, value_json, version, updated_by |
| media_assets | Uploaded file metadata | id, url, mime, size, uploaded_by |
| audit_logs | Sensitive admin actions | id, admin_id, action, entity, before_json, after_json (secrets excluded), ip, created_at |

Rules: foreign keys everywhere; unique `(provider, provider_txn_ref)`; a membership cannot exist without a verified transaction; payment rows are append-only (no editing amounts).

## 5. REST API outline (`/api/v1`)

Public app (user token required unless noted):

- `POST /auth/otp/request`, `POST /auth/otp/verify` (no token), `POST /auth/refresh`, `POST /auth/logout`
- `GET/PUT /me`, `POST /me/photo`, `DELETE /me` (account deletion)
- `GET /home` (banners, book config, free videos, resources), `GET /config` (remote config, cacheable)
- `GET /videos`, `GET /resources`, `GET /notifications`, `POST /notifications/:id/read`
- `GET /plans`, `POST /payments/orders`, `GET /payments/orders/:id` (status refresh), `GET /payments/history`
- `GET /membership`, `POST /support/whatsapp-link` (returns prefilled link, records event)
- `POST /webhooks/payments/:provider` (provider signature verified, no user token)

Admin (`/api/admin/*`, admin session + permission check on every route): auth, dashboard stats, users (list, filter, view, CSV export), payments (list, detail, reconcile, CSV), plans, settings, banners, videos, resources, notifications, memberships (view, manual correction with reason), refunds, audit logs.

## 6. Admin permission matrix

| Permission | owner | manager | support | viewer |
|---|---|---|---|---|
| View dashboard and reports | yes | yes | yes | yes |
| View users and payments | yes | yes | yes | no |
| Export CSV | yes | yes | no | no |
| Manage content (banners, videos, PDFs, notifications) | yes | yes | no | no |
| Edit app settings (WhatsApp number, URLs, text) | yes | yes | no | no |
| Edit plans and payment settings | yes | no | no | no |
| Membership correction and refunds | yes | no | no | no |
| Manage admins | yes | no | no | no |
| View audit log | yes | no | no | no |

## 7. Payment design

Flow: user picks plan -> server creates `payment_order` using the **server-side** plan price -> provider checkout / UPI intent / dynamic QR -> provider webhook -> server verifies signature, order id, amount, currency and status -> marks transaction verified -> creates membership in one database transaction -> app polls order status and shows success.

Rules: never trust the app's success screen; webhooks are idempotent via `provider_events.event_id`; amount mismatch means no activation and an admin alert; refund or reversal sets membership to `refunded` per policy; every state change is audit-logged.

**Important limit of the QR you supplied:** it is a static PhonePe QR with no order reference. A static QR gives no automatic, trustworthy confirmation, so it cannot safely activate memberships by itself. Options:

1. **Recommended:** open a PhonePe Payment Gateway (business) merchant account, or use Razorpay/Cashfree. This gives dynamic QR/UPI intent with verified webhooks. Needs business KYC, API keys, and has transaction fees.
2. **Interim, manual:** user pays via the static QR, enters the UTR/transaction ID, an admin checks it against the PhonePe statement and activates the membership. Slower, needs a person, but needs no gateway. Every activation requires a reason and creates an audit record.

The QR shows a payee name different from the author's. Confirm that this account is yours (or the company's) and allowed to collect business payments before it is used in the app.

## 8. OTP design

- 6-digit code, stored as an HMAC hash, expires in 5 minutes, max 5 wrong attempts, then lockout.
- Rate limits per mobile number and per IP (for example 3 requests per 15 minutes).
- Mock mode (fixed test code) only when `APP_ENV` is not production. The production build refuses to start with mock mode on.
- WhatsApp OTP needs a provider account, an approved authentication template, and business verification. I will not call it working until a real OTP has been received on a real phone.

## 9. Security and privacy checklist

HTTPS only; argon2 password hashing; short-lived access token plus rotating refresh token in secure storage; authorization check on every route; input validation (zod); rate limiting; upload type and size checks; secrets only in environment variables; `.env` never committed; webhook signature checks; audit log without secrets; daily database backups with a tested restore; privacy policy and terms pages; account deletion that removes personal data while keeping legally required payment records; Google Play data-safety form completed from the actual data collected.

## 10. Repository layout

```
/mobile_app   Flutter app
/backend      Next.js API + admin panel (or /backend and /admin_panel split later)
/docs         this file, API docs, runbooks
/scripts      seed and utility scripts
.github/workflows   backend CI
codemagic.yaml      Flutter CI/CD
```

## 11. Phases

| Phase | Output | Owner action needed |
|---|---|---|
| 3 | Backend, database migrations, seed data, auth with mock OTP | Create database (Neon/Supabase) and give connection string as a secret |
| 4 | Flutter branding, login, profile, dashboard, content | Original cover image, logo preferences |
| 5 | Admin panel: content, settings, users | Admin email for first owner account |
| 6 | Payments and memberships (mock adapter first, real after keys) | Choose option 1 or 2 above; merchant credentials |
| 7 | WhatsApp support link, notifications | WhatsApp support number; Firebase project |
| 8 | Automated tests, security review | none |
| 9 | GitHub + Codemagic pipelines, signed AAB | Install Claude GitHub App on the repo; Codemagic account; signing key |
| 10 | Play Console listing, internal testing | Play developer account; closed-testing requirements for new accounts apply (verify at release time) |

## 12. Costs to expect

Free tiers can cover early use: Vercel Hobby, Neon/Supabase free, Firebase FCM, Codemagic free minutes. Likely paid items: WhatsApp OTP messages (per message), payment gateway fees (per transaction), Google Play developer fee (one-time), custom domain you already own. A Vercel Hobby plan is not meant for commercial use; a Pro plan may be needed once the app takes real payments.

## 13. Open decisions

1. OTP provider (and whether to start with mock OTP).
2. Payment route: gateway (option 1) or interim manual UTR (option 2).
3. Database host: Neon or Supabase.
4. Meaning of "Limited Support" (number of questions, days, or response time). It must be written down before launch.
5. Who owns the Play Console account (individual or Silicon Corporation).
