# Security notes

Implemented and covered by automated tests (`backend/tests`):
* OTP: HMAC-hashed, 5-minute expiry, single use, 5 attempts, per-number and per-IP rate limits.
* Sessions: 15-minute access tokens, rotating refresh tokens with reuse detection, logout revokes.
* Payments: server-side prices only; webhook HMAC signature; idempotent events; amount and currency must match; a membership cannot exist without a verified transaction (database check constraint); refunds end the membership; manual approval requires the exact received amount.
* Admin: scrypt password hashing, login throttling (failed attempts only), HttpOnly SameSite=Strict cookie, CSRF header and same-origin check on writes, per-route permission checks, immediate lock-out on disable/logout, audit log with secrets scrubbed.
* Uploads: type sniffed from file bytes, size limits. CSV exports neutralise spreadsheet formulas. Settings go through an allow-list with validation; URLs must be https.
* Mock OTP/payments are refused when `APP_ENV` is staging/production.

Known gaps / owner decisions:
* No MFA for admins yet. Use a long unique password and a small number of admin accounts.
* No real OTP provider or payment gateway integrated yet (see DEPLOYMENT.md).
* IP-based rate limits rely on `x-forwarded-for` set by Vercel.
* Rate limiting and sessions are stored in PostgreSQL; consider a WAF/Vercel Firewall rule on `/api/v1/auth/*` at launch.
* Dependencies: re-run `npm audit` before release. A moderate `postcss` advisory ships inside Next.js and has no fix available at the time of writing.
