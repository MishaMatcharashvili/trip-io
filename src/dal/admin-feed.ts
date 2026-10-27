import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// What the pipeline takes in, as the operator's panel reads it: the articles
// the news detectors fetched (`source_item`) and the world events every
// detector wrote (`world_event`), with the region each belongs to. Read-only,
// newest first, capped; the panel filters and sorts what comes back.

export const FEED_LIMIT = 2_000;

const int = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : new Date(v as string).toISOString();

export type ArticleRow = {
  id: string;
  source: string;
  url: string;
  language: string;
  publishedAt: string | null;
  fetchedAt: string;
  status: "new" | "empty" | "rejected" | "published";
  reason: string | null;
  headline: string;
  /** What was printed, as fetched, cut for the table. */
  original: string;
  /** The English the extractor read, when it has read it. */
  english: string | null;
  claims: number;
  /** Regions and kinds of the events this article is cited by. */
  regions: string[];
  kinds: string[];
};

export async function listArticles(): Promise<{
  rows: ArticleRow[];
  total: number;
}> {
  const [rows, total] = await Promise.all([
    db.execute(sql`
      WITH cited AS (
        SELECT o->>'url' AS url, o->>'id' AS outlet, e.kind,
               COALESCE(r.name, split_part(e.dedupe_key, '|', 3)) AS region
        FROM world_event e
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(e.payload->'outlets') = 'array'
               THEN e.payload->'outlets' ELSE '[]'::jsonb END
        ) o
        LEFT JOIN region r ON r.slug = split_part(e.dedupe_key, '|', 3)
      ),
      by_url AS (
        SELECT url, outlet,
               array_agg(DISTINCT region) AS regions,
               array_agg(DISTINCT kind) AS kinds
        FROM cited GROUP BY url, outlet
      )
      SELECT si.id, si.source, si.url, si.language, si.published_at,
             si.fetched_at, si.status, si.reason,
             left(split_part(COALESCE(si.text, si.original_text), E'\n', 1), 240)
               AS headline,
             left(si.original_text, 3000) AS original,
             left(si.text, 3000) AS english,
             CASE WHEN jsonb_typeof(si.extraction) = 'array'
                  THEN jsonb_array_length(si.extraction) ELSE 0 END AS claims,
             COALESCE(c.regions, ARRAY[]::text[]) AS regions,
             COALESCE(c.kinds, ARRAY[]::text[]) AS kinds
      FROM source_item si
      LEFT JOIN by_url c ON c.url = si.url AND c.outlet = si.source
      ORDER BY si.fetched_at DESC
      LIMIT ${FEED_LIMIT}
    `),
    db.execute(sql`SELECT count(*)::int AS n FROM source_item`),
  ]);
  return {
    total: int(total.rows[0]?.n),
    rows: rows.rows.map((r) => ({
      id: r.id as string,
      source: r.source as string,
      url: r.url as string,
      language: r.language as string,
      publishedAt: iso(r.published_at),
      fetchedAt: iso(r.fetched_at) as string,
      status: r.status as ArticleRow["status"],
      reason: (r.reason as string | null) ?? null,
      headline: r.headline as string,
      original: r.original as string,
      english: (r.english as string | null) ?? null,
      claims: int(r.claims),
      regions: r.regions as string[],
      kinds: r.kinds as string[],
    })),
  };
}

export type EventRow = {
  id: string;
  source: string;
  kind: string;
  severity: string;
  confidence: number;
  validFrom: string;
  validTo: string | null;
  observedAt: string;
  payload: Record<string, unknown>;
  regionSlug: string | null;
  regionName: string | null;
  isoRegion: string | null;
  /** Stop-event pairs the matcher made from it. */
  matches: number;
  /** Distinct trips those pairs belong to. */
  trips: number;
  /** Pairs the judge found worth telling someone about. */
  worth: number;
};

/**
 * World events with the region they apply to. A forecast or an article's event
 * names its region in the dedupe key; a road or rail report names a corridor
 * or a route there instead, so it has no region of its own; an opening-hours
 * report is placed by the place it is about.
 */
export async function listEvents(): Promise<{
  rows: EventRow[];
  total: number;
}> {
  const [rows, total] = await Promise.all([
    db.execute(sql`
      SELECT e.id, e.source, e.kind, e.severity, e.confidence, e.valid_from,
             e.valid_to, e.observed_at, e.payload,
             COALESCE(r.slug, hr.slug) AS region_slug,
             COALESCE(r.name, hr.name) AS region_name,
             COALESCE(r.iso_region, hr.iso_region) AS iso_region,
             COALESCE(m.pairs, 0) AS matches, COALESCE(m.trips, 0) AS trips,
             COALESCE(m.worth, 0) AS worth
      FROM world_event e
      LEFT JOIN region r ON r.slug = split_part(e.dedupe_key, '|', 3)
      LEFT JOIN place p ON e.kind = 'hours.closed'
                       AND p.id::text = e.payload->>'placeId'
      LEFT JOIN region hr ON p.id IS NOT NULL
                         AND ST_Within(p.geom::geometry, hr.geom::geometry)
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS pairs, count(DISTINCT trip_id)::int AS trips,
               count(*) FILTER (WHERE route IN ('briefing', 'interrupt'))::int
                 AS worth
        FROM event_match WHERE event_id = e.id
      ) m ON true
      ORDER BY e.observed_at DESC
      LIMIT ${FEED_LIMIT}
    `),
    db.execute(sql`SELECT count(*)::int AS n FROM world_event`),
  ]);
  return {
    total: int(total.rows[0]?.n),
    rows: rows.rows.map((r) => ({
      id: r.id as string,
      source: r.source as string,
      kind: r.kind as string,
      severity: r.severity as string,
      confidence: Number(r.confidence),
      validFrom: iso(r.valid_from) as string,
      validTo: iso(r.valid_to),
      observedAt: iso(r.observed_at) as string,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      regionSlug: (r.region_slug as string | null) ?? null,
      regionName: (r.region_name as string | null) ?? null,
      isoRegion: (r.iso_region as string | null) ?? null,
      matches: int(r.matches),
      trips: int(r.trips),
      worth: int(r.worth),
    })),
  };
}

