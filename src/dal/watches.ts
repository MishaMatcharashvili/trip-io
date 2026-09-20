import { sql } from "drizzle-orm";
import type { QuietHours, WatchSettings } from "../domain/watch/route.ts";
import { db, type Queryable } from "./client.ts";

// `trip_watch`: which trips the sense loop is awake for, and on what terms.
//
// The footprint is derived from the node projection rather than supplied, so a
// trip cannot be watched in a place it no longer goes. That is also why the
// write belongs in the same transaction as the patch — see src/bll/trip-document.ts.

/** Slop around the trip's footprint: weather a valley away still reaches it. */
const FOOTPRINT_BUFFER_M = 15_000;

export type WatchDefaults = {
  channels: readonly string[];
  quietHours: QuietHours;
  cap: number;
};

/**
 * Write, or rewrite, the watch for a trip from the nodes it currently has.
 * Settings the traveller has already chosen are kept — this runs on every
 * patch, and it must not quietly restore defaults someone turned off.
 *
 * A trip with no nodes gets no watch: there is nothing to sense for, and a
 * watch with an empty footprint would poll every region in the country.
 */
export async function refreshWatch(
  tripId: string,
  defaults: WatchDefaults,
  conn: Queryable = db,
): Promise<boolean> {
  const rows = await conn.execute(sql`
    INSERT INTO trip_watch
      (trip_id, active_from, active_to, regions, channels, quiet_hours, cap)
    SELECT t.id,
           -- The window the watch is awake for: the trip itself, opened a day
           -- early so tomorrow's weather is sensed before the traveller arrives.
           t.starts_at - interval '1 day',
           t.ends_at,
           ST_Buffer(
             ST_ConvexHull(ST_Collect(n.geom::geometry))::geography,
             ${FOOTPRINT_BUFFER_M}
           ),
           ARRAY[${sql.join(
             defaults.channels.map((c) => sql`${c}`),
             sql`, `,
           )}]::delivery_channel[],
           ${JSON.stringify(defaults.quietHours)}::jsonb,
           ${defaults.cap}
    FROM trip t JOIN trip_node n ON n.trip_id = t.id
    WHERE t.id = ${tripId}
    GROUP BY t.id, t.starts_at, t.ends_at
    ON CONFLICT (trip_id) DO UPDATE SET
      active_from = EXCLUDED.active_from,
      active_to = EXCLUDED.active_to,
      regions = EXCLUDED.regions
    RETURNING trip_id
  `);
  return rows.rows.length > 0;
}

export async function dropWatch(tripId: string): Promise<void> {
  await db.execute(sql`DELETE FROM trip_watch WHERE trip_id = ${tripId}`);
}

export type Watch = WatchSettings & {
  tripId: string;
  cap: number;
  activeFrom: string;
  activeTo: string;
};

const toWatch = (r: Record<string, unknown>): Watch => ({
  tripId: r.trip_id as string,
  channels: r.channels as string[],
  quietHours: (r.quiet_hours ?? null) as QuietHours | null,
  cap: r.cap as number,
  activeFrom: new Date(r.active_from as string).toISOString(),
  activeTo: new Date(r.active_to as string).toISOString(),
});

export async function loadWatch(tripId: string): Promise<Watch | null> {
  const rows = await db.execute(sql`
    SELECT trip_id, channels, quiet_hours, cap, active_from, active_to
    FROM trip_watch WHERE trip_id = ${tripId}
  `);
  return rows.rows[0] ? toWatch(rows.rows[0]) : null;
}

/**
 * How much of this trip's interrupt budget is already spent. Only delivered
 * pushes count: a verdict routed to the briefing costs the traveller nothing,
 * which is the entire reason the second channel exists.
 */
export async function spentBudget(tripId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS sent FROM intervention
    WHERE trip_id = ${tripId} AND channel = 'push' AND sent_at IS NOT NULL
  `);
  return (rows.rows[0]?.sent as number) ?? 0;
}
