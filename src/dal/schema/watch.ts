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
    // The first time push was switched off while the watch was awake.
    // "Notifications disabled during trip" is a kill criterion (continue below
    // 10%, stop above 25%), and in a proactive product a mute is not a dip —
    // it is usually permanent, which makes it the most informative thing a
    // traveller can do. First one wins: turning push back on does not unsay it.
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    // Detector families the traveller turned off for this trip ("weather",
    // "road"). The matcher skips their events, so nothing is judged or sent.
    mutedSources: text("muted_sources")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // How much to tell: "affecting" (only what changes the plan, the default)
    // or "nearby" (findings that need no decision as well).
    verbosity: text("verbosity").notNull().default("affecting"),
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
    // Set when a briefing has written about this pair. The last of the four
    // stamps a match collects on its way through the pipeline — matched,
    // queued, judged, delivered — and the one that stops the same rain over
    // the same stop being reported again tomorrow.
    //
    // It belongs here and not on `intervention` because the two count
    // different things: one event can match two stops on the same day, which
    // is two pairs to write about but one delivery, and folding them would
    // either lose a stop or double-count the outcome that the kill criteria
    // read.
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
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
    // What the briefing gathers each morning: this trip's judged, undelivered
    // pairs. Partial, because delivered rows are the ones that accumulate.
    index("event_match_undelivered_idx")
      .on(t.tripId)
      .where(sql`${t.deliveredAt} is null`),
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
    // Null while a push is reserved and not yet sent. The interrupt budget is
    // spent by the reservation, under a lock on the watch, so two deliveries
    // racing for the last slot cannot both win it; the stamp says it arrived.
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
    patchId: uuid("patch_id").references(() => tripPatch.id, {
      onDelete: "set null",
    }),
    outcome: interventionOutcome("outcome"),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    // What the traveller was offered, as it was offered: the sentence, the
    // evidence and the moves (src/domain/watch/interrupt.ts, `Offer`). A
    // snapshot rather than a pointer, because the match it came from cascades
    // away with its stop — and accepting a proposal that drops the stop is
    // exactly what deletes it. An outcome is only evidence of anything if what
    // it was an answer to is still recoverable.
    offer: jsonb("offer"),
    // When un-actioned becomes `ignored`: the end of the verdict's horizon for
    // a push, the start of the stop for a briefing item. The hourly sweep reads
    // it, and without that sweep the acceptance denominator is wrong.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("intervention_trip_id_idx").on(t.tripId),
    index("intervention_event_id_idx").on(t.eventId),
    // The hourly sweep marks un-actioned interventions `ignored`.
    index("intervention_outcome_idx").on(t.outcome, t.sentAt),
    // One interrupt per event per trip, ever. The same rain over two stops is
    // one thing to be woken for, and a constraint is what settles two judge
    // jobs for those two stops finishing in the same drain.
    uniqueIndex("intervention_push_event_idx")
      .on(t.tripId, t.eventId)
      .where(sql`${t.channel} = 'push'`),
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
