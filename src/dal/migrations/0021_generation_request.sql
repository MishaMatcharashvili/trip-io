CREATE TABLE "generation_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_request" ADD CONSTRAINT "generation_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_request" ADD CONSTRAINT "generation_request_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_request_created_idx" ON "generation_request" USING btree ("created_at");