import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { id, tstz } from "./columns.ts";

export const devicePlatform = pgEnum("device_platform", ["ios", "android"]);

// Where an interrupt can reach someone. A row per push token, registered by the
// native shell (Phase 7) through `POST /api/devices`.
//
// Tokens belong to users, not trips: a traveller has one phone and several
// trips, and whether a given trip may interrupt is the watch's `channels`, not
// something a device knows about.
export const device = pgTable(
  "device",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Unique across users: a phone handed to someone else re-registers the same
    // token, and it must then stop receiving the first owner's interrupts.
    token: text("token").notNull().unique(),
    platform: devicePlatform("platform").notNull(),
    createdAt: tstz("created_at"),
    lastSeenAt: tstz("last_seen_at"),
    // Set when the push service says the token is dead (the app was deleted)
    // or the traveller signs the device out. Kept rather than deleted, so a
    // delivery that went nowhere can still be explained afterwards.
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledReason: text("disabled_reason"),
  },
  (t) => [index("device_user_id_idx").on(t.userId)],
);
