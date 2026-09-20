import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { id, tstz } from "./columns.ts";

export const job = pgTable(
  "job",
  {
    id: id(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    runAfter: tstz("run_after"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    // The drain handler runs every minute and claims only unlocked, incomplete
    // jobs; a partial index keeps that scan off the completed-job backlog.
    index("job_claimable_idx")
      .on(t.runAfter)
      .where(sql`${t.lockedAt} is null and ${t.completedAt} is null`),
  ],
);
