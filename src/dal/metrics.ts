import { type SQL, sql } from "drizzle-orm";
import { db } from "./client.ts";

// Everything the Phase 9 dashboard reads, and nothing it writes. Each query
// takes the operators' emails (`CURATOR_EMAILS`) because the cohort leaves
// them out: a metric measured over the people who built the product is a
// metric about the people who built it.
//
// The cohort is trips with an owner, whose owner is not an operator, and that
// hold a pass (context/phase-9-design.md, decision 2). Seeded and synthetic
// trips have no owner, so they fall out without being named.

const textArray = (items: readonly string[]): SQL =>
  items.length > 0
    ? sql`ARRAY[${sql.join(
        items.map((i) => sql`${i.toLowerCase()}`),
        sql`, `,
      )}]::text[]`
    : sql`ARRAY[]::text[]`;

const withCohort = (operators: readonly string[]): SQL => sql`
  WITH cohort AS (
    SELECT t.id, t.user_id, t.starts_at, t.ends_at
    FROM trip t
    JOIN "user" u ON u.id = t.user_id
    JOIN watch_pass p ON p.trip_id = t.id
    WHERE lower(u.email) <> ALL(${textArray(operators)})
  )
`;

const int = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------

export type CohortTrip = {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Days of the trip that have happened, so a trip in progress is counted for what it has had. */
  elapsedDays: number;
};

export async function cohortTrips(
  operators: readonly string[],
  now: Date,
): Promise<CohortTrip[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT id, starts_at, ends_at,
           GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
             LEAST(${now.toISOString()}::timestamptz, ends_at) - starts_at
           )) / 86400))::int AS elapsed_days
    FROM cohort ORDER BY starts_at
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    endsAt: new Date(r.ends_at as string).toISOString(),
    elapsedDays: int(r.elapsed_days),
  }));
}

export type OutcomeCounts = {
  accepted: number;
  dismissed: number;
  ignored: number;
  muted: number;
  /** Not answered and not yet expired. Not in either rate. */
  pending: number;
};

/**
 * What became of everything the cohort was told. `seen` is the subset a person
 * can be said to have been shown: every push, and a briefing item only if its
 * briefing was opened — an item in a briefing nobody opened being `ignored`
 * says nothing about the advice.
 */
export async function interventionOutcomes(
  operators: readonly string[],
): Promise<{ all: OutcomeCounts; seen: OutcomeCounts }> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT i.outcome,
           (i.channel <> 'briefing' OR b.opened_at IS NOT NULL) AS seen,
           count(*)::int AS n
    FROM intervention i
    JOIN cohort c ON c.id = i.trip_id
    LEFT JOIN briefing b ON b.id = i.briefing_id
    WHERE i.sent_at IS NOT NULL
    GROUP BY 1, 2
  `);
  const empty = (): OutcomeCounts => ({
    accepted: 0,
    dismissed: 0,
    ignored: 0,
    muted: 0,
    pending: 0,
  });
  const all = empty();
  const seen = empty();
  for (const r of rows.rows) {
    const key = (r.outcome as keyof OutcomeCounts | null) ?? "pending";
    all[key] += int(r.n);
    if (r.seen) seen[key] += int(r.n);
  }
  return { all, seen };
}

/**
 * Trips that could have muted push — the owner has a registered device — and
 * how many did. Without a device there was nothing to mute, and counting those
 * trips would dilute the rate towards a pass it has not earned.
 */
export async function muteCounts(
  operators: readonly string[],
): Promise<{ withDevice: number; muted: number }> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT count(*)::int AS with_device,
           count(*) FILTER (WHERE w.muted_at IS NOT NULL)::int AS muted
    FROM cohort c
    JOIN trip_watch w ON w.trip_id = c.id
    WHERE EXISTS (SELECT 1 FROM device d WHERE d.user_id = c.user_id)
  `);
  const r = rows.rows[0] ?? {};
  return { withDevice: int(r.with_device), muted: int(r.muted) };
}

export type OpenCounts = {
  composed: number;
  /** Any open, the email pixel included. The figure the criterion names. */
  opened: number;
  /** Opens from the app page, which a mail client cannot pre-fetch. */
  openedInApp: number;
  quiet: number;
};

