import { sql } from "drizzle-orm";
import type { EventDraft } from "../domain/watch/event.ts";
import type { HoursTrust } from "../domain/watch/hours.ts";
import type { Queryable } from "./client.ts";

// `hours_report` and the closure events it publishes. The rule for when a
// report becomes an event is the domain's (src/domain/watch/hours.ts).

export type PlaceRef = { id: string; name: string };

/** Null when there is no such place. */
export async function findPlace(
  conn: Queryable,
  placeId: string,
): Promise<PlaceRef | null> {
  const rows = await conn.execute(
    sql`SELECT id, name FROM place WHERE id = ${placeId}`,
  );
  const r = rows.rows[0];
  return r ? { id: r.id as string, name: r.name as string } : null;
}

/** False when this person has already said so for this place and day. */
export async function recordHoursReport(
  conn: Queryable,
  row: {
    placeId: string;
    day: string;
    reporterId: string;
    trust: HoursTrust;
    reportedAt: string;
  },
): Promise<boolean> {
  const rows = await conn.execute(sql`
    INSERT INTO hours_report (place_id, day, reporter_id, trust, reported_at)
    VALUES (${row.placeId}, ${row.day}::date, ${row.reporterId},
            ${row.trust}::hours_trust, ${row.reportedAt}::timestamptz)
    ON CONFLICT (place_id, day, reporter_id) DO NOTHING
    RETURNING id
  `);
  return rows.rows.length > 0;
}

/** How many different people have said this place is shut that day. */
export async function distinctReporters(
  conn: Queryable,
  placeId: string,
  day: string,
): Promise<number> {
  const rows = await conn.execute(sql`
    SELECT count(DISTINCT reporter_id)::int AS n FROM hours_report
    WHERE place_id = ${placeId} AND day = ${day}::date
  `);
  return (rows.rows[0]?.n as number | undefined) ?? 0;
}

/**
 * Write the closure, at the place itself. Unlike weather, whose event covers a
 * whole municipality, a closure is about one door: the geometry is the place's
 * point, and the 150 m the matcher adds (`radiusFor("hours.closed")`) is only
 * the entrance round the corner. A later report for the same place and day
 * updates the row rather than matching the same stop twice.
 */
export async function publishHoursEvent(
  conn: Queryable,
  draft: EventDraft,
  key: { placeId: string; observedAt: string; dedupeKey: string },
): Promise<string | null> {
  const rows = await conn.execute(sql`
    INSERT INTO world_event
      (source, kind, severity, confidence, geom, valid_from, valid_to,
       observed_at, dedupe_key, payload)
    SELECT ${draft.source}, ${draft.kind}, ${draft.severity}, ${draft.confidence},
           p.geom, ${draft.validFrom}::timestamptz, ${draft.validTo}::timestamptz,
           ${key.observedAt}::timestamptz, ${key.dedupeKey},
           ${JSON.stringify(draft.payload)}::jsonb
    FROM place p WHERE p.id = ${key.placeId}
    ON CONFLICT (dedupe_key) DO UPDATE SET
      severity = EXCLUDED.severity,
      confidence = EXCLUDED.confidence,
      observed_at = EXCLUDED.observed_at,
      payload = EXCLUDED.payload
    RETURNING id
  `);
  return (rows.rows[0]?.id as string | undefined) ?? null;
}

/** Point every report of the day at the event they became. */
export async function attachEvent(
  conn: Queryable,
  placeId: string,
  day: string,
  eventId: string,
): Promise<void> {
  await conn.execute(sql`
    UPDATE hours_report SET event_id = ${eventId}
    WHERE place_id = ${placeId} AND day = ${day}::date
  `);
}
