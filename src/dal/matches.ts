import { sql } from "drizzle-orm";
import { isOutdoor } from "../domain/catalogue/categories.ts";
import {
  type EventKind,
  eventKinds,
  radiusFor,
} from "../domain/watch/event.ts";
import type { Rejection, Verdict } from "../domain/watch/judge.ts";
import type { Route, RouteReason } from "../domain/watch/route.ts";
import { db } from "./client.ts";

// Stage 3, and the load-bearing SQL of the whole system. Every event is
// compared against every live node in one spatiotemporal join, and only what
// survives it reaches a model. The trap the architecture exists to avoid is
// judging every event against every trip; match first, always.

/**
 * `radiusFor(kind)` as a SQL expression, built from the domain's own table so
 * the single dial on the model bill stays in one file and cannot drift between
 * the judge's prompt and the query that feeds it.
 */
const matchRadius = sql`CASE e.kind ${sql.join(
  eventKinds.map((kind) => sql`WHEN ${kind} THEN ${radiusFor(kind)}`),
  sql` `,
)} ELSE 10000 END`;

/**
 * What the judge sees first. Worst weather, best-trusted forecast, outdoors:
 * the order the queue drains in, so a backlog that never fully clears has at
 * least spent the money on the pairs that mattered.
 */
const matchScore = sql`
  (CASE e.severity
     WHEN 'extreme' THEN 4 WHEN 'severe' THEN 3
     WHEN 'moderate' THEN 2 ELSE 1 END)
  * e.confidence
  * (CASE WHEN n.indoor THEN 0.3 ELSE 1 END)
`;

export type MatchedPair = {
  id: string;
  eventId: string;
  tripId: string;
  nodeId: string;
  score: number;
};

/**
 * The join, as specced in docs/implementation-plan.md §5.
 *
 * `observed_at > now() - interval '6 hours'` is what keeps a stale event out:
 * the sense loop refreshes what is still true every hour, so anything it has
 * stopped re-reporting has stopped being forecast.
 *
 * The insert is `ON CONFLICT DO NOTHING` rather than the plan's `NOT EXISTS`.
 * Invocations of a five-minute cron overlap, and a uniqueness constraint
 * settles the race that a NOT EXISTS only narrows.
 */
export async function matchEvents(limit: number): Promise<MatchedPair[]> {
  const rows = await db.execute(sql`
    INSERT INTO event_match (event_id, trip_id, node_id, score)
    SELECT e.id, t.id, n.id, ${matchScore}
    FROM world_event e
    JOIN trip_node n
      ON ST_DWithin(e.geom, n.geom, ${matchRadius})
    JOIN trip t ON t.id = n.trip_id
    JOIN trip_watch w ON w.trip_id = t.id
                     AND tstzrange(w.active_from, w.active_to) @> now()
    WHERE tstzrange(e.valid_from, COALESCE(e.valid_to, e.valid_from + interval '1 hour'))
       && tstzrange(n.starts_at, n.starts_at + n.duration_min * interval '1 minute')
      AND e.observed_at > now() - interval '6 hours'
    ORDER BY ${matchScore} DESC
    LIMIT ${limit}
    ON CONFLICT (event_id, node_id) DO NOTHING
    RETURNING id, event_id, trip_id, node_id, score
  `);
  return rows.rows.map(toPair);
}

const toPair = (r: Record<string, unknown>): MatchedPair => ({
  id: r.id as string,
  eventId: r.event_id as string,
  tripId: r.trip_id as string,
  nodeId: r.node_id as string,
  score: Number(r.score),
});

/**
 * Claim unjudged pairs for the judge queue. The claim is the UPDATE: setting
 * `queued_at` under a `WHERE queued_at IS NULL` is what makes enqueueing
 * idempotent across overlapping matcher runs, and what lets an escalated event
 * be re-queued simply by clearing the column again.
 */
export async function claimForJudging(limit: number): Promise<MatchedPair[]> {
  const rows = await db.execute(sql`
    UPDATE event_match SET queued_at = now()
    WHERE id IN (
      SELECT id FROM event_match
      WHERE judged_at IS NULL AND queued_at IS NULL
      ORDER BY score DESC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, event_id, trip_id, node_id, score
  `);
  return rows.rows.map(toPair);
}

