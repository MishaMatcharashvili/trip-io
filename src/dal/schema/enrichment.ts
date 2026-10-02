import {
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { place } from "./catalogue.ts";
import { tstz } from "./columns.ts";

export const externalStatus = pgEnum("external_status", ["matched", "none"]);

// Which place a third party knows a catalogue place as. This is the only thing
// kept about a provider: its caching policy allows an identifier to be stored
// "to improve the speed of your application" and forbids everything else, so
// ratings, reviews and photos are read live and never land here.
//
// `none` is an answer too — nothing matched — and is kept so a place that is
// not there is not searched for again on every visit. It is asked again after
// a while (src/bll/place-enrichment.ts), when the provider may have it.
export const placeExternal = pgTable(
  "place_external",
  {
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    status: externalStatus("status").notNull(),
    /** How alike the names were, 0 to 1, for a `matched` row. */
    confidence: real("confidence"),
    checkedAt: tstz("checked_at"),
  },
  // One answer per place per provider; a new one replaces the old.
  (t) => [primaryKey({ columns: [t.placeId, t.provider] })],
);
