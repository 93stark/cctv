# Razorpay online payment

Flow: app asks the server for an order (`POST /api/v1/payments/orders`) -> server creates the Razorpay order with the
plan price (never a client amount) -> app opens Razorpay Checkout with the public Key ID -> on success the app sends
`razorpayPaymentId / razorpayOrderId / razorpaySignature` to `POST /api/v1/payments/orders/:id/razorpay-verify` ->
server checks the HMAC signature and activates the plan. The webhook
(`/api/v1/webhooks/payments/razorpay`, events `payment.captured` and `order.paid`) is a second, independent
confirmation; whichever arrives first activates the plan, the other is a no-op.

Credentials are entered in **Admin -> Razorpay setup** (Key ID, Key Secret, Webhook secret). The Key Secret and the
webhook secret are stored AES-256-GCM encrypted (key derived from `SETTINGS_ENCRYPTION_KEY`, falling back to
`JWT_SECRET`; do not rotate it without re-entering the secrets), are never returned by any API and the Key Secret never
reaches the app. "Test connection" verifies the credentials with Razorpay.

Test mode uses `rzp_test_...` keys, live mode `rzp_live_...` (the admin screen shows which one is active).
The admin screen can switch the app between Razorpay and the old manual UPI flow at any time.
Keep auto-capture ON in the Razorpay dashboard.
