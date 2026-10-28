CREATE TABLE "quote_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_packages_status_chk" CHECK ("quote_packages"."status" in ('draft','published','unpublished'))
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"unit_price_paise" integer DEFAULT 0 NOT NULL,
	"default_qty" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_items_price_chk" CHECK ("quote_items"."unit_price_paise" >= 0 and "quote_items"."default_qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_package_id_quote_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."quote_packages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "quote_packages_status_idx" ON "quote_packages" USING btree ("status","sort_order");
--> statement-breakpoint
CREATE INDEX "quote_items_pkg_idx" ON "quote_items" USING btree ("package_id","sort_order");
