import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { id, tstz } from "./columns.ts";
import { trip } from "./trip.ts";

// Trip generation's two side tables (context/phase-2-design.md §4).

// The warm-start cache, keyed by the coarse constraint hash. The stored plan has
// no clock times: a hit is re-timed for the requested dates and re-validated,
// because weekday opening hours and sunset move with the date.
export const planCache = pgTable("plan_cache", {
  key: text("key").primaryKey(),
  plan: jsonb("plan").notNull(),
  // Invalidates every entry when the prompt or the plan schema changes.
  promptVersion: integer("prompt_version").notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: tstz("created_at"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// One row per generation, whatever the outcome. The rejection-reason mix — how
// often the model invents a place, what the validator throws out — is a Phase 9
// dashboard input, and this is the only place it is recorded.
export const tripGeneration = pgTable(
  "trip_generation",
  {
    id: id(),
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "set null" }),
    cacheKey: text("cache_key").notNull(),
    // cache | model | retry | template | failed
    source: text("source").notNull(),
    // Per attempt: invented refs, problems, model, tokens, latency.
    attempts: jsonb("attempts").notNull(),
    createdAt: tstz("created_at"),
  },
  (t) => [index("trip_generation_created_idx").on(t.createdAt)],
);

// One row per "Build this trip". The browser mints the id, so a reload, a
// second tab or the back button asks for the same build rather than another:
// the first claim runs it, and everyone after is told where it stands.
export const generationRequest = pgTable(
  "generation_request",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "set null" }),
    // pending | done | cancelled
    status: text("status").notNull().default("pending"),
    createdAt: tstz("created_at"),
  },
  (t) => [index("generation_request_created_idx").on(t.createdAt)],
);
