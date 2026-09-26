CREATE TYPE "public"."watch_pass_kind" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TABLE "watch_pass" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "watch_pass_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"provider" text,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_pass" ADD CONSTRAINT "watch_pass_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_pass" ADD CONSTRAINT "watch_pass_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_pass_user_idx" ON "watch_pass" USING btree ("user_id");