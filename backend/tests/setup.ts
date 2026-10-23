process.env.APP_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
process.env.OTP_SECRET = "test-otp-secret-fedcba9876543210fedcba9876543210";
process.env.OTP_PROVIDER = "mock";
process.env.MOCK_OTP_CODE = "8899";
process.env.PAYMENT_PROVIDER = "mock";
process.env.MOCK_WEBHOOK_SECRET = "test-webhook-secret";
delete process.env.DATABASE_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;