export type SourceActivity = {
  source: string;
  total: number;
  last24h: number;
  lastAt: string | null;
  /** Articles only: how the extractor settled them. */
  published: number;
  empty: number;
  rejected: number;
  unread: number;
};

/** What each news outlet has delivered, and what became of it. */
export async function articleSources(): Promise<SourceActivity[]> {
  const rows = await db.execute(sql`
    SELECT source, count(*)::int AS total,
           count(*) FILTER (WHERE fetched_at > now() - interval '24 hours')::int AS last24h,
           max(fetched_at) AS last_at,
           count(*) FILTER (WHERE status = 'published')::int AS published,
           count(*) FILTER (WHERE status = 'empty')::int AS empty,
           count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
           count(*) FILTER (WHERE status = 'new')::int AS unread
    FROM source_item GROUP BY source
  `);
  return rows.rows.map((r) => ({
    source: r.source as string,
    total: int(r.total),
    last24h: int(r.last24h),
    lastAt: iso(r.last_at),
    published: int(r.published),
    empty: int(r.empty),
    rejected: int(r.rejected),
    unread: int(r.unread),
  }));
}

/** What each detector has written as world events. */
export async function eventSources(): Promise<SourceActivity[]> {
  const rows = await db.execute(sql`
    SELECT source, count(*)::int AS total,
           count(*) FILTER (WHERE observed_at > now() - interval '24 hours')::int AS last24h,
           max(observed_at) AS last_at
    FROM world_event GROUP BY source
  `);
  return rows.rows.map((r) => ({
    source: r.source as string,
    total: int(r.total),
    last24h: int(r.last24h),
    lastAt: iso(r.last_at),
    published: 0,
    empty: 0,
    rejected: 0,
    unread: 0,
  }));
}

export type RegionSummary = {
  slug: string;
  name: string;
  nameKa: string;
  kind: string;
  isoRegion: string;
  /** Trips with a stop in the region that has not finished yet. */
  tripsAhead: number;
  /** Trips that ever had a stop in it. */
  tripsEver: number;
  events: number;
  activeEvents: number;
  /** The worst severity among events live now, or null when none are. */
  worstActive: string | null;
  lastObservedAt: string | null;
  pairs: number;
};

const SEVERITIES = ["minor", "moderate", "severe", "extreme"] as const;

/** All sixty-four sensing regions, with what is going on in each. */
export async function regionSummaries(): Promise<RegionSummary[]> {
  const rows = await db.execute(sql`
    WITH ev AS (
      SELECT split_part(e.dedupe_key, '|', 3) AS slug, count(*)::int AS total,
             count(*) FILTER (WHERE live)::int AS active,
             max(e.observed_at) AS last_at,
             max(CASE e.severity WHEN 'minor' THEN 0 WHEN 'moderate' THEN 1
                                 WHEN 'severe' THEN 2 ELSE 3 END)
               FILTER (WHERE live) AS worst
      FROM world_event e
      CROSS JOIN LATERAL (
        SELECT e.valid_from <= now()
               AND (e.valid_to IS NULL OR e.valid_to >= now()) AS live
      ) l
      GROUP BY 1
    ),
    pairs AS (
      SELECT split_part(e.dedupe_key, '|', 3) AS slug, count(*)::int AS n
      FROM event_match m JOIN world_event e ON e.id = m.event_id GROUP BY 1
    ),
    tr AS (
      SELECT r.slug, count(DISTINCT n.trip_id)::int AS ever,
             count(DISTINCT n.trip_id)
               FILTER (WHERE n.starts_at >= now() - interval '1 hour')::int AS ahead
      FROM region r JOIN trip_node n ON ST_Intersects(r.geom, n.geom)
      GROUP BY r.slug
    )
    SELECT r.slug, r.name, r.name_ka, r.kind, r.iso_region,
           COALESCE(tr.ahead, 0) AS ahead, COALESCE(tr.ever, 0) AS ever,
           COALESCE(ev.total, 0) AS events, COALESCE(ev.active, 0) AS active,
           ev.worst, ev.last_at, COALESCE(pairs.n, 0) AS pairs
    FROM region r
    LEFT JOIN ev ON ev.slug = r.slug
    LEFT JOIN pairs ON pairs.slug = r.slug
    LEFT JOIN tr ON tr.slug = r.slug
    ORDER BY r.name
  `);
  return rows.rows.map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    nameKa: r.name_ka as string,
    kind: r.kind as string,
    isoRegion: r.iso_region as string,
    tripsAhead: int(r.ahead),
    tripsEver: int(r.ever),
    events: int(r.events),
    activeEvents: int(r.active),
    worstActive:
      r.worst === null || r.worst === undefined
        ? null
        : (SEVERITIES[Number(r.worst)] ?? null),
    lastObservedAt: iso(r.last_at),
    pairs: int(r.pairs),
  }));
}
