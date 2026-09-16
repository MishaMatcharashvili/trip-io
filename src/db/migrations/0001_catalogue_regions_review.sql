CREATE TYPE "public"."region_kind" AS ENUM('municipality', 'city');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('curate', 'reject', 'skip');--> statement-breakpoint
CREATE TABLE "place_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"reviewer_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_ka" text NOT NULL,
	"kind" "region_kind" NOT NULL,
	"iso_region" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"geom" geography(MultiPolygon,4326) NOT NULL,
	"poll_point" geography(Point,4326) NOT NULL,
	CONSTRAINT "region_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "corridor" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "place_review" ADD CONSTRAINT "place_review_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_review" ADD CONSTRAINT "place_review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_review_place_idx" ON "place_review" USING btree ("place_id","created_at");--> statement-breakpoint
CREATE INDEX "region_geom_idx" ON "region" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX "place_source_idx" ON "place" USING btree ("source","source_id");--> statement-breakpoint
ALTER TABLE "corridor" ADD CONSTRAINT "corridor_slug_unique" UNIQUE("slug");