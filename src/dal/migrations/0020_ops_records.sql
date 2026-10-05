CREATE TABLE "model_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"trip_id" uuid,
	"match_id" uuid,
	"input_tokens" integer NOT NULL,
	"cached_input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "trip_survey" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"would_pay" boolean NOT NULL,
	"note" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verdict_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid,
	"family" text NOT NULL,
	"kind" text NOT NULL,
	"route" text NOT NULL,
	"verdict" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"reason" text,
	"note" text,
	"auditor" text NOT NULL,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verdict_audit_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
ALTER TABLE "model_call" ADD CONSTRAINT "model_call_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_call" ADD CONSTRAINT "model_call_match_id_event_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."event_match"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_survey" ADD CONSTRAINT "trip_survey_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_call_created_idx" ON "model_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_call_purpose_idx" ON "model_call" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "verdict_audit_family_idx" ON "verdict_audit" USING btree ("family","audited_at");