import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { corridor } from "./catalogue.ts";
import { id, tstz } from "./columns.ts";
import { worldEvent } from "./watch.ts";

export const roadCondition = pgEnum("road_condition", [
  "closed",
  "restricted",
  "delays",
  "hazard",
  "reopened",
]);

export const roadReportStatus = pgEnum("road_report_status", [
  "pending",
  "published",
  "rejected",
  // Approved after the window it described had already closed.
  "expired",
]);

// Detector #2: a road report, as submitted through the Telegram form.
//
// Kept whatever became of it, rejected ones included. docs/concept.md's
// argument for being the detector before building one is that every manual
// report with its outcome is labelled data, and Phase 8's road-automation spike
// is judged against exactly this table — a report deleted on rejection would be
// a label thrown away.
//
// Anyone may report; only an operator's report is published without review
// (context/progress-tracker.md, open question 3). The rest wait here as
// `pending` until an operator approves or rejects them from Telegram.
export const roadReport = pgTable(
  "road_report",
  {
    id: id(),
    corridorId: uuid("corridor_id")
      .notNull()
      .references(() => corridor.id, { onDelete: "restrict" }),
    condition: roadCondition("condition").notNull(),
    // One of the domain's hazards (src/domain/watch/road.ts), when given.
    hazard: text("hazard"),
    // The window the reporter expects, fixed at submission: a two-hour closure
    // approved four hours later is history, not news.
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
    reportedAt: tstz("reported_at"),
    // Telegram's numeric user id, as text: it outgrows 32 bits.
    reporterId: text("reporter_id").notNull(),
    reporterName: text("reporter_name").notNull(),
    // Where to tell the reporter what happened to their report.
    chatId: text("chat_id").notNull(),
    status: roadReportStatus("status").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // The event it became. Set null if the event is ever purged; the report
    // outlives it as a label.
    eventId: uuid("event_id").references(() => worldEvent.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("road_report_status_idx").on(t.status, t.reportedAt),
    // The per-reporter cap on reports waiting for review.
    index("road_report_reporter_idx").on(t.reporterId, t.status),
  ],
);
