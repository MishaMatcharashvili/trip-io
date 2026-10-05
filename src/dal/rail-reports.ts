import { sql } from "drizzle-orm";
import type { EventDraft } from "../domain/watch/event.ts";
import {
  RAIL_BUFFER_M,
  RAIL_SOURCE,
  routeLineWkt,
} from "../domain/watch/rail.ts";
import type { Queryable } from "./client.ts";

// The railway's events. There is no report table: only operators report, and
// the event carries the report in its payload — a rail report is a handful a
// week, and what happened to each one is the event's own validity window.

/**
 * Write the event on its line. The geometry is the route's polyline, built from
 * the stations in code and buffered here — no rail table, no geometry loaded
 * ahead of time. A later report of the same kind in the same window updates the
 * row rather than matching the same drive twice.
 */
export async function publishRailEvent(
  conn: Queryable,
  draft: EventDraft,
  key: { route: string; observedAt: string; dedupeKey: string },
): Promise<string | null> {
  const wkt = routeLineWkt(key.route);
  if (!wkt) return null;
  const rows = await conn.execute(sql`
    INSERT INTO world_event
      (source, kind, severity, confidence, geom, valid_from, valid_to,
       observed_at, dedupe_key, payload)
    VALUES (${draft.source}, ${draft.kind}, ${draft.severity}, ${draft.confidence},
            ST_Buffer(ST_GeogFromText(${wkt}), ${RAIL_BUFFER_M}),
            ${draft.validFrom}::timestamptz, ${draft.validTo}::timestamptz,
            ${key.observedAt}::timestamptz, ${key.dedupeKey},
            ${JSON.stringify(draft.payload)}::jsonb)
    ON CONFLICT (dedupe_key) DO UPDATE SET
      severity = EXCLUDED.severity,
      confidence = EXCLUDED.confidence,
      valid_from = EXCLUDED.valid_from,
      valid_to = EXCLUDED.valid_to,
      observed_at = EXCLUDED.observed_at,
      payload = EXCLUDED.payload
    RETURNING id
  `);
  return (rows.rows[0]?.id as string | undefined) ?? null;
}

/**
 * Close every rail event still open on a line, as of `at`. The newest report
 * about a line is the truth about it: "cancelled" on Monday and "running" on
 * Tuesday means it is no longer cancelled.
 */
export async function endRailEvents(
  conn: Queryable,
  route: string,
  at: string,
): Promise<number> {
  const rows = await conn.execute(sql`
    UPDATE world_event SET valid_to = ${at}::timestamptz
    WHERE source = ${RAIL_SOURCE}
      AND payload->>'route' = ${route}
      AND valid_from <= ${at}::timestamptz
      AND (valid_to IS NULL OR valid_to > ${at}::timestamptz)
    RETURNING id
  `);
  return rows.rows.length;
}
