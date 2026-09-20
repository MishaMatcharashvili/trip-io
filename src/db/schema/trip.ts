import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { place } from "./catalogue.ts";
import { geography, id, tstz } from "./columns.ts";

export const patchAuthor = pgEnum("patch_author", [
  "user",
  "system",
  "intervention",
]);

export const trip = pgTable(
  "trip",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    party: jsonb("party").notNull(),
    pace: text("pace").notNull(),
    budget: text("budget").notNull(),
    prefs: jsonb("prefs").notNull(),
    headPatchId: uuid("head_patch_id").references(
      (): AnyPgColumn => tripPatch.id,
      { onDelete: "set null" },
    ),
    createdAt: tstz("created_at"),
  },
  (t) => [
    index("trip_user_id_idx").on(t.userId),
    // The sense loop scans for trips live in a given window.
    index("trip_window_idx").on(t.startsAt, t.endsAt),
  ],
);

export const tripNode = pgTable(
  "trip_node",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    placeId: uuid("place_id").references(() => place.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull(),
    indoor: boolean("indoor").notNull(),
    geom: geography("Point")("geom").notNull(),
    meta: jsonb("meta").notNull(),
  },
  (t) => [
    index("trip_node_trip_id_idx").on(t.tripId),
    index("trip_node_starts_at_idx").on(t.startsAt),
    // Spatial half of the match query's event x node join.
    index("trip_node_geom_idx").using("gist", t.geom),
  ],
);

export const tripPatch = pgTable(
  "trip_patch",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => tripPatch.id, {
      onDelete: "set null",
    }),
    intent: text("intent").notNull(),
    ops: jsonb("ops").notNull(),
    // What undoes this patch, computed when it was applied (src/core/trip/patch.ts).
    inverseOps: jsonb("inverse_ops").notNull(),
    author: patchAuthor("author").notNull(),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    appliedAt: tstz("applied_at"),
    // Server-assigned, 1 upwards per trip: patch order and the checkpoint cadence.
    seq: integer("seq").notNull(),
    // Client-supplied idempotency key for a user's own edits; null for
    // system and intervention patches.
    clientSeq: integer("client_seq"),
    // Generation id, source, warnings accepted at write time.
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [
    index("trip_patch_trip_id_idx").on(t.tripId),
    uniqueIndex("trip_patch_seq_idx").on(t.tripId, t.seq),
    // A retried request must not apply the same edit twice.
    uniqueIndex("trip_patch_client_seq_idx")
      .on(t.tripId, t.clientSeq)
      .where(sql`${t.clientSeq} is not null`),
    // The hard invariant: nothing the system proposes is ever auto-applied
    // (context/architecture.md). Enforced here as well as in the store.
    check(
      "trip_patch_intervention_accepted",
      sql`${t.author} <> 'intervention' OR ${t.acceptedBy} IS NOT NULL`,
    ),
  ],
);

export const checkpointLog = pgTable(
  "checkpoint_log",
  {
    id: id(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    patchId: uuid("patch_id")
      .notNull()
      .references(() => tripPatch.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: tstz("created_at"),
  },
  (t) => [
    index("checkpoint_log_trip_id_idx").on(t.tripId),
    uniqueIndex("checkpoint_log_patch_idx").on(t.tripId, t.patchId),
  ],
);
