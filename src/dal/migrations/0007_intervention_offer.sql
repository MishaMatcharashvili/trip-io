ALTER TABLE "intervention" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "offer" jsonb;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "intervention_push_event_idx" ON "intervention" USING btree ("trip_id","event_id") WHERE "intervention"."channel" = 'push';