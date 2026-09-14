import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { geography, id } from "./columns";

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
  ],
);

export const corridor = pgTable(
  "corridor",
  {
    id: id(),
    name: text("name").notNull(),
    geom: geography("LineString")("geom").notNull(),
    bufferM: integer("buffer_m").notNull(),
    seasonRisk: jsonb("season_risk").notNull(),
  },
  (t) => [index("corridor_geom_idx").using("gist", t.geom)],
);
