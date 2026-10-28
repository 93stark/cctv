CREATE TABLE "quote_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"unit_price_paise" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_variants_price_chk" CHECK ("quote_variants"."unit_price_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_variants" ADD CONSTRAINT "quote_variants_item_id_quote_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."quote_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "quote_variants_item_idx" ON "quote_variants" USING btree ("item_id","sort_order");
