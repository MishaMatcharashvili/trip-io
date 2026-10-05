import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, tstz } from "./columns.ts";
import { trip } from "./trip.ts";
import { eventMatch } from "./watch.ts";

// The three records the Phase 9 dashboard needs and nothing else wrote
// (context/phase-9-design.md): what the model cost, what a person made of a
// verdict, and what a traveller said when asked at the end.

// One row per model call, failures included — a failed call is still spend.
// Tokens, not dollars: prices change and are not ours, so the dollar figure is
// computed at read time (src/domain/watch/kill-criteria.ts). Both references
// are set null, not cascaded: spend outlives the trip it was for.
export const modelCall = pgTable(
  "model_call",
  {
    id: id(),
    createdAt: tstz("created_at"),
    // One of MODEL_PURPOSES, checked at write.
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => eventMatch.id, {
      onDelete: "set null",
    }),
    inputTokens: integer("input_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    // Already inside `output_tokens`; kept to see how much the model thought.
    reasoningTokens: integer("reasoning_tokens").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
  },
  (t) => [
    index("model_call_created_idx").on(t.createdAt),
    index("model_call_purpose_idx").on(t.purpose, t.createdAt),
  ],
);

// A person's judgement of one verdict the router would have sent. It stores
// what was judged, not a pointer to it: `event_match` cascades away with its
// trip, and an audit that vanished with the trip would move the false-positive
// rate without anyone having touched a verdict. `match_id` is therefore a plain
// column, unique so a verdict is audited once.
export const verdictAudit = pgTable(
  "verdict_audit",
  {
    id: id(),
    matchId: uuid("match_id").unique(),
    // `weather`, `safety`, ...: the unit graduation is decided in.
    family: text("family").notNull(),
    // Whether the trip was a cohort trip when it was audited (an owner who is
    // not an operator, holding a pass). The kill row counts these and the
    // graduation evidence counts all of them; stored because the trip, and
    // with it the means of working it out later, can be deleted.
    inCohort: boolean("in_cohort").notNull(),
    kind: text("kind").notNull(),
    route: text("route").notNull(),
    verdict: jsonb("verdict").notNull(),
    evidence: jsonb("evidence").notNull(),
    correct: boolean("correct").notNull(),
    // Why it was wrong, from a closed list in the domain; null when it was right.
    reason: text("reason"),
    note: text("note"),
    auditor: text("auditor").notNull(),
    auditedAt: tstz("audited_at"),
  },
  (t) => [index("verdict_audit_family_idx").on(t.family, t.auditedAt)],
);

// The one question asked after a trip ends: would you pay $5 to have it
// watched. One answer per trip, and it goes with the trip.
export const tripSurvey = pgTable("trip_survey", {
  tripId: uuid("trip_id")
    .primaryKey()
    .references(() => trip.id, { onDelete: "cascade" }),
  wouldPay: boolean("would_pay").notNull(),
  note: text("note"),
  answeredAt: timestamp("answered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
