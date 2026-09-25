import { sql } from "drizzle-orm";
import type {
  Briefing,
  BriefingItem,
  BriefingStop,
} from "../domain/watch/briefing.ts";
import type { EventKind, Severity } from "../domain/watch/event.ts";
import type { Verdict } from "../domain/watch/judge.ts";
import { db } from "./client.ts";

// Stage 6's rows: which trips have a morning today, what there is to tell them,
// and what was told. Policy — how much of it is worth sending, and in what
// order — lives in the domain and the use case; this file only reads and writes.

/**
 * How far ahead a briefing may look.
 *
 * The plan says one call per trip-day, which read literally means a briefing
 * only ever covers the day it is sent on. That loses the thing the product is
 * actually for: rain on Thursday is worth knowing on Tuesday, when the traveller
 * can still move something, and worthless at 07:30 on Thursday when they are
 * already on the trail.
 *
 * Two days is where the forecast stops churning. Beyond it the item simply
 * stays undelivered and is offered again as its day approaches, so nothing is
 * lost by waiting — only by sending too early and being wrong.
 */
export const LOOKAHEAD_HOURS = 48;

export type LiveTripDay = {
  tripId: string;
  title: string;
  startsAt: string;
  party: Record<string, unknown>;
  pace: string;
  prefs: Record<string, unknown>;
};

/**
 * Every trip with a morning on this Tbilisi date: the watch is awake for it and
 * it has at least one stop that day.
 *
 * Trips that already have a briefing for the date are excluded here rather than
 * skipped later, so a cron re-run by hand costs nothing. The unique index on
 * `(trip_id, day)` settles the race this only narrows.
 */
export async function liveTripDays(date: string): Promise<LiveTripDay[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT t.id, t.title, t.starts_at, t.party, t.pace, t.prefs
    FROM trip t
    JOIN trip_watch w ON w.trip_id = t.id
    JOIN trip_node n ON n.trip_id = t.id
    WHERE tstzrange(w.active_from, w.active_to) @> (${date}::date + time '07:30')
            AT TIME ZONE 'Asia/Tbilisi'
      AND (n.starts_at AT TIME ZONE 'Asia/Tbilisi')::date = ${date}::date
      AND NOT EXISTS (
        SELECT 1 FROM briefing b
        WHERE b.trip_id = t.id AND b.day = ${date}::date
      )
    ORDER BY t.starts_at
  `);
  return rows.rows.map((r) => ({
    tripId: r.id as string,
    title: r.title as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    party: (r.party ?? {}) as Record<string, unknown>,
    pace: r.pace as string,
    prefs: (r.prefs ?? {}) as Record<string, unknown>,
  }));
}

/** The stops on one Tbilisi date, in time order, named as the traveller sees them. */
export async function stopsOn(
  tripId: string,
  date: string,
): Promise<BriefingStop[]> {
  const rows = await db.execute(sql`
    SELECT n.id, COALESCE(p.name, n.meta->>'title', '') AS title,
           n.starts_at, n.duration_min, n.indoor
    FROM trip_node n
    LEFT JOIN place p ON p.id = n.place_id
    WHERE n.trip_id = ${tripId}
      AND (n.starts_at AT TIME ZONE 'Asia/Tbilisi')::date = ${date}::date
    ORDER BY n.starts_at
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    durationMin: r.duration_min as number,
    indoor: r.indoor as boolean,
  }));
}

/**
 * Everything the router sent to the briefing for this trip that nobody has been
 * told about yet, within the lookahead and still in the future.
 *
 * A pair whose stop has already passed is left undelivered rather than swept:
 * it costs nothing, it can never match this filter again, and a row that says
 * "judged, never delivered" is a truer record than one backdated to look sent.
 */
export async function briefingBundle(
  tripId: string,
  now: Date = new Date(),
): Promise<BriefingItem[]> {
  const rows = await db.execute(sql`
    SELECT m.id, m.event_id, m.node_id, m.score, m.verdict,
           e.kind, e.severity, e.source,
           COALESCE(p.name, n.meta->>'title', '') AS node_title,
           n.starts_at
    FROM event_match m
    JOIN world_event e ON e.id = m.event_id
    JOIN trip_node n ON n.id = m.node_id
    LEFT JOIN place p ON p.id = n.place_id
    WHERE m.trip_id = ${tripId}
      AND m.route = 'briefing'
      AND m.delivered_at IS NULL
      AND m.verdict IS NOT NULL
      AND n.starts_at > ${now.toISOString()}::timestamptz
      AND n.starts_at < ${now.toISOString()}::timestamptz
                        + ${`${LOOKAHEAD_HOURS} hours`}::interval
    ORDER BY m.score DESC
  `);
  return rows.rows.map((r) => ({
    matchId: r.id as string,
    eventId: r.event_id as string,
    nodeId: r.node_id as string,
    kind: r.kind as EventKind,
    severity: r.severity as Severity,
    source: r.source as string,
    score: Number(r.score),
    nodeTitle: r.node_title as string,
    nodeStartsAt: new Date(r.starts_at as string).toISOString(),
    verdict: r.verdict as Verdict,
  }));
}

export type SavedBriefing = { id: string };

/**
 * Write the briefing, the delivery marks and the intervention rows as one
 * thing. `ON CONFLICT DO NOTHING` returning nothing means another run got there
 * first — the caller stops rather than sending a second copy.
 *
 * Neon's HTTP driver cannot open a transaction, so this is three statements
 * gated on the first: the insert is the claim, and the marks only follow a
 * claim that won. A crash between them leaves a briefing whose items are not
 * marked delivered, which repeats one morning's news at worst; the reverse
 * order would lose it entirely.
 */
