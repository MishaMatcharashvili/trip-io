import { sql } from "drizzle-orm";
import type { Offer } from "../domain/watch/interrupt.ts";
import { db, type Queryable } from "./client.ts";

// `intervention`: every time the system told a traveller something, and what
// they did about it. `outcome` is the product's only defensibility claim — a
// record of which world-changes actually moved someone's plan — so this file
// writes it and nothing else decides it.

export type ExistingPush = {
  id: string;
  sentAt: string | null;
  matchId: string | null;
};

/**
 * The push this trip already has for this event, reserved or sent. One event
 * is one interrupt; the partial unique index on `(trip_id, event_id)` is what
 * holds that, and this is how a delivery finds out before it tries.
 */
export async function pushFor(
  conn: Queryable,
  tripId: string,
  eventId: string,
): Promise<ExistingPush | null> {
  const rows = await conn.execute(sql`
    SELECT id, sent_at, offer->>'matchId' AS match_id FROM intervention
    WHERE trip_id = ${tripId} AND event_id = ${eventId} AND channel = 'push'
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
    matchId: (r.match_id as string | null) ?? null,
  };
}

/**
 * Spend a slot. The row exists, unsent, from here on — the ledger counts it —
 * and `sent_at` is stamped only once the push service has taken it.
 */
export async function reservePush(
  conn: Queryable,
  row: { tripId: string; eventId: string; offer: Offer; expiresAt: string },
): Promise<string> {
  const rows = await conn.execute(sql`
    INSERT INTO intervention (trip_id, event_id, channel, sent_at, offer, expires_at)
    VALUES (${row.tripId}, ${row.eventId}, 'push', NULL,
            ${JSON.stringify(row.offer)}::jsonb, ${row.expiresAt}::timestamptz)
    RETURNING id
  `);
  return rows.rows[0].id as string;
}

export async function markPushSent(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE intervention SET sent_at = now() WHERE id = ${id} AND sent_at IS NULL
  `);
}

/**
 * Give a slot back: a reservation that was never sent. Guarded on `sent_at`,
 * so a push that did go out can never be un-counted.
 */
export async function releasePush(
  id: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.execute(sql`
    DELETE FROM intervention WHERE id = ${id} AND sent_at IS NULL
  `);
}
