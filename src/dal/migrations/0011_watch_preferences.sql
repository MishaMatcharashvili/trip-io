ALTER TABLE "trip_watch" ADD COLUMN "muted_sources" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_watch" ADD COLUMN "verbosity" text DEFAULT 'affecting' NOT NULL;