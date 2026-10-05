import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { place } from "./catalogue.ts";
import { id, tstz } from "./columns.ts";
import { worldEvent } from "./watch.ts";

export const hoursTrust = pgEnum("hours_trust", ["curator", "community"]);

// Detector #5: someone at a shut door. One row per person per place per day —
// saying it twice is the same report — and the count of distinct people is the
// quorum (src/domain/watch/hours.ts). Kept after the day has passed: a report
// with its outcome is a label, the same argument as `road_report`.
export const hoursReport = pgTable(
  "hours_report",
  {
    id: id(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    // The Tbilisi day the place is shut.
    day: date("day", { mode: "string" }).notNull(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    trust: hoursTrust("trust").notNull(),
    reportedAt: tstz("reported_at"),
    // The event it became, once there is one. Null while it waits for a second
    // voice, and set null if the event is ever purged.
    eventId: uuid("event_id").references(() => worldEvent.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("hours_report_once_uq").on(t.placeId, t.day, t.reporterId),
    index("hours_report_place_day_idx").on(t.placeId, t.day),
  ],
);
