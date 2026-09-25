import { sql } from "drizzle-orm";
import type { EventDraft } from "../domain/watch/event.ts";
import {
  ROAD_SOURCE,
  type RoadCondition,
  type RoadHazard,
} from "../domain/watch/road.ts";
import { db, type Queryable } from "./client.ts";

// `road_report` and the road events it publishes. Policy — who is trusted,
// what a report becomes, when it has expired — is the domain's
// (src/domain/watch/road.ts); the order it happens in is the use case's.

export type ReportStatus = "pending" | "published" | "rejected" | "expired";

export type StoredReport = {
  id: string;
  corridorSlug: string;
  condition: RoadCondition;
  hazard: RoadHazard | null;
  validFrom: string;
  validTo: string;
  reportedAt: string;
  reporterId: string;
  reporterName: string;
  chatId: string;
  status: ReportStatus;
  reviewedBy: string | null;
  eventId: string | null;
};

const iso = (v: unknown) => new Date(v as string).toISOString();

const toReport = (r: Record<string, unknown>): StoredReport => ({
  id: r.id as string,
  corridorSlug: r.slug as string,
  condition: r.condition as RoadCondition,
  hazard: (r.hazard as RoadHazard | null) ?? null,
  validFrom: iso(r.valid_from),
  validTo: iso(r.valid_to),
  reportedAt: iso(r.reported_at),
  reporterId: r.reporter_id as string,
  reporterName: r.reporter_name as string,
  chatId: r.chat_id as string,
  status: r.status as ReportStatus,
  reviewedBy: (r.reviewed_by as string | null) ?? null,
  eventId: (r.event_id as string | null) ?? null,
});

const SELECT_REPORT = sql`
  SELECT r.id, c.slug, r.condition, r.hazard, r.valid_from, r.valid_to,
         r.reported_at, r.reporter_id, r.reporter_name, r.chat_id, r.status,
         r.reviewed_by, r.event_id
  FROM road_report r JOIN corridor c ON c.id = r.corridor_id
`;

/** Null when the corridor slug is not one the catalogue has loaded. */
export async function insertReport(
  conn: Queryable,
  row: {
    corridorSlug: string;
    condition: RoadCondition;
    hazard: RoadHazard | null;
    validFrom: string;
    validTo: string;
    reportedAt: string;
    reporterId: string;
    reporterName: string;
    chatId: string;
  },
): Promise<string | null> {
  const rows = await conn.execute(sql`
    INSERT INTO road_report
      (corridor_id, condition, hazard, valid_from, valid_to, reported_at,
       reporter_id, reporter_name, chat_id, status)
    SELECT c.id, ${row.condition}::road_condition, ${row.hazard},
           ${row.validFrom}::timestamptz, ${row.validTo}::timestamptz,
           ${row.reportedAt}::timestamptz, ${row.reporterId},
           ${row.reporterName}, ${row.chatId}, 'pending'::road_report_status
    FROM corridor c WHERE c.slug = ${row.corridorSlug}
    RETURNING id
  `);
  return (rows.rows[0]?.id as string | undefined) ?? null;
}

/** Reports this person has waiting for review that are still worth reviewing. */
export async function pendingCount(reporterId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS n FROM road_report
    WHERE reporter_id = ${reporterId} AND status = 'pending'
      AND valid_to > now()
  `);
  return (rows.rows[0]?.n as number | undefined) ?? 0;
}

/** The queue an operator works through, oldest first. */
export async function pendingReports(limit = 10): Promise<StoredReport[]> {
  const rows = await db.execute(sql`
    ${SELECT_REPORT}
    WHERE r.status = 'pending' AND r.valid_to > now()
    ORDER BY r.reported_at LIMIT ${limit}
  `);
  return rows.rows.map(toReport);
}

/**
 * The report, locked for the rest of the transaction: two operators tapping
 * approve and reject on the same report must not both win.
 */
export async function lockReport(
  conn: Queryable,
  id: string,
): Promise<StoredReport | null> {
  const rows = await conn.execute(
    sql`${SELECT_REPORT} WHERE r.id = ${id} FOR UPDATE OF r`,
  );
  return rows.rows[0] ? toReport(rows.rows[0]) : null;
}

export async function decideReport(
  conn: Queryable,
  id: string,
  decision: {
    status: ReportStatus;
    reviewedBy: string;
    eventId?: string | null;
  },
): Promise<void> {
  await conn.execute(sql`
    UPDATE road_report SET
      status = ${decision.status}::road_report_status,
      reviewed_by = ${decision.reviewedBy},
      reviewed_at = now(),
      event_id = ${decision.eventId ?? null}
    WHERE id = ${id}
  `);
}

/**
 * Write a road event over its corridor. The geometry is the corridor's own line
 * buffered by its `buffer_m` — the road and its verges, not the valley — which
 * is what the matcher's radius is measured from.
 *
 * Keyed on the dedupe key like every event: a second report of the same
 * closure within the bucket updates the row rather than matching the same
 * drive twice.
 */
export async function publishRoadEvent(
  conn: Queryable,
  draft: EventDraft,
  key: { corridorSlug: string; observedAt: string; dedupeKey: string },
): Promise<string | null> {
  const rows = await conn.execute(sql`
    INSERT INTO world_event
      (source, kind, severity, confidence, geom, valid_from, valid_to,
       observed_at, dedupe_key, payload)
    SELECT ${draft.source}, ${draft.kind}, ${draft.severity}, ${draft.confidence},
           ST_Buffer(c.geom, c.buffer_m),
           ${draft.validFrom}::timestamptz, ${draft.validTo}::timestamptz,
           ${key.observedAt}::timestamptz, ${key.dedupeKey},
           ${JSON.stringify(draft.payload)}::jsonb
    FROM corridor c WHERE c.slug = ${key.corridorSlug}
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
 * Close every road event still open on a corridor, as of `at`. The newest
 * report about a road is the truth about it: "closed" at eight and "one lane"
 * at ten means it is no longer closed, and "open again" means neither.
 */
export async function endRoadEvents(
  conn: Queryable,
  corridorSlug: string,
  at: string,
): Promise<number> {
  const rows = await conn.execute(sql`
    UPDATE world_event SET valid_to = ${at}::timestamptz
    WHERE source = ${ROAD_SOURCE}
      AND payload->>'corridor' = ${corridorSlug}
      AND valid_from <= ${at}::timestamptz
      AND (valid_to IS NULL OR valid_to > ${at}::timestamptz)
    RETURNING id
  `);
  return rows.rows.length;
}
