import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Counters for spend limits, one row per limit and time window. Shared by every
// serverless instance because it lives in the database: a limit held in one
// instance's memory is a limit per instance. Rows past their window are dead
// weight and are pruned as new ones are written (src/dal/usage.ts).
export const usageWindow = pgTable(
  "usage_window",
  {
    // What is being limited: "routes:user:<id>", "routes:all".
    key: text("key").notNull(),
    // The start of the window this count belongs to.
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
