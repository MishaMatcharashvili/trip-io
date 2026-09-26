CREATE TYPE "public"."road_condition" AS ENUM('closed', 'restricted', 'delays', 'hazard', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."road_report_status" AS ENUM('pending', 'published', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "road_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corridor_id" uuid NOT NULL,
	"condition" "road_condition" NOT NULL,
	"hazard" text,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reporter_id" text NOT NULL,
	"reporter_name" text NOT NULL,
	"chat_id" text NOT NULL,
	"status" "road_report_status" NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "road_report" ADD CONSTRAINT "road_report_corridor_id_corridor_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_report" ADD CONSTRAINT "road_report_event_id_world_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."world_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "road_report_status_idx" ON "road_report" USING btree ("status","reported_at");--> statement-breakpoint
CREATE INDEX "road_report_reporter_idx" ON "road_report" USING btree ("reporter_id","status");