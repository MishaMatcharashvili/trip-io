CREATE TABLE "usage_window" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_window_key_window_start_pk" PRIMARY KEY("key","window_start")
);
