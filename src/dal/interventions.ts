import { sql } from "drizzle-orm";
import type { Offer, Outcome } from "../domain/watch/interrupt.ts";
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

export type InterventionRow = {
  id: string;
  tripId: string;
  userId: string | null;
  eventId: string;
  channel: "push" | "email" | "briefing";
  sentAt: string | null;
  patchId: string | null;
  outcome: Outcome | null;
  outcomeAt: string | null;
  offer: unknown;
  expiresAt: string | null;
  event: {
    kind: string;
    severity: string;
    source: string;
    validFrom: string;
    validTo: string | null;
    payload: Record<string, unknown>;
  };
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const toRow = (r: Record<string, unknown>): InterventionRow => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  userId: (r.user_id as string | null) ?? null,
  eventId: r.event_id as string,
  channel: r.channel as InterventionRow["channel"],
  sentAt: iso(r.sent_at),
  patchId: (r.patch_id as string | null) ?? null,
  outcome: (r.outcome as Outcome | null) ?? null,
  outcomeAt: iso(r.outcome_at),
  offer: r.offer ?? null,
  expiresAt: iso(r.expires_at),
  event: {
    kind: r.kind as string,
    severity: r.severity as string,
    source: r.source as string,
    validFrom: new Date(r.valid_from as string).toISOString(),
    validTo: iso(r.valid_to),
    payload: (r.payload ?? {}) as Record<string, unknown>,
  },
});

const SELECT_INTERVENTION = sql`
  SELECT i.id, i.trip_id, i.event_id, i.channel, i.sent_at, i.patch_id,
         i.outcome, i.outcome_at, i.offer, i.expires_at, t.user_id,
         e.kind, e.severity, e.source, e.valid_from, e.valid_to, e.payload
  FROM intervention i
  JOIN trip t ON t.id = i.trip_id
  JOIN world_event e ON e.id = i.event_id
`;

export async function loadIntervention(
  id: string,
  conn: Queryable = db,
): Promise<InterventionRow | null> {
  const rows = await conn.execute(
    sql`${SELECT_INTERVENTION} WHERE i.id = ${id}`,
  );
  return rows.rows[0] ? toRow(rows.rows[0]) : null;
}

/**
 * The same row, locked for the rest of the transaction: two taps on "apply"
 * from a phone and a laptop must not both append the patch.
 */
export async function lockIntervention(
  conn: Queryable,
  id: string,
): Promise<InterventionRow | null> {
  const rows = await conn.execute(
    sql`${SELECT_INTERVENTION} WHERE i.id = ${id} FOR UPDATE OF i`,
  );
  return rows.rows[0] ? toRow(rows.rows[0]) : null;
}

/**
 * The write the kill criteria read. The caller has already asked the domain
 * whether this outcome may overwrite the current one (`mayRecord`); this only
 * writes it, with the patch it applied when there is one.
 */
export async function recordOutcome(
  conn: Queryable,
  id: string,
  outcome: Outcome,
  patchId: string | null = null,
): Promise<void> {
  await conn.execute(sql`
    UPDATE intervention
    SET outcome = ${outcome}::intervention_outcome, outcome_at = now(),
        patch_id = COALESCE(${patchId}::uuid, patch_id)
    WHERE id = ${id}
  `);
}

/**
 * `ignored`, written by the clock rather than left to the client: an
 * intervention nobody answered before it expired. Without this the acceptance
 * rate's denominator counts only the ones someone bothered to answer, which is
 * the number that flatters the product most.
 *
 * Rows from before expiry was recorded fall back to 48 hours after sending —
 * the briefing's own lookahead, past which nothing it said was still ahead.
 */
export async function sweepIgnored(): Promise<number> {
  const rows = await db.execute(sql`
    UPDATE intervention SET outcome = 'ignored', outcome_at = now()
    WHERE outcome IS NULL AND sent_at IS NOT NULL
      AND COALESCE(expires_at, sent_at + interval '48 hours') < now()
    RETURNING id
  `);
  return rows.rows.length;
}

/** Everything this trip was told, newest first. The trust screen. */
export async function interventionsFor(
  tripId: string,
): Promise<InterventionRow[]> {
  const rows = await db.execute(sql`
    ${SELECT_INTERVENTION}
    WHERE i.trip_id = ${tripId} AND i.sent_at IS NOT NULL
    ORDER BY i.sent_at DESC
  `);
  return rows.rows.map(toRow);
}

/** How many pairs the judge has looked at for this trip: "checks run". */
export async function checksRun(tripId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS n FROM event_match
    WHERE trip_id = ${tripId} AND judged_at IS NOT NULL
  `);
  return (rows.rows[0]?.n as number | undefined) ?? 0;
}

/** The briefing intervention that offered a given match's change. */
export async function briefingOfferFor(
  tripId: string,
  matchId: string,
): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT id FROM intervention
    WHERE trip_id = ${tripId} AND channel = 'briefing'
      AND offer->>'matchId' = ${matchId}
    ORDER BY sent_at DESC LIMIT 1
  `);
  return (rows.rows[0]?.id as string | undefined) ?? null;
}