export async function saveBriefing(row: {
  tripId: string;
  date: string;
  dayIndex: number;
  quiet: boolean;
  document: Briefing;
  emailTo: string | null;
  matchIds: readonly string[];
  eventIds: readonly string[];
}): Promise<SavedBriefing | null> {
  const inserted = await db.execute(sql`
    INSERT INTO briefing (trip_id, day, day_index, quiet, document, email_to)
    VALUES (${row.tripId}, ${row.date}::date, ${row.dayIndex}, ${row.quiet},
            ${JSON.stringify(row.document)}::jsonb, ${row.emailTo})
    ON CONFLICT (trip_id, day) DO NOTHING
    RETURNING id
  `);
  const id = inserted.rows[0]?.id as string | undefined;
  if (!id) return null;

  if (row.matchIds.length > 0) {
    await db.execute(sql`
      UPDATE event_match SET delivered_at = now()
      WHERE id = ANY(${sql`ARRAY[${sql.join(
        row.matchIds.map((m) => sql`${m}::uuid`),
        sql`, `,
      )}]`})
    `);
  }

  // One intervention per event, not per pair: the same rain over two stops is
  // one thing the traveller was told, and `intervention.outcome` is the number
  // the kill criteria read.
  if (row.eventIds.length > 0) {
    await db.execute(sql`
      INSERT INTO intervention (trip_id, event_id, channel)
      SELECT ${row.tripId}::uuid, e, 'briefing'::delivery_channel
      FROM unnest(ARRAY[${sql.join(
        row.eventIds.map((e) => sql`${e}::uuid`),
        sql`, `,
      )}]) AS e
    `);
  }

  return { id };
}

/** What the send did, kept either way (src/dal/schema/watch.ts). */
export async function recordEmail(
  briefingId: string,
  result: { sent: boolean; error?: string },
): Promise<void> {
  await db.execute(sql`
    UPDATE briefing SET
      email_sent_at = ${result.sent ? sql`now()` : sql`NULL`},
      email_error = ${result.error ?? null}
    WHERE id = ${briefingId}
  `);
}

export type StoredBriefing = {
  id: string;
  tripId: string;
  date: string;
  dayIndex: number;
  quiet: boolean;
  document: Briefing;
  emailSentAt: string | null;
  openedAt: string | null;
};

const toStored = (r: Record<string, unknown>): StoredBriefing => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  date: r.day as string,
  dayIndex: r.day_index as number,
  quiet: r.quiet as boolean,
  document: r.document as Briefing,
  emailSentAt: r.email_sent_at
    ? new Date(r.email_sent_at as string).toISOString()
    : null,
  openedAt: r.opened_at ? new Date(r.opened_at as string).toISOString() : null,
});

const SELECT_BRIEFING = sql`
  SELECT id, trip_id, day::text AS day, day_index, quiet, document,
         email_sent_at, opened_at
  FROM briefing
`;

export async function briefingOn(
  tripId: string,
  date: string,
): Promise<StoredBriefing | null> {
  const rows = await db.execute(sql`
    ${SELECT_BRIEFING} WHERE trip_id = ${tripId} AND day = ${date}::date
  `);
  return rows.rows[0] ? toStored(rows.rows[0]) : null;
}

/**
 * The most recent briefing for a trip. What the in-app view falls back to: at
 * 06:00 the traveller has not had today's yet, and yesterday's is still the
 * last thing the system said.
 */
export async function latestBriefing(
  tripId: string,
): Promise<StoredBriefing | null> {
  const rows = await db.execute(sql`
    ${SELECT_BRIEFING} WHERE trip_id = ${tripId} ORDER BY day DESC LIMIT 1
  `);
  return rows.rows[0] ? toStored(rows.rows[0]) : null;
}

export async function byId(id: string): Promise<StoredBriefing | null> {
  const rows = await db.execute(sql`${SELECT_BRIEFING} WHERE id = ${id}`);
  return rows.rows[0] ? toStored(rows.rows[0]) : null;
}

/**
 * First open wins. A briefing read twice is not read more, and overwriting the
 * stamp would turn "opened per trip-day" into "last touched", which measures a
 * different thing.
 */
export async function markOpened(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE briefing SET opened_at = now()
    WHERE id = ${id} AND opened_at IS NULL
  `);
}

export type OpenRate = { sent: number; opened: number; days: number };

/** The kill-criteria read: briefings opened per trip-day (>= 50% / < 20%). */
export async function openRate(sinceDays: number): Promise<OpenRate> {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS sent,
           count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
           count(DISTINCT (trip_id, day))::int AS days
    FROM briefing
    WHERE composed_at > now() - ${`${sinceDays} days`}::interval
  `);
  const r = rows.rows[0] ?? {};
  return {
    sent: (r.sent as number) ?? 0,
    opened: (r.opened as number) ?? 0,
    days: (r.days as number) ?? 0,
  };
}

/**
 * Who the briefing goes to. An anonymous trip has no address to send to: it
 * gets the in-app briefing and no email, which is the correct behaviour and not
 * a failure to report.
 *
 * "No address" is not the same as a null `email`. Better Auth's anonymous
 * plugin gives every guest a generated placeholder (`<id>@anonymous.…`) because
 * the column is NOT NULL, so a guest has to be recognised by `is_anonymous` —
 * otherwise every guest's briefing is posted to a mailbox that does not exist,
 * at a cost to the sending domain's reputation.
 */
export async function recipientFor(tripId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT u.email FROM trip t
    JOIN "user" u ON u.id = t.user_id
    WHERE t.id = ${tripId} AND u.is_anonymous IS NOT TRUE
  `);
  return (rows.rows[0]?.email as string | undefined) ?? null;
}
