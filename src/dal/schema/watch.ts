import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { geography, id, tstz } from "./columns.ts";
import { trip, tripNode, tripPatch } from "./trip.ts";

export const deliveryChannel = pgEnum("delivery_channel", [
  "push",
  "email",
  "briefing",
]);
export const eventRoute = pgEnum("event_route", [
  "interrupt",
  "briefing",
  "drop",
]);
export const interventionOutcome = pgEnum("intervention_outcome", [
  "accepted",
  "dismissed",
  "ignored",
  "muted",
]);

export const worldEvent = pgTable(
  "world_event",
  {
    id: id(),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    confidence: real("confidence").notNull(),
    geom: geography()("geom").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    observedAt: tstz("observed_at"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    // Spatial half of the match query's event x node join.
    index("world_event_geom_idx").using("gist", t.geom),
    // Temporal half: only events whose validity window is still open.
    index("world_event_validity_idx").on(t.validFrom, t.validTo),
  ],
);

// One watch per trip; `trip_id` is the primary key rather than a synthetic id.
export const tripWatch = pgTable(
  "trip_watch",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trip.id, { onDelete: "cascade" }),
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull(),
    activeTo: timestamp("active_to", { withTimezone: true }).notNull(),
    regions: geography()("regions").notNull(),
    channels: deliveryChannel("channels").array().notNull(),
    quietHours: jsonb("quiet_hours").notNull(),
    cap: integer("cap").notNull(),
  },
  (t) => [
    index("trip_watch_regions_idx").using("gist", t.regions),
    index("trip_watch_active_idx").on(t.activeFrom, t.activeTo),
  ],
);

export const eventMatch = pgTable(
  "event_match",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => worldEvent.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => tripNode.id, { onDelete: "cascade" }),
    matchedAt: tstz("matched_at"),
    // Set when the pair is handed to the judge queue. Claiming it in one
    // UPDATE is what stops a matcher run five minutes later from paying for
    // the same model call twice.
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    verdict: jsonb("verdict"),
    score: real("score").notNull(),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    route: eventRoute("route"),
    // Why the router decided what it decided, `drop` included. A dropped
    // verdict nobody sees is how a silent ranker regression goes unnoticed for
    // a month, so the reason is a column and gets counted.
    routeReason: text("route_reason"),
    // Why a verdict was refused, when it was. Rejection-reason frequency is the
    // earliest signal that a prompt edit went wrong.
    rejections: jsonb("rejections"),
  },
  (t) => [
    // Unique, not just indexed: the matcher runs every five minutes and its
    // invocations can overlap, so idempotency belongs in the constraint rather
    // than in a NOT EXISTS that another transaction can race.
    uniqueIndex("event_match_event_node_idx").on(t.eventId, t.nodeId),
    index("event_match_trip_id_idx").on(t.tripId),
    // The judge queue drains rows that matched but haven't been judged yet;
    // partial, because judged rows are the ones that accumulate.
    index("event_match_unjudged_idx")
      .on(t.score)
      .where(sql`${t.judgedAt} is null`),
    // The sweep that finds pairs nothing ever picked up.
    index("event_match_unqueued_idx")
      .on(t.matchedAt)
      .where(sql`${t.queuedAt} is null`),
  ],
);

// `intervention.outcome` is the moat (context/architecture.md): an aggregate
// record per region/season/trip type that must outlive the ephemeral
// `world_event` rows it cites, so event deletion is restricted, not cascaded.
export const intervention = pgTable(
  "intervention",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => worldEvent.id, { onDelete: "restrict" }),
    channel: deliveryChannel("channel").notNull(),
    sentAt: tstz("sent_at"),
    patchId: uuid("patch_id").references(() => tripPatch.id, {
      onDelete: "set null",
    }),
    outcome: interventionOutcome("outcome"),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
  },
  (t) => [
    index("intervention_trip_id_idx").on(t.tripId),
    index("intervention_event_id_idx").on(t.eventId),
    // The hourly sweep marks un-actioned interventions `ignored`.
    index("intervention_outcome_idx").on(t.outcome, t.sentAt),
  ],
);

// The daily briefing, stored as what was actually said.
//
// It is a row rather than a render-on-read because it is a record, not a view:
// the email and the in-app page must show the same words, and
// `intervention.outcome` is only evidence of anything if what the traveller was
// shown is still recoverable months later. The document is the domain's
// `Briefing` (src/domain/watch/briefing.ts) exactly as it was composed.
export const briefing = pgTable(
  "briefing",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    // The Tbilisi calendar date the briefing covers — the trip's clock, not the
    // server's, and a date rather than an instant because "one per trip-day" is
    // the unit the cost model and the kill criteria both count in.
    day: date("day").notNull(),
    dayIndex: integer("day_index").notNull(),
    quiet: boolean("quiet").notNull(),
    document: jsonb("document").notNull(),
    composedAt: tstz("composed_at"),
    emailTo: text("email_to"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    // Kept, not thrown: a briefing that composed and failed to send is a
    // different problem from one that was never composed, and only this column
    // tells them apart the next morning.
    emailError: text("email_error"),
    // "Briefing opened per trip-day" is a kill criterion (>= 50% continue,
    // < 20% stop), so the open is a column from the first briefing sent rather
    // than instrumentation retrofitted in Phase 9.
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (t) => [
    // One per trip-day, enforced rather than assumed: the cron can be re-run by
    // hand, and a second briefing for the same morning would both double the
    // model bill and re-deliver items the traveller has already read.
    uniqueIndex("briefing_trip_day_idx").on(t.tripId, t.day),
    index("briefing_day_idx").on(t.day),
  ],
);
