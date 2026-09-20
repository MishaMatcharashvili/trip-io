CREATE TABLE "plan_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"prompt_version" integer NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"cache_key" text NOT NULL,
	"source" text NOT NULL,
	"attempts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_patch" ALTER COLUMN "applied_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "trip_patch" ALTER COLUMN "applied_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_patch" ALTER COLUMN "client_seq" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD COLUMN "inverse_ops" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD COLUMN "seq" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_generation" ADD CONSTRAINT "trip_generation_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_generation_created_idx" ON "trip_generation" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoint_log_patch_idx" ON "checkpoint_log" USING btree ("trip_id","patch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_patch_seq_idx" ON "trip_patch" USING btree ("trip_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_patch_client_seq_idx" ON "trip_patch" USING btree ("trip_id","client_seq") WHERE "trip_patch"."client_seq" is not null;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD CONSTRAINT "trip_patch_intervention_accepted" CHECK ("trip_patch"."author" <> 'intervention' OR "trip_patch"."accepted_by" IS NOT NULL);