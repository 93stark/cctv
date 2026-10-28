CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"buy_url" text NOT NULL,
	"button_text" text DEFAULT 'Buy now' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_status_chk" CHECK ("books"."status" in ('draft','published','unpublished'))
);
--> statement-breakpoint
CREATE INDEX "books_status_idx" ON "books" USING btree ("status","sort_order");
