import { sql } from "drizzle-orm";
import type { LonLat } from "../domain/geo.ts";
import type {
  EventDraft,
  Severity,
  WorldEvent,
} from "../domain/watch/event.ts";
import { db } from "./client.ts";

// `world_event` and the regions worth sensing.
//
// The inversion the whole cost model rests on lives in `regionsToSense`: poll
// each source once per region that contains a live trip, never once per trip.
// Eighty people in Kazbegi are one forecast, not eighty.

export type SenseRegion = {
  id: string;
  slug: string;
  name: string;
  /** Where to ask about the region's weather (`region.poll_point`). */
  pollPoint: LonLat;
  /** How many trips are why we're asking. Logged, and a cost signal. */
  trips: number;
};

/**
 * Regions with at least one trip node inside the forecast horizon. A ten-day
 * trip's last day is not worth a forecast today, so the filter is on nodes
 * rather than on the trip window: it is the node that gets matched.
 *
 * Nodes are matched to regions by containment. Georgia's 64 municipalities
 * tile the country, so a node inside it is inside exactly one — and a node that
 * lands just outside a boundary is still caught downstream, where the match
 * query adds `radiusFor(kind)` to the event's geometry.
 */
export async function regionsToSense(
  horizonHours: number,
): Promise<SenseRegion[]> {
  const horizon = `${horizonHours} hours`;
  const rows = await db.execute(sql`
    SELECT r.id, r.slug, r.name,
           ST_X(r.poll_point::geometry) AS lon,
           ST_Y(r.poll_point::geometry) AS lat,
           count(DISTINCT n.trip_id)::int AS trips
    FROM region r
    JOIN trip_node n ON ST_Intersects(r.geom, n.geom)
    JOIN trip_watch w ON w.trip_id = n.trip_id
    WHERE n.starts_at >= now() - interval '1 hour'
      AND n.starts_at < now() + ${horizon}::interval
      AND tstzrange(w.active_from, w.active_to)
          && tstzrange(now(), now() + ${horizon}::interval)
    GROUP BY r.id, r.slug, r.name, r.poll_point
    ORDER BY trips DESC, r.slug
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    pollPoint: [Number(r.lon), Number(r.lat)] as LonLat,
    trips: r.trips as number,
  }));
}

export type UpsertedEvent = {
  id: string;
  /** False when an earlier forecast had already written this event. */
  inserted: boolean;
  /** What the row said before, so the caller can notice an escalation. */
  previousSeverity: Severity | null;
};

/**
 * Write one detected event, keyed on its dedupe key. An hourly sense loop
 * re-forecasts the same weather every time it runs; without the key, the same
 * rain would be matched against the same node once an hour for two days.
 *
 * The geometry is the region's own polygon, simplified to about a kilometre —
 * weather is not an administrative fact, and a boundary drawn to the metre
 * would be a false precision that costs storage on every row.
 */
export async function upsertEvent(
  draft: EventDraft,
  event: Pick<WorldEvent, "regionSlug" | "observedAt" | "dedupeKey">,
): Promise<UpsertedEvent | null> {
  const rows = await db.execute(sql`
    WITH previous AS (
      SELECT severity FROM world_event WHERE dedupe_key = ${event.dedupeKey}
    )
    INSERT INTO world_event
      (source, kind, severity, confidence, geom, valid_from, valid_to,
       observed_at, dedupe_key, payload)
    SELECT ${draft.source}, ${draft.kind}, ${draft.severity}, ${draft.confidence},
           ST_SimplifyPreserveTopology(r.geom::geometry, 0.01)::geography,
           ${draft.validFrom}::timestamptz, ${draft.validTo}::timestamptz,
           ${event.observedAt}::timestamptz, ${event.dedupeKey},
           ${JSON.stringify(draft.payload)}::jsonb
    FROM region r WHERE r.slug = ${event.regionSlug}
    ON CONFLICT (dedupe_key) DO UPDATE SET
      severity = EXCLUDED.severity,
      confidence = EXCLUDED.confidence,
      valid_from = EXCLUDED.valid_from,
      valid_to = EXCLUDED.valid_to,
      observed_at = EXCLUDED.observed_at,
      payload = EXCLUDED.payload
    RETURNING id, (xmax = 0) AS inserted,
              (SELECT severity FROM previous) AS previous_severity
  `);
  const row = rows.rows[0];
  // No row means no such region slug: a detector was asked about somewhere the
  // catalogue does not know, which is a bug in the caller, not a quiet no-op.
  if (!row) return null;
  return {
    id: row.id as string,
    inserted: row.inserted as boolean,
    previousSeverity: (row.previous_severity as Severity | null) ?? null,
  };
}

/**
 * Let an escalated event be judged again. The dedupe key deliberately collapses
 * a re-forecast onto one row, which means a spell that turns from `minor` into
 * `severe` would otherwise keep the verdict formed when it was drizzle.
 */
export async function reopenMatches(eventId: string): Promise<number> {
  const rows = await db.execute(sql`
    UPDATE event_match
    SET judged_at = NULL, verdict = NULL, route = NULL, route_reason = NULL,
        rejections = NULL
    WHERE event_id = ${eventId} AND judged_at IS NOT NULL
    RETURNING id
  `);
  return rows.rows.length;
}

export type StoredEvent = {
  id: string;
  source: string;
  kind: string;
  severity: Severity;
  confidence: number;
  validFrom: string;
  validTo: string | null;
  observedAt: string;
  payload: Record<string, unknown>;
};

const toStored = (r: Record<string, unknown>): StoredEvent => ({
  id: r.id as string,
  source: r.source as string,
  kind: r.kind as string,
  severity: r.severity as Severity,
  confidence: Number(r.confidence),
  validFrom: new Date(r.valid_from as string).toISOString(),
  validTo: r.valid_to ? new Date(r.valid_to as string).toISOString() : null,
  observedAt: new Date(r.observed_at as string).toISOString(),
  payload: (r.payload ?? {}) as Record<string, unknown>,
});

export async function loadEvent(id: string): Promise<StoredEvent | null> {
  const rows = await db.execute(sql`
    SELECT id, source, kind, severity, confidence, valid_from, valid_to,
           observed_at, payload
    FROM world_event WHERE id = ${id}
  `);
  return rows.rows[0] ? toStored(rows.rows[0]) : null;
}

/**
 * Forget weather nobody is going to ask about again. Events an intervention
 * cites are kept whatever their age — `intervention.outcome` is the one table
 * that has to outlive the world it describes, and its foreign key restricts
 * rather than cascades, so this would fail rather than corrupt it.
 */
export async function purgeExpiredEvents(
  olderThanDays: number,
): Promise<number> {
  const rows = await db.execute(sql`
    DELETE FROM world_event e
    WHERE COALESCE(e.valid_to, e.valid_from) < now() - ${`${olderThanDays} days`}::interval
      AND NOT EXISTS (SELECT 1 FROM intervention i WHERE i.event_id = e.id)
    RETURNING e.id
  `);
  return rows.rows.length;
}
