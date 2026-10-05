CREATE TYPE "public"."source_item_status" AS ENUM('new', 'empty', 'rejected', 'published');--> statement-breakpoint
CREATE TABLE "source_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" text NOT NULL,
	"original_text" text,
	"text" text NOT NULL,
	"status" "source_item_status" DEFAULT 'new' NOT NULL,
	"reason" text,
	"extraction" jsonb,
	"extracted_at" timestamp with time zone,
	CONSTRAINT "source_item_version_uq" UNIQUE("source","url","content_hash")
);
--> statement-breakpoint
CREATE INDEX "source_item_status_idx" ON "source_item" USING btree ("status","fetched_at");