export async function briefingOpens(
  operators: readonly string[],
): Promise<OpenCounts> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT count(*)::int AS composed,
           count(*) FILTER (WHERE b.opened_at IS NOT NULL)::int AS opened,
           count(*) FILTER (WHERE b.app_opened_at IS NOT NULL)::int AS opened_in_app,
           count(*) FILTER (WHERE b.quiet)::int AS quiet
    FROM briefing b JOIN cohort c ON c.id = b.trip_id
  `);
  const r = rows.rows[0] ?? {};
  return {
    composed: int(r.composed),
    opened: int(r.opened),
    openedInApp: int(r.opened_in_app),
    quiet: int(r.quiet),
  };
}

export type WorthByFamily = {
  family: string;
  worth: number;
  interrupt: number;
};

/**
 * Judged findings the router would tell someone about, one per (trip, event):
 * the same rain over two stops is one thing told once. `kill:count` counts it
 * the same way.
 */
export async function worthSending(
  operators: readonly string[],
): Promise<WorthByFamily[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT split_part(e.kind, '.', 1) AS family,
           count(*)::int AS worth,
           count(*) FILTER (WHERE w.interrupt)::int AS interrupt
    FROM (
      SELECT m.trip_id, m.event_id, bool_or(m.route = 'interrupt') AS interrupt
      FROM event_match m JOIN cohort c ON c.id = m.trip_id
      WHERE m.route IN ('interrupt', 'briefing')
      GROUP BY m.trip_id, m.event_id
    ) w
    JOIN world_event e ON e.id = w.event_id
    GROUP BY 1 ORDER BY 1
  `);
  return rows.rows.map((r) => ({
    family: r.family as string,
    worth: int(r.worth),
    interrupt: int(r.interrupt),
  }));
}

export type FamilyFunnel = {
  family: string;
  pairs: number;
  judged: number;
  worth: number;
  dropped: number;
  unjudged: number;
};

export async function funnelByFamily(
  operators: readonly string[],
): Promise<FamilyFunnel[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT split_part(e.kind, '.', 1) AS family,
           count(*)::int AS pairs,
           count(*) FILTER (WHERE m.judged_at IS NOT NULL)::int AS judged,
           count(*) FILTER (WHERE m.route IN ('interrupt', 'briefing'))::int AS worth,
           count(*) FILTER (WHERE m.route = 'drop')::int AS dropped,
           count(*) FILTER (WHERE m.judged_at IS NULL)::int AS unjudged
    FROM event_match m
    JOIN cohort c ON c.id = m.trip_id
    JOIN world_event e ON e.id = m.event_id
    GROUP BY 1 ORDER BY 1
  `);
  return rows.rows.map((r) => ({
    family: r.family as string,
    pairs: int(r.pairs),
    judged: int(r.judged),
    worth: int(r.worth),
    dropped: int(r.dropped),
    unjudged: int(r.unjudged),
  }));
}

export type Tally = { label: string; n: number };

export async function routeReasonMix(
  operators: readonly string[],
): Promise<Tally[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT m.route_reason AS label, count(*)::int AS n
    FROM event_match m JOIN cohort c ON c.id = m.trip_id
    WHERE m.route_reason IS NOT NULL
    GROUP BY 1 ORDER BY n DESC
  `);
  return rows.rows.map((r) => ({ label: r.label as string, n: int(r.n) }));
}

/** Why verdicts were refused. The earliest signal that a prompt edit went wrong. */
export async function rejectionMix(
  operators: readonly string[],
): Promise<Tally[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT r->>'reason' AS label, count(*)::int AS n
    FROM event_match m
    JOIN cohort c ON c.id = m.trip_id,
         jsonb_array_elements(COALESCE(m.rejections, '[]'::jsonb)) AS r
    GROUP BY 1 ORDER BY n DESC
  `);
  return rows.rows.map((r) => ({ label: r.label as string, n: int(r.n) }));
}

export async function generationMix(
  operators: readonly string[],
): Promise<Tally[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT g.source AS label, count(*)::int AS n
    FROM trip_generation g JOIN cohort c ON c.id = g.trip_id
    GROUP BY 1 ORDER BY n DESC
  `);
  return rows.rows.map((r) => ({ label: r.label as string, n: int(r.n) }));
}

export const RADIUS_BUCKETS_KM = [1, 3, 5, 10] as const;

export type RadiusRow = {
  family: string;
  /** Upper edge of the bucket in km; `null` is the open-ended last one. */
  upToKm: number | null;
  worth: number;
  dropped: number;
  unjudged: number;
};

/**
 * Distance from the event to the stop, by whether the pair was worth sending.
 * If everything worth sending sits in the first buckets, the radius beyond
 * them is buying only junk. Computed from the live geometries; an event that
 * has been purged takes its matches with it, so nothing here is silently
 * missing — it is simply gone.
 */
export async function radiusBuckets(
  operators: readonly string[],
): Promise<RadiusRow[]> {
  const [b1, b2, b3, b4] = RADIUS_BUCKETS_KM;
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT split_part(e.kind, '.', 1) AS family,
           CASE
             WHEN d <= ${b1 * 1000} THEN ${b1}
             WHEN d <= ${b2 * 1000} THEN ${b2}
             WHEN d <= ${b3 * 1000} THEN ${b3}
             WHEN d <= ${b4 * 1000} THEN ${b4}
           END AS up_to_km,
           count(*) FILTER (WHERE m.route IN ('interrupt', 'briefing'))::int AS worth,
           count(*) FILTER (WHERE m.route = 'drop')::int AS dropped,
           count(*) FILTER (WHERE m.judged_at IS NULL)::int AS unjudged
    FROM event_match m
    JOIN cohort c ON c.id = m.trip_id
    JOIN world_event e ON e.id = m.event_id
    JOIN trip_node n ON n.id = m.node_id
    CROSS JOIN LATERAL (SELECT ST_Distance(e.geom, n.geom) AS d) dist
    GROUP BY 1, 2 ORDER BY 1, 2 NULLS LAST
  `);
  return rows.rows.map((r) => ({
    family: r.family as string,
    upToKm: r.up_to_km === null ? null : int(r.up_to_km),
    worth: int(r.worth),
    dropped: int(r.dropped),
    unjudged: int(r.unjudged),
  }));
}

export type SpendRow = {
  purpose: string;
  model: string;
  /** Attributed to a cohort trip, as against the floor (news reading, spikes, operators' own trips). */
  cohort: boolean;
  calls: number;
  failed: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  avgLatencyMs: number;
};

export async function spend(
  operators: readonly string[],
  since: Date,
): Promise<SpendRow[]> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT mc.purpose, mc.model,
           (mc.trip_id IN (SELECT id FROM cohort)) AS in_cohort,
           count(*)::int AS calls,
           count(*) FILTER (WHERE NOT mc.ok)::int AS failed,
           sum(mc.input_tokens)::bigint AS input_tokens,
           sum(mc.cached_input_tokens)::bigint AS cached_input_tokens,
           sum(mc.output_tokens)::bigint AS output_tokens,
           sum(mc.reasoning_tokens)::bigint AS reasoning_tokens,
           avg(mc.latency_ms)::int AS avg_latency_ms
    FROM model_call mc
    WHERE mc.created_at >= ${since.toISOString()}::timestamptz
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
  `);
  return rows.rows.map((r) => ({
    purpose: r.purpose as string,
    model: r.model as string,
    cohort: Boolean(r.in_cohort),
    calls: int(r.calls),
    failed: int(r.failed),
    inputTokens: int(r.input_tokens),
    cachedInputTokens: int(r.cached_input_tokens),
    outputTokens: int(r.output_tokens),
    reasoningTokens: int(r.reasoning_tokens),
    avgLatencyMs: int(r.avg_latency_ms),
  }));
}

export async function surveyCounts(
  operators: readonly string[],
  now: Date,
): Promise<{ eligible: number; answered: number; yes: number }> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT count(*) FILTER (WHERE c.ends_at < ${now.toISOString()}::timestamptz)::int AS eligible,
           count(s.trip_id)::int AS answered,
           count(*) FILTER (WHERE s.would_pay)::int AS yes
    FROM cohort c LEFT JOIN trip_survey s ON s.trip_id = c.id
  `);
  const r = rows.rows[0] ?? {};
  return {
    eligible: int(r.eligible),
    answered: int(r.answered),
    yes: int(r.yes),
  };
}

export type PipelinePulse = {
  senseAt: string | null;
  judgedAt: string | null;
  briefedAt: string | null;
};

/** When each stage last did something. Whole system, not the cohort: it asks whether the machine is running. */
export async function pipelinePulse(): Promise<PipelinePulse> {
  const rows = await db.execute(sql`
    SELECT (SELECT max(observed_at) FROM world_event) AS sense_at,
           (SELECT max(judged_at) FROM event_match) AS judged_at,
           (SELECT max(composed_at) FROM briefing) AS briefed_at
  `);
  const r = rows.rows[0] ?? {};
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    senseAt: iso(r.sense_at),
    judgedAt: iso(r.judged_at),
    briefedAt: iso(r.briefed_at),
  };
}

// ---------------------------------------------------------------------------
// The audit

export type AuditCandidate = { matchId: string; family: string };

/**
 * Verdicts the router would send, on watched trips, that nobody has audited.
 * Not limited to the cohort: the graduation rule needs a week of audited
 * verdicts before any traveller exists, and each audit records whether it was
 * in the cohort so the kill row can still be restricted to it.
 */
export async function unauditedCandidates(): Promise<AuditCandidate[]> {
  const rows = await db.execute(sql`
    SELECT m.id, split_part(e.kind, '.', 1) AS family
    FROM event_match m
    JOIN world_event e ON e.id = m.event_id
    JOIN watch_pass p ON p.trip_id = m.trip_id
    WHERE m.route IN ('interrupt', 'briefing')
      AND NOT EXISTS (SELECT 1 FROM verdict_audit a WHERE a.match_id = m.id)
  `);
  return rows.rows.map((r) => ({
    matchId: r.id as string,
    family: r.family as string,
  }));
}

export type AuditSubject = {
  matchId: string;
  tripId: string;
  inCohort: boolean;
  kind: string;
  route: string;
  verdict: unknown;
  event: {
    source: string;
    severity: string;
    confidence: number;
    validFrom: string;
    validTo: string | null;
    observedAt: string | null;
    payload: unknown;
  };
  stop: { title: string | null; placeName: string | null; startsAt: string };
  tripTitle: string;
};

export async function auditSubject(
  matchId: string,
  operators: readonly string[],
): Promise<AuditSubject | null> {
  const rows = await db.execute(sql`
    ${withCohort(operators)}
    SELECT m.id, m.trip_id, m.route, m.verdict,
           (m.trip_id IN (SELECT id FROM cohort)) AS in_cohort,
           e.kind, e.source, e.severity, e.confidence, e.valid_from, e.valid_to,
           e.observed_at, e.payload,
           n.starts_at AS stop_starts_at, n.meta->>'title' AS stop_title,
           p.name AS place_name, t.title AS trip_title
    FROM event_match m
    JOIN world_event e ON e.id = m.event_id
    JOIN trip_node n ON n.id = m.node_id
    JOIN trip t ON t.id = m.trip_id
    LEFT JOIN place p ON p.id = n.place_id
    WHERE m.id = ${matchId} AND m.verdict IS NOT NULL
  `);
  const r = rows.rows[0];
  if (!r) return null;
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    matchId: r.id as string,
    tripId: r.trip_id as string,
    inCohort: Boolean(r.in_cohort),
    kind: r.kind as string,
    route: r.route as string,
    verdict: r.verdict,
    event: {
      source: r.source as string,
      severity: r.severity as string,
      confidence: Number(r.confidence),
      validFrom: iso(r.valid_from) as string,
      validTo: iso(r.valid_to),
      observedAt: iso(r.observed_at),
      payload: r.payload,
    },
    stop: {
      title: (r.stop_title as string | null) ?? null,
      placeName: (r.place_name as string | null) ?? null,
      startsAt: iso(r.stop_starts_at) as string,
    },
    tripTitle: r.trip_title as string,
  };
}

export type AuditStats = {
  family: string;
  audited: number;
  wrong: number;
  auditedInCohort: number;
  wrongInCohort: number;
  reasons: Tally[];
};

export async function auditStats(): Promise<AuditStats[]> {
  const rows = await db.execute(sql`
    SELECT family,
           count(*)::int AS audited,
           count(*) FILTER (WHERE NOT correct)::int AS wrong,
           count(*) FILTER (WHERE in_cohort)::int AS audited_in_cohort,
           count(*) FILTER (WHERE in_cohort AND NOT correct)::int AS wrong_in_cohort
    FROM verdict_audit GROUP BY 1 ORDER BY 1
  `);
  const reasons = await db.execute(sql`
    SELECT family, reason AS label, count(*)::int AS n
    FROM verdict_audit WHERE NOT correct AND reason IS NOT NULL
    GROUP BY 1, 2 ORDER BY n DESC
  `);
  return rows.rows.map((r) => ({
    family: r.family as string,
    audited: int(r.audited),
    wrong: int(r.wrong),
    auditedInCohort: int(r.audited_in_cohort),
    wrongInCohort: int(r.wrong_in_cohort),
    reasons: reasons.rows
      .filter((x) => x.family === r.family)
      .map((x) => ({ label: x.label as string, n: int(x.n) })),
  }));
}

/** When each family first produced an event: how long it has been running, for the graduation rule. */
export async function familyFirstSeen(): Promise<Map<string, string>> {
  const rows = await db.execute(sql`
    SELECT split_part(kind, '.', 1) AS family, min(observed_at) AS first_seen
    FROM world_event GROUP BY 1
  `);
  return new Map(
    rows.rows.map((r) => [
      r.family as string,
      new Date(r.first_seen as string).toISOString(),
    ]),
  );
}
