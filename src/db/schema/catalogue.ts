import {
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
import { geography, id, tstz } from "./columns.ts";

export const placeTier = pgEnum("place_tier", ["curated", "verified", "raw"]);

export const place = pgTable(
  "place",
  {
    id: id(),
    name: text("name").notNull(),
    nameKa: text("name_ka"),
    category: text("category").notNull(),
    geom: geography("Point")("geom").notNull(),
    tier: placeTier("tier").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    openingHours: jsonb("opening_hours"),
    attrs: jsonb("attrs").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("place_geom_idx").using("gist", t.geom),
    // Candidate retrieval filters by tier (only `curated` is proposable) and category.
    index("place_tier_category_idx").on(t.tier, t.category),
    // Reloading a newer Overture release upserts on this. Hand-added places have
    // a null source_id, which a unique index never treats as a conflict.
    uniqueIndex("place_source_idx").on(t.source, t.sourceId),
  ],
);

export const corridor = pgTable(
  "corridor",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    geom: geography("LineString")("geom").notNull(),
    bufferM: integer("buffer_m").notNull(),
    seasonRisk: jsonb("season_risk").notNull(),
  },
  (t) => [index("corridor_geom_idx").using("gist", t.geom)],
);

export const regionKind = pgEnum("region_kind", ["municipality", "city"]);

// The sense loop's polling unit: detectors fetch once per region that has a live
// trip, never once per trip. Georgia's municipalities and self-governing cities
// (scripts/catalogue/regions.ts has what's excluded and why).
export const region = pgTable(
  "region",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    nameKa: text("name_ka").notNull(),
    kind: regionKind("kind").notNull(),
    // ISO 3166-2 code of the containing mkhare, e.g. GE-KA for Kakheti.
    isoRegion: text("iso_region").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    geom: geography("MultiPolygon")("geom").notNull(),
    // Where a single-point detector (weather) samples this region.
    pollPoint: geography("Point")("poll_point").notNull(),
  },
  (t) => [index("region_geom_idx").using("gist", t.geom)],
);

export const reviewDecision = pgEnum("review_decision", [
  "curate",
  "reject",
  "skip",
]);

// Append-only log of the hand-verification pass. The latest row per place is
// its queue state: `curate` also promotes the place to the curated tier,
// `reject` keeps it out of the queue for good, `skip` sends it to the back.
export const placeReview = pgTable(
  "place_review",
  {
    id: id(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    decision: reviewDecision("decision").notNull(),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: tstz("created_at"),
  },
  (t) => [index("place_review_place_idx").on(t.placeId, t.createdAt)],
);
