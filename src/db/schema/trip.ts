import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { place } from "./catalogue";
import { geography, id, tstz } from "./columns";

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
    author: patchAuthor("author").notNull(),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    clientSeq: integer("client_seq").notNull(),
  },
  (t) => [index("trip_patch_trip_id_idx").on(t.tripId)],
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
  (t) => [index("checkpoint_log_trip_id_idx").on(t.tripId)],
);
