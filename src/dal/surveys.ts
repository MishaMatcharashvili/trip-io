import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `trip_survey`: the one question asked after a trip, answered once.

/** False when the trip had already answered: the first answer stands. */
export async function insertSurvey(row: {
  tripId: string;
  wouldPay: boolean;
  note: string | null;
}): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO trip_survey (trip_id, would_pay, note)
    VALUES (${row.tripId}, ${row.wouldPay}, ${row.note})
    ON CONFLICT (trip_id) DO NOTHING
    RETURNING trip_id
  `);
  return rows.rows.length > 0;
}

/**
 * The trip's survey state: whether it is time to ask (the trip is over and it
 * held a pass) and whether it was already answered. Null for an unknown trip.
 */
export async function surveyState(
  tripId: string,
  now: Date,
): Promise<{ ask: boolean; answered: boolean } | null> {
  const rows = await db.execute(sql`
    SELECT t.ends_at < ${now.toISOString()}::timestamptz AS over,
           EXISTS (SELECT 1 FROM watch_pass p WHERE p.trip_id = t.id) AS passed,
           EXISTS (SELECT 1 FROM trip_survey s WHERE s.trip_id = t.id) AS answered
    FROM trip t WHERE t.id = ${tripId}
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    ask: Boolean(r.over) && Boolean(r.passed),
    answered: Boolean(r.answered),
  };
}