/** Judged, routed and logged — including the drops. */
export async function recordVerdict(
  matchId: string,
  outcome: {
    verdict: Verdict | null;
    route: Route;
    reason: RouteReason | "rejected";
    rejections: Rejection[];
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE event_match SET
      judged_at = now(),
      verdict = ${outcome.verdict ? JSON.stringify(outcome.verdict) : null}::jsonb,
      route = ${outcome.route}::event_route,
      route_reason = ${outcome.reason},
      rejections = ${
        outcome.rejections.length > 0
          ? JSON.stringify(outcome.rejections)
          : null
      }::jsonb
    WHERE id = ${matchId}
  `);
}

/** Put a pair back in the queue: a transient failure is not a verdict. */
export async function releaseClaim(matchId: string): Promise<void> {
  await db.execute(sql`
    UPDATE event_match SET queued_at = NULL
    WHERE id = ${matchId} AND judged_at IS NULL
  `);
}

export type PairContext = {
  match: MatchedPair;
  judgedAt: string | null;
  event: {
    id: string;
    kind: EventKind;
    severity: string;
    confidence: number;
    validFrom: string;
    validTo: string | null;
    source: string;
    observedAt: string;
    payload: Record<string, unknown>;
  };
  node: {
    id: string;
    kind: string;
    placeId: string | null;
    placeName: string | null;
    startsAt: string;
    durationMin: number;
    indoor: boolean;
    meta: Record<string, unknown>;
    lonLat: [number, number];
  };
  trip: {
    id: string;
    party: Record<string, unknown>;
    pace: string;
    prefs: Record<string, unknown>;
  };
};

/**
 * Everything one judge call needs, in one read. The judge is the expensive
 * stage; making it wait on four round trips to Postgres would add latency to
 * the one place a drain's 240s budget is actually spent.
 */
export async function loadPair(matchId: string): Promise<PairContext | null> {
  const rows = await db.execute(sql`
    SELECT m.id, m.event_id, m.trip_id, m.node_id, m.score, m.judged_at,
           e.kind, e.severity, e.confidence, e.valid_from, e.valid_to,
           e.source, e.observed_at, e.payload,
           n.kind AS node_kind, n.place_id, n.starts_at, n.duration_min,
           n.indoor, n.meta,
           ST_X(n.geom::geometry) AS lon, ST_Y(n.geom::geometry) AS lat,
           p.name AS place_name,
           t.party, t.pace, t.prefs
    FROM event_match m
    JOIN world_event e ON e.id = m.event_id
    JOIN trip_node n ON n.id = m.node_id
    JOIN trip t ON t.id = m.trip_id
    LEFT JOIN place p ON p.id = n.place_id
    WHERE m.id = ${matchId}
  `);
  const r = rows.rows[0];
  if (!r) return null;

  return {
    match: toPair(r),
    judgedAt: r.judged_at
      ? new Date(r.judged_at as string).toISOString()
      : null,
    event: {
      id: r.event_id as string,
      kind: r.kind as EventKind,
      severity: r.severity as string,
      confidence: Number(r.confidence),
      validFrom: new Date(r.valid_from as string).toISOString(),
      validTo: r.valid_to ? new Date(r.valid_to as string).toISOString() : null,
      source: r.source as string,
      observedAt: new Date(r.observed_at as string).toISOString(),
      payload: (r.payload ?? {}) as Record<string, unknown>,
    },
    node: {
      id: r.node_id as string,
      kind: r.node_kind as string,
      placeId: (r.place_id as string | null) ?? null,
      placeName: (r.place_name as string | null) ?? null,
      startsAt: new Date(r.starts_at as string).toISOString(),
      durationMin: r.duration_min as number,
      indoor: r.indoor as boolean,
      meta: (r.meta ?? {}) as Record<string, unknown>,
      lonLat: [Number(r.lon), Number(r.lat)],
    },
    trip: {
      id: r.trip_id as string,
      party: (r.party ?? {}) as Record<string, unknown>,
      pace: r.pace as string,
      prefs: (r.prefs ?? {}) as Record<string, unknown>,
    },
  };
}

/** The rest of the day the matched node sits in, so a proposal can be coherent. */
export async function loadDay(
  tripId: string,
  around: string,
): Promise<
  {
    id: string;
    title: string;
    startsAt: string;
    durationMin: number;
    indoor: boolean;
  }[]
> {
  const rows = await db.execute(sql`
    SELECT n.id, n.meta->>'title' AS title, n.starts_at, n.duration_min, n.indoor
    FROM trip_node n
    WHERE n.trip_id = ${tripId}
      AND (n.starts_at AT TIME ZONE 'Asia/Tbilisi')::date
          = (${around}::timestamptz AT TIME ZONE 'Asia/Tbilisi')::date
    ORDER BY n.starts_at
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "",
    startsAt: new Date(r.starts_at as string).toISOString(),
    durationMin: r.duration_min as number,
    indoor: r.indoor as boolean,
  }));
}

/**
 * Curated and verified places near the matched node: the only alternatives the
 * judge may propose. The tier filter is what makes "the model cannot name a
 * place it did not retrieve" mean something, and the validator checks it again
 * once the verdict comes back.
 */
export async function nearbyAlternatives(
  lonLat: [number, number],
  radiusM: number,
  limit: number,
): Promise<
  {
    placeId: string;
    name: string;
    category: string;
    indoor: boolean;
    distanceM: number;
  }[]
> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lonLat[0]}, ${lonLat[1]}), 4326)::geography`;
  const rows = await db.execute(sql`
    SELECT p.id, p.name, p.category,
           ST_Distance(p.geom, ${point})::int AS distance_m
    FROM place p
    WHERE p.tier IN ('curated', 'verified')
      AND ST_DWithin(p.geom, ${point}, ${radiusM})
    ORDER BY p.tier = 'curated' DESC, distance_m
    LIMIT ${limit}
  `);
  return rows.rows.map((r) => ({
    placeId: r.id as string,
    name: r.name as string,
    category: r.category as string,
    indoor: !isOutdoor(r.category as string),
    distanceM: r.distance_m as number,
  }));
}

export type PairsPerTripDay = {
  tripId: string;
  day: string;
  pairs: number;
};

/**
 * The kill-criteria input, measured from the first day the matcher runs. More
 * than about a dozen pairs per trip-day means the radius is too wide — not the
 * prompt too long.
 */
export async function pairsPerTripDay(
  sinceDays: number,
): Promise<PairsPerTripDay[]> {
  const rows = await db.execute(sql`
    SELECT m.trip_id,
           to_char(n.starts_at AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM-DD') AS day,
           count(*)::int AS pairs
    FROM event_match m JOIN trip_node n ON n.id = m.node_id
    WHERE m.matched_at > now() - ${`${sinceDays} days`}::interval
    GROUP BY m.trip_id, day
    ORDER BY pairs DESC
  `);
  return rows.rows.map((r) => ({
    tripId: r.trip_id as string,
    day: r.day as string,
    pairs: r.pairs as number,
  }));
}
