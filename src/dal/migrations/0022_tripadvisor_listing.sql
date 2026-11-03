-- The table may already exist: the place-priority experiment (never merged) created it
-- on the shared database with this shape, so this is written to be a no-op there.
CREATE TABLE IF NOT EXISTS "tripadvisor_listing" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"city" text NOT NULL,
	"name" text NOT NULL,
	"geom" geography(Point,4326) NOT NULL,
	"rating" real,
	"review_count" integer NOT NULL,
	"rank" integer,
	"rank_of" integer,
	"url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tripadvisor_listing_geom_idx" ON "tripadvisor_listing" USING gist ("geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tripadvisor_listing_city_idx" ON "tripadvisor_listing" USING btree ("city","kind");