import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { id, tstz } from "./columns.ts";

export const sourceItemStatus = pgEnum("source_item_status", [
  // Fetched and stored; the extractor has not read it yet.
  "new",
  // The extractor read it and found nothing worth an event.
  "empty",
  // The extractor found something and a guard refused it. `reason` says which.
  "rejected",
  // At least one event came out of it.
  "published",
]);

// An article or page a news or events detector read: detectors 3 and 4, and the
// road-automation spike, which is judged against what these rows say.
//
// One row per distinct text. The hash is the sense loop's idempotency: a page
// that has not changed since the last poll is the same row, and the same row is
// never sent to the model twice, which is the whole cost model for extraction
// (O(changed pages), flat as trips grow). Kept whatever became of it,
// rejections included, for the same reason `road_report` is: a rejected
// extraction is a label.
export const sourceItem = pgTable(
  "source_item",
  {
    id: id(),
    // The feed or site, by the name `data/` calls it. Not a provider name.
    source: text("source").notNull(),
    url: text("url").notNull(),
    // SHA-256 of the English text the extractor reads.
    contentHash: text("content_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: tstz("fetched_at"),
    // The language it arrived in ("ka", "en"), as the translator reported it.
    language: text("language").notNull(),
    // What was fetched, kept only when it was not English: the quote guard is
    // checked against the English, but a person auditing a claim reads this.
    originalText: text("original_text"),
    // English, translated if it had to be. What the extractor was shown.
    text: text("text").notNull(),
    status: sourceItemStatus("status").notNull().default("new"),
    // Why it was rejected or empty; a domain rejection reason.
    reason: text("reason"),
    // The extractor's answer, as it gave it.
    extraction: jsonb("extraction"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
  },
  (t) => [
    unique("source_item_version_uq").on(t.source, t.url, t.contentHash),
    // The extractor's queue: what is new, oldest first.
    index("source_item_status_idx").on(t.status, t.fetchedAt),
  ],
);
