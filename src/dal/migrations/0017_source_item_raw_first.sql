ALTER TABLE "source_item" ALTER COLUMN "original_text" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_item" ALTER COLUMN "text" DROP NOT NULL;