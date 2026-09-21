CREATE TABLE "briefing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day" date NOT NULL,
	"day_index" integer NOT NULL,
	"quiet" boolean NOT NULL,
	"document" jsonb NOT NULL,
	"composed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_to" text,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "briefing" ADD CONSTRAINT "briefing_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "briefing_trip_day_idx" ON "briefing" USING btree ("trip_id","day");--> statement-breakpoint
CREATE INDEX "briefing_day_idx" ON "briefing" USING btree ("day");