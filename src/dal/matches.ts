import { sql } from "drizzle-orm";
import { isOutdoor } from "../domain/catalogue/categories.ts";
import {
  type EventKind,
  eventKinds,
  nodeKindsFor,
  radiusFor,
  staleAfterHours,
} from "../domain/watch/event.ts";
import type { Rejection, Verdict } from "../domain/watch/judge.ts";
import type { Route, RouteReason } from "../domain/watch/route.ts";
import { db, type Queryable } from "./client.ts";

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
 * `staleAfterHours(kind)`, the same way: six hours for a forecast the sense
 * loop re-reports hourly, three days for a road report nothing re-observes.
 */
const staleAfter = sql`CASE e.kind ${sql.join(
  eventKinds.map((kind) => sql`WHEN ${kind} THEN ${staleAfterHours(kind)}`),
  sql` `,
)} ELSE 6 END`;

/**
 * `nodeKindsFor(kind)`, the same way: a road event may only meet a transfer.
 * Kinds with no restriction fall through to TRUE.
 */
const nodeKindAllowed = sql`CASE e.kind ${sql.join(
  eventKinds.flatMap((kind) => {
    const allowed = nodeKindsFor(kind);
    return allowed
      ? [
          sql`WHEN ${kind} THEN n.kind IN (${sql.join(
            allowed.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ]
      : [];
  }),
  sql` `,
)} ELSE TRUE END`;

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
 * Everything but the join between an event and a node: the live watch, the
 * overlapping windows, the kinds of stop the event may meet, and freshness.
 */
const matchable = sql`
  JOIN trip t ON t.id = n.trip_id
  JOIN trip_watch w ON w.trip_id = t.id
                   AND tstzrange(w.active_from, w.active_to) @> now()
  WHERE tstzrange(e.valid_from, COALESCE(e.valid_to, e.valid_from + interval '1 hour'))
     && tstzrange(n.starts_at, n.starts_at + n.duration_min * interval '1 minute')
    AND ${nodeKindAllowed}
    AND e.observed_at > now() - ${staleAfter} * interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM event_match m WHERE m.event_id = e.id AND m.node_id = n.id
    )
`;

/**
 * The join, as specced in docs/implementation-plan.md §5.
 *
 * `observed_at` is what keeps a stale event out: the sense loop refreshes what
 * is still true every hour, so a forecast it has stopped re-reporting has
 * stopped being forecast. A road report is not refreshed, so its allowance is
 * its longest window instead (`staleAfterHours`).
 *
 * It needs both the plan's `NOT EXISTS` and `ON CONFLICT DO NOTHING`, for
 * different reasons. The `LIMIT` applies to the SELECT, before any conflict is
 * seen, and every live pair keeps satisfying the join for as long as its event
 * is re-forecast — so without the `NOT EXISTS`, once `limit` pairs had been
 * matched they would fill every run's quota, conflict, and no new pair would
 * ever be inserted. Both passes share it through `matchable`. The constraint
 * is still what settles the race between overlapping invocations, which a
 * `NOT EXISTS` only narrows.
 *
 * Two passes. The first is the spatial join, and the one that matters for
 * cost: GiST on both sides. The second catches a transfer that names the
 * corridor it drives (`meta.corridorSlug`) but is located at a destination
 * further off the road than the radius — matched by name, not by distance. It
 * is a separate statement rather than an OR in the first join, which would
 * cost the spatial index for every event to serve the few that are roads.
 */
export async function matchEvents(limit: number): Promise<MatchedPair[]> {
  const spatial = await db.execute(sql`
    INSERT INTO event_match (event_id, trip_id, node_id, score)
    SELECT e.id, t.id, n.id, ${matchScore}
    FROM world_event e
    JOIN trip_node n
      ON ST_DWithin(e.geom, n.geom, ${matchRadius})
    ${matchable}
    ORDER BY ${matchScore} DESC
    LIMIT ${limit}
    ON CONFLICT (event_id, node_id) DO NOTHING
    RETURNING id, event_id, trip_id, node_id, score
  `);
  const named = await db.execute(sql`
    INSERT INTO event_match (event_id, trip_id, node_id, score)
    SELECT e.id, t.id, n.id, ${matchScore}
    FROM world_event e
    JOIN trip_node n
      ON n.meta->>'corridorSlug' = e.payload->>'corridor'
    ${matchable}
      AND e.payload ? 'corridor'
    ORDER BY ${matchScore} DESC
    LIMIT ${limit}
    ON CONFLICT (event_id, node_id) DO NOTHING
    RETURNING id, event_id, trip_id, node_id, score
  `);
  return [...spatial.rows, ...named.rows].map(toPair);
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

/**
 * Change a routed pair's route after the fact. Delivery re-asks the router's
 * question at send time (src/domain/watch/interrupt.ts), and a push the budget
 * turns away belongs in the morning briefing — which gathers exactly the pairs
 * routed `briefing` and not yet delivered, so this is all it takes to put it
 * there.
 */
export async function rerouteMatch(
  matchId: string,
  route: Route,
  reason: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.execute(sql`
    UPDATE event_match SET route = ${route}::event_route, route_reason = ${reason}
    WHERE id = ${matchId}
  `);
}

/** The fourth stamp: this pair's news reached the traveller. */
export async function markDelivered(
  matchId: string,
  conn: Queryable = db,
): Promise<void> {
  await conn.execute(sql`
    UPDATE event_match SET delivered_at = now()
    WHERE id = ${matchId} AND delivered_at IS NULL
  `);
}

export type RoutedPair = {
  matchId: string;
  tripId: string;
  userId: string | null;
  route: Route | null;
  deliveredAt: string | null;
  verdict: Verdict | null;
  event: { id: string; kind: EventKind; validTo: string | null };
  node: { id: string; title: string; startsAt: string; durationMin: number };
};

/** What delivering a judged pair needs, in one read. */
export async function loadRouted(matchId: string): Promise<RoutedPair | null> {
  const rows = await db.execute(sql`
    SELECT m.id, m.trip_id, m.route, m.delivered_at, m.verdict,
           e.id AS event_id, e.kind, e.valid_to,
           n.id AS node_id, n.starts_at, n.duration_min,
           COALESCE(p.name, n.meta->>'title', '') AS node_title,
           t.user_id
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
    matchId: r.id as string,
    tripId: r.trip_id as string,
    userId: (r.user_id as string | null) ?? null,
    route: (r.route as Route | null) ?? null,
    deliveredAt: r.delivered_at
      ? new Date(r.delivered_at as string).toISOString()
      : null,
    verdict: (r.verdict as Verdict | null) ?? null,
    event: {
      id: r.event_id as string,
      kind: r.kind as EventKind,
      validTo: r.valid_to ? new Date(r.valid_to as string).toISOString() : null,
    },
    node: {
      id: r.node_id as string,
      title: r.node_title as string,
      startsAt: new Date(r.starts_at as string).toISOString(),
      durationMin: r.duration_min as number,
    },
  };
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
 *
 * The stop's own place is left out: it is always the nearest, so it would take
 * a slot and invite a swap to itself, which changes nothing.
 */
export async function nearbyAlternatives(
  lonLat: [number, number],
  radiusM: number,
  limit: number,
  excludePlaceId: string | null = null,
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
      ${excludePlaceId ? sql`AND p.id <> ${excludePlaceId}` : sql``}
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
