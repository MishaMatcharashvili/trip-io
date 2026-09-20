DROP INDEX "event_match_event_node_idx";--> statement-breakpoint
DROP INDEX "event_match_unjudged_idx";--> statement-breakpoint
ALTER TABLE "event_match" ADD COLUMN "route_reason" text;--> statement-breakpoint
ALTER TABLE "event_match" ADD COLUMN "rejections" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "event_match_event_node_idx" ON "event_match" USING btree ("event_id","node_id");--> statement-breakpoint
CREATE INDEX "event_match_unjudged_idx" ON "event_match" USING btree ("score") WHERE "event_match"."judged_at" is null;