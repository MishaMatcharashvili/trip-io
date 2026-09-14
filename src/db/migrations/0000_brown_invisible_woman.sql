CREATE TYPE "public"."place_tier" AS ENUM('curated', 'verified', 'raw');--> statement-breakpoint
CREATE TYPE "public"."patch_author" AS ENUM('user', 'system', 'intervention');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('push', 'email', 'briefing');--> statement-breakpoint
CREATE TYPE "public"."event_route" AS ENUM('interrupt', 'briefing', 'drop');--> statement-breakpoint
CREATE TYPE "public"."intervention_outcome" AS ENUM('accepted', 'dismissed', 'ignored', 'muted');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corridor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"geom" geography(LineString,4326) NOT NULL,
	"buffer_m" integer NOT NULL,
	"season_risk" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_ka" text,
	"category" text NOT NULL,
	"geom" geography(Point,4326) NOT NULL,
	"tier" "place_tier" NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"opening_hours" jsonb,
	"attrs" jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "checkpoint_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"party" jsonb NOT NULL,
	"pace" text NOT NULL,
	"budget" text NOT NULL,
	"prefs" jsonb NOT NULL,
	"head_patch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"place_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"indoor" boolean NOT NULL,
	"geom" geography(Point,4326) NOT NULL,
	"meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_patch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"parent_id" uuid,
	"intent" text NOT NULL,
	"ops" jsonb NOT NULL,
	"author" "patch_author" NOT NULL,
	"accepted_by" text,
	"applied_at" timestamp with time zone,
	"client_seq" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verdict" jsonb,
	"score" real NOT NULL,
	"judged_at" timestamp with time zone,
	"route" "event_route"
);
--> statement-breakpoint
CREATE TABLE "intervention" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"patch_id" uuid,
	"outcome" "intervention_outcome",
	"outcome_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trip_watch" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"active_to" timestamp with time zone NOT NULL,
	"regions" geography(Geometry,4326) NOT NULL,
	"channels" "delivery_channel"[] NOT NULL,
	"quiet_hours" jsonb NOT NULL,
	"cap" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"confidence" real NOT NULL,
	"geom" geography(Geometry,4326) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "world_event_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_log" ADD CONSTRAINT "checkpoint_log_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_log" ADD CONSTRAINT "checkpoint_log_patch_id_trip_patch_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."trip_patch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_head_patch_id_trip_patch_id_fk" FOREIGN KEY ("head_patch_id") REFERENCES "public"."trip_patch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_node" ADD CONSTRAINT "trip_node_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_node" ADD CONSTRAINT "trip_node_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD CONSTRAINT "trip_patch_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD CONSTRAINT "trip_patch_parent_id_trip_patch_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trip_patch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_patch" ADD CONSTRAINT "trip_patch_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_event_id_world_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."world_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_node_id_trip_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."trip_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_event_id_world_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."world_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_patch_id_trip_patch_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."trip_patch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_watch" ADD CONSTRAINT "trip_watch_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "corridor_geom_idx" ON "corridor" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "place_geom_idx" ON "place" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "place_tier_category_idx" ON "place" USING btree ("tier","category");--> statement-breakpoint
CREATE INDEX "job_claimable_idx" ON "job" USING btree ("run_after") WHERE "job"."locked_at" is null and "job"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "checkpoint_log_trip_id_idx" ON "checkpoint_log" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_user_id_idx" ON "trip" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_window_idx" ON "trip" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "trip_node_trip_id_idx" ON "trip_node" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_node_starts_at_idx" ON "trip_node" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "trip_node_geom_idx" ON "trip_node" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "trip_patch_trip_id_idx" ON "trip_patch" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "event_match_event_node_idx" ON "event_match" USING btree ("event_id","node_id");--> statement-breakpoint
CREATE INDEX "event_match_trip_id_idx" ON "event_match" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "event_match_unjudged_idx" ON "event_match" USING btree ("judged_at");--> statement-breakpoint
CREATE INDEX "intervention_trip_id_idx" ON "intervention" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "intervention_event_id_idx" ON "intervention" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "intervention_outcome_idx" ON "intervention" USING btree ("outcome","sent_at");--> statement-breakpoint
CREATE INDEX "trip_watch_regions_idx" ON "trip_watch" USING gist ("regions");--> statement-breakpoint
CREATE INDEX "trip_watch_active_idx" ON "trip_watch" USING btree ("active_from","active_to");--> statement-breakpoint
CREATE INDEX "world_event_geom_idx" ON "world_event" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "world_event_validity_idx" ON "world_event" USING btree ("valid_from","valid_to");