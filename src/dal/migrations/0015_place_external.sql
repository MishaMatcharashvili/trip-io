CREATE TYPE "public"."external_status" AS ENUM('matched', 'none');--> statement-breakpoint
CREATE TABLE "place_external" (
	"place_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"status" "external_status" NOT NULL,
	"confidence" real,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_external_place_id_provider_pk" PRIMARY KEY("place_id","provider")
);
--> statement-breakpoint
ALTER TABLE "place_external" ADD CONSTRAINT "place_external_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;