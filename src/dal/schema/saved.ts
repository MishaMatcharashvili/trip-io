import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { place } from "./catalogue.ts";
import { tstz } from "./columns.ts";

// Places a traveller kept for later, from Explore or a trip. One row per
// person per place: saving twice is the same answer.
export const savedPlace = pgTable(
  "saved_place",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    savedAt: tstz("saved_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.placeId] }),
    index("saved_place_user_idx").on(t.userId, t.savedAt),
  ],
);
