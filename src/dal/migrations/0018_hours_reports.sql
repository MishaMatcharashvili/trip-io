CREATE TYPE "public"."hours_trust" AS ENUM('curator', 'community');--> statement-breakpoint
CREATE TABLE "hours_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"day" date NOT NULL,
	"reporter_id" text NOT NULL,
	"trust" "hours_trust" NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" uuid,
	CONSTRAINT "hours_report_once_uq" UNIQUE("place_id","day","reporter_id")
);
--> statement-breakpoint
ALTER TABLE "hours_report" ADD CONSTRAINT "hours_report_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hours_report" ADD CONSTRAINT "hours_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hours_report" ADD CONSTRAINT "hours_report_event_id_world_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."world_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hours_report_place_day_idx" ON "hours_report" USING btree ("place_id","day");