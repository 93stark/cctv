ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_pin_chk";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_pin_chk" CHECK ("user_profiles"."pin_code" ~ '^[0-9]{4,6}$');
