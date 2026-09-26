import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { tstz } from "./columns.ts";
import { trip } from "./trip.ts";

export const watchPassKind = pgEnum("watch_pass_kind", ["free", "paid"]);

// What makes a trip watched rather than only planned. Planning is free; the
// watch is bought one trip at a time, and a traveller's first watched trip is
// free (context/progress-tracker.md, open question #4). One pass per trip.
//
// `provider` names who took the money: "flitt" once the checkout is wired,
// "demo" for the stand-in that records a pass without charging anyone.
export const watchPass = pgTable(
  "watch_pass",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: watchPassKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    createdAt: tstz("created_at"),
  },
  (t) => [index("watch_pass_user_idx").on(t.userId)],
);
