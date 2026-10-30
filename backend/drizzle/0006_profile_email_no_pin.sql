ALTER TABLE "user_profiles" ALTER COLUMN "pin_code" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "email" text;
