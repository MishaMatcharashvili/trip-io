import { index, integer, pgTable, real, text } from "drizzle-orm/pg-core";
import { geography, tstz } from "./columns.ts";

// Tripadvisor's own lists for a destination — its ranked restaurants and things
// to do, with each one's rating, review count and "#N of M" — as last read
// (src/bll/tripadvisor-listings.ts, docs/tripadvisor-lists.md). Not catalogue
// places: trip generation matches them to places by name and position, as it
// does Google's (src/bll/ratings.ts).
export const tripadvisorListing = pgTable(
  "tripadvisor_listing",
  {
    /** Tripadvisor's location id: the same id Terra knows the place by. */
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    /** The destination whose list it was read from (destinations.ts slug). */
    city: text("city").notNull(),
    name: text("name").notNull(),
    geom: geography("Point")("geom").notNull(),
    rating: real("rating"),
    reviewCount: integer("review_count").notNull(),
    rank: integer("rank"),
    rankOf: integer("rank_of"),
    url: text("url"),
    fetchedAt: tstz("fetched_at"),
  },
  (t) => [
    index("tripadvisor_listing_geom_idx").using("gist", t.geom),
    index("tripadvisor_listing_city_idx").on(t.city, t.kind),
  ],
);
