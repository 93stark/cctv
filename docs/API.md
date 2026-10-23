# API reference (v1)

Base URL: `https://<your-backend>/api/v1`. JSON in/out. Errors look like `{"error":{"code":"...","message":"..."}}`.
User endpoints need `Authorization: Bearer <accessToken>` (15 min). Refresh tokens (30 days) rotate on every use; reusing an old one revokes the whole session family.

| Method & path | Auth | Purpose |
|---|---|---|
| POST `/auth/otp/request` `{mobile}` | none | Send OTP (3 per 10 min per number, 20 per IP) |
| POST `/auth/otp/verify` `{mobile, code}` | none | Verify (max 5 tries, single use). Returns tokens + user |
| POST `/auth/refresh` `{refreshToken}` | none | Rotate tokens |
| POST `/auth/logout` `{refreshToken}` | user | Revoke session |
| GET/PUT/DELETE `/me` | user | Profile; DELETE anonymises the account (payment records kept) |
| POST `/me/photo` (multipart `file`) | user | Profile photo (png/jpg/webp, 2 MB, type sniffed) |
| GET `/home`, `/videos`, `/resources` | user | Content. Paid items come back `locked:true` with no URL for non-members |
| GET `/config` | none | Public remote config (never includes WhatsApp number or UPI details) |
| GET `/notifications`, POST `/notifications/:id/read` | user | Notices |
| GET `/plans` | none | Active plans (server prices) |
| POST `/payments/orders` `{planCode}` | user | Create order. Amount always comes from the server plan |
| GET `/payments/orders/:id` | user | Order status (the app polls this) |
| POST `/payments/orders/:id/manual-proof` `{utr}` | user | Manual UPI mode: submit UTR for admin verification |
| GET `/payments/history`, `/membership` | user | History / current entitlement |
| POST `/support/whatsapp-link` | member | Returns prefilled wa.me link; 403 if no active membership |
| POST `/webhooks/payments/:provider` | signature | Provider callback (HMAC verified, idempotent) |

Admin API: `/api/admin/*`, cookie session (`HttpOnly`, `SameSite=Strict`), every write needs header `x-admin-csrf: 1`, permission checked on the server per route. See `backend/src/server/permissions.ts` for the role matrix.
