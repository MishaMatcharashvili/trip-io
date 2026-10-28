import { sql } from "drizzle-orm";
import {
  type CategoryGroup,
  categoryGroup,
  categoryGroups,
  isOutdoor,
} from "../domain/catalogue/categories.ts";
import type { AreaMatch } from "../domain/catalogue/focus-areas.ts";
import {
  type OpeningHours,
  openingHours,
} from "../domain/catalogue/opening-hours.ts";
import type {
  PlaceInput,
  ReviewInput,
} from "../domain/catalogue/review-input.ts";
import type { LonLat } from "../domain/geo.ts";
import type { Candidate } from "../domain/trip/generate/plan.ts";
import {
  ROAD_END_MARGIN_M,
  ROAD_MEAL_DETOUR_M,
  ROAD_MEALS,
  ROAD_MEALS_PER_DRIVE,
  ROAD_SIGHT_DETOUR_M,
  ROAD_SIGHTS,
  ROAD_SIGHTS_PER_DRIVE,
  ROAD_STOP_SPAN,
  STATION_OFF_ROAD_M,
  STATIONS_PER_ROAD,
} from "../domain/trip/generate/roads.ts";
import type { PlaceInfo } from "../domain/trip/validate.ts";
import { areaPredicate, list } from "./area-predicate.ts";
import { db, type Queryable } from "./client.ts";
import { place, placeReview } from "./schema/index.ts";

// The `place` table and its append-only review log. Every query that reads or
// writes a catalogue place lives here; callers pass domain values (a focus
// area's match, a category ranking) and get plain rows back.

const latestReview = sql`
  SELECT DISTINCT ON (place_id) place_id, decision, note
  FROM place_review
  ORDER BY place_id, created_at DESC
`;

/** A place as the curation queue shows it. */
export type QueueRow = {
  id: string;
  name: string;
  nameKa: string | null;
  category: string;
  tier: "verified" | "raw";
  lon: number;
  lat: number;
  attrs: {
    group?: string;
    // Null when Overture had none (the extract keeps NULLs).
    confidence?: number | null;
    websites?: string[];
    phones?: string[];
    socials?: string[];
    emails?: string[];
    address?: string | null;
    locality?: string | null;
    brand?: string | null;
  };
  lastDecision: "skip" | null;
  lastNote: string | null;
};

export type ReviewQueueQuery = {
  area: AreaMatch;
  /** Categories to include. Undefined means every allowed category. */
  categories?: readonly string[];
  /** Category buckets in the order the queue should work through them. */
  rank: readonly (readonly string[])[];
  limit: number;
};

/**
 * Places still awaiting a decision in one area: not curated, and with no review
 * or a skip as their latest. Skips sort last so they come back round only once
 * the untouched candidates are gone.
 */
export async function reviewQueue(
  query: ReviewQueueQuery,
): Promise<{ places: QueueRow[]; pending: number }> {
  const inGroup = query.categories
    ? sql`p.category IN (${list(query.categories)})`
    : sql`TRUE`;
  const groupRank = sql.join(
    [
      sql`CASE`,
      ...query.rank.map(
        (categories, i) =>
          sql`WHEN p.category IN (${list(categories)}) THEN ${i}`,
      ),
      sql`ELSE ${query.rank.length} END`,
    ],
    sql` `,
  );

  const pendingFrom = sql`
    FROM place p
    LEFT JOIN (${latestReview}) l ON l.place_id = p.id
    WHERE p.tier <> 'curated'
      AND (l.decision IS NULL OR l.decision = 'skip')
      AND ${areaPredicate(query.area)}
      AND ${inGroup}
  `;

  const [rows, counts] = await Promise.all([
    db.execute<QueueRow>(sql`
      SELECT
        p.id, p.name, p.name_ka AS "nameKa", p.category, p.tier,
        ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat,
        p.attrs, l.decision AS "lastDecision", l.note AS "lastNote"
      ${pendingFrom}
      ORDER BY
        l.decision IS NOT NULL,
        p.tier = 'raw',
        ${groupRank},
        (p.attrs->>'confidence')::float DESC NULLS LAST,
        p.id
      LIMIT ${query.limit}
    `),
    db.execute<{ pending: number }>(
      sql`SELECT count(*)::int AS pending ${pendingFrom}`,
    ),
  ]);

  return { places: rows.rows, pending: counts.rows[0].pending };
}

/** How far verification has got in one area. */
export async function reviewCounts(
  area: AreaMatch,
): Promise<{ curated: number; pending: number }> {
  const result = await db.execute<{ curated: number; pending: number }>(sql`
    SELECT
      count(*) FILTER (WHERE p.tier = 'curated')::int AS curated,
      count(*) FILTER (
        WHERE p.tier <> 'curated' AND (l.decision IS NULL OR l.decision = 'skip')
      )::int AS pending
    FROM place p
    LEFT JOIN (${latestReview}) l ON l.place_id = p.id
    WHERE ${areaPredicate(area)}
  `);
  return result.rows[0];
}

export async function placeExists(placeId: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM place WHERE id = ${placeId}`);
  return rows.rows.length > 0;
}

const curatedColumns = (input: PlaceInput, reviewerId: string) => ({
  name: input.name,
  nameKa: input.nameKa || null,
  category: input.category,
  geom: sql`ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography`,
  openingHours: input.openingHours,
  tier: "curated" as const,
  verifiedAt: new Date(),
  verifiedBy: reviewerId,
});

/** A reject or a skip: the log row alone, the place untouched. */
export async function recordDecision(
  placeId: string,
  decision: Exclude<ReviewInput["decision"], "curate">,
  reviewerId: string,
  note: string | undefined,
): Promise<void> {
  await db.insert(placeReview).values({ placeId, decision, reviewerId, note });
}

/**
 * Promotes a place to `curated` and logs the review. One batch, so a curated
 * place always has its review row and vice versa.
 */
export async function curateExisting(
  placeId: string,
  input: PlaceInput,
  reviewerId: string,
): Promise<void> {
  await db.batch([
    db
      .update(place)
      .set(curatedColumns(input, reviewerId))
      .where(sql`${place.id} = ${placeId}`),
    db.insert(placeReview).values({
      placeId,
      decision: "curate",
      reviewerId,
      note: input.note,
    }),
  ]);
}

/** A place Overture doesn't have. Goes straight to the curated tier. */
export async function insertCurated(
  input: PlaceInput,
  reviewerId: string,
): Promise<string> {
  // Id minted here so both rows go in one batch (one transaction).
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(place).values({
      id,
      ...curatedColumns(input, reviewerId),
      source: "manual",
      attrs: { addedVia: "curation" },
    }),
    db.insert(placeReview).values({
      placeId: id,
      decision: "curate",
      reviewerId,
      note: input.note,
    }),
  ]);
  return id;
}

/**
 * What trip generation may compose from in one focus area: every curated place
 * first, then verified ones to fill in while the hand-verified catalogue is
 * still being built. Fuel stations are not among them: a drive stops at one, a
 * day is not spent at one (roads.ts). Verified places are dealt round-robin across categories,
 * most confident first, so a dense category (Tbilisi has hundreds of cafés)
 * cannot fill the prompt on its own. The validator checks the tier again when
 * the plan is written (context/architecture.md, place.tier).
 */
export async function candidatesInArea(
  { slug, match }: { slug: string; match: AreaMatch },
  limit: number,
): Promise<Candidate[]> {
  const rows = await db.execute(sql`
    SELECT id, name, category, tier, opening_hours, lon, lat
    FROM (
      SELECT p.id, p.name, p.category, p.tier, p.opening_hours,
             ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat,
             row_number() OVER (
               PARTITION BY p.tier, p.category
               ORDER BY (p.attrs->>'confidence')::float DESC NULLS LAST, p.name
             ) AS rank
      FROM place p
      WHERE p.tier IN ('curated', 'verified')
        AND p.category NOT IN (${list(categoryGroups.services)})
        AND ${areaPredicate(match)}
    ) ranked
    ORDER BY tier = 'curated' DESC, rank, name
    LIMIT ${limit}
  `);
  return rows.rows.map((r) => ({
    ...candidateOf(r),
    area: slug,
    areas: [slug],
  }));
}

/** A candidate row as the planner sees it, before it is told where it is. */
function candidateOf(
  r: Record<string, unknown>,
): Omit<Candidate, "area" | "areas"> {
  const parsed = r.opening_hours
    ? openingHours.safeParse(r.opening_hours)
    : null;
  const category = r.category as string;
  return {
    id: r.id as string,
    name: r.name as string,
    category,
    group: categoryGroup[category as keyof typeof categoryGroup],
    tier: r.tier as Candidate["tier"],
    lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
    openingHours: parsed?.success ? parsed.data : null,
    outdoor: isOutdoor(category),
  };
}

/** A line as PostGIS reads it, longitude first. */
export const lineWkt = (line: readonly LonLat[]) =>
  `LINESTRING(${line.map(([lon, lat]) => `${lon} ${lat}`).join(", ")})`;

/**
 * The fuel stations a plan may rest at along a routed road, in the order the
 * road passes them, with their chain when the source names one. Which of them
 * a drive stops at is the scheduler's to choose (rests.ts).
 */
export async function stationsAlong(
  road: readonly LonLat[],
  conn: Queryable = db,
): Promise<Candidate[]> {
  if (road.length < 2) return [];
  const rows = await conn.execute(sql`
    WITH road AS (SELECT ST_GeogFromText(${lineWkt(road)}) AS g)
    SELECT p.id, p.name, p.category, p.tier, p.opening_hours,
           p.attrs->>'brand' AS brand,
           ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat
    FROM place p, road
    WHERE p.tier IN ('curated', 'verified')
      AND p.category IN (${list(categoryGroups.services)})
      AND ST_DWithin(p.geom, road.g, ${STATION_OFF_ROAD_M})
    ORDER BY ST_LineLocatePoint(road.g::geometry, p.geom::geometry)
    LIMIT ${STATIONS_PER_ROAD}
  `);
  return rows.rows.map((r) => ({
    ...candidateOf(r),
    area: "",
    areas: [],
    ...(typeof r.brand === "string" && r.brand ? { brand: r.brand } : {}),
  }));
}

export type RoadsideQuery = {
  /** The drive's label (roads.ts, driveLabel), carried by every place found. */
  label: string;
  /** The road as routed, simplified. */
  road: readonly LonLat[];
  /** Where it leaves from and where it goes: nothing in or beside either is on the way. */
  ends: readonly { lonLat: LonLat; match: AreaMatch }[];
};

/**
 * Places to stop at on a long drive (src/domain/trip/generate/roads.ts): sights
 * within a detour of the road and restaurants beside it, curated first, then
 * a spread of categories, most confident first. Nothing in the town the drive
 * leaves or the one it reaches: those are the trip's own places.
 */
export async function roadsideCandidates(
  { label, road, ends }: RoadsideQuery,
  conn: Queryable = db,
): Promise<Candidate[]> {
  if (road.length < 2) return [];
  const notAtEnds = ends.map(
    (end) => sql`
      AND NOT ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(${end.lonLat[0]}, ${end.lonLat[1]}), 4326)::geography, ${ROAD_END_MARGIN_M})
      AND NOT (${areaPredicate(end.match)})`,
  );
  const rows = await conn.execute(sql`
    WITH road AS (SELECT ST_GeogFromText(${lineWkt(road)}) AS g)
    SELECT id, name, category, tier, opening_hours, lon, lat
    FROM (
      SELECT *, row_number() OVER (
               PARTITION BY meal
               ORDER BY tier = 'curated' DESC, spread, confidence DESC NULLS LAST, name
             ) AS rank
      FROM (
        SELECT p.id, p.name, p.category, p.tier, p.opening_hours,
               ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat,
               p.category IN (${list(ROAD_MEALS)}) AS meal,
               (p.attrs->>'confidence')::float AS confidence,
               row_number() OVER (
                 PARTITION BY p.category
                 ORDER BY (p.attrs->>'confidence')::float DESC NULLS LAST, p.name
               ) AS spread
        FROM place p, road
        WHERE p.tier IN ('curated', 'verified')
          AND (
            (p.category IN (${list(ROAD_SIGHTS)}) AND ST_DWithin(p.geom, road.g, ${ROAD_SIGHT_DETOUR_M}))
            OR (p.category IN (${list(ROAD_MEALS)}) AND ST_DWithin(p.geom, road.g, ${ROAD_MEAL_DETOUR_M}))
          )
          AND ST_LineLocatePoint(road.g::geometry, p.geom::geometry)
              BETWEEN ${ROAD_STOP_SPAN[0]}::float AND ${ROAD_STOP_SPAN[1]}::float
          ${sql.join(notAtEnds, sql` `)}
      ) found
    ) ranked
    WHERE rank <= CASE WHEN meal THEN ${ROAD_MEALS_PER_DRIVE}::int ELSE ${ROAD_SIGHTS_PER_DRIVE}::int END
    ORDER BY meal, rank
  `);
  return rows.rows.map((r) => ({
    ...candidateOf(r),
    area: label,
    areas: [],
    roads: [label],
  }));
}

export type NearbyQuery = {
  /** Where a provider pinned the places it listed. */
  near: readonly LonLat[];
  radiusM: number;
  categories: readonly string[];
  area: AreaMatch;
};

/**
 * Places a plan may use, of the given categories, in one area, within
 * `radiusM` of any of the points: which catalogue places a review site's
 * listings might be (src/domain/catalogue/ratings.ts decides which are).
 */
export async function plannableNear(
  { near, radiusM, categories, area }: NearbyQuery,
  conn: Queryable = db,
): Promise<(Omit<Candidate, "area" | "areas"> & { nameKa: string | null })[]> {
  if (!near.length || !categories.length) return [];
  const points = `MULTIPOINT(${near.map(([lon, lat]) => `(${lon} ${lat})`).join(", ")})`;
  const rows = await conn.execute(sql`
    SELECT p.id, p.name, p.name_ka, p.category, p.tier, p.opening_hours,
           ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat
    FROM place p
    WHERE p.tier IN ('curated', 'verified')
      AND p.category IN (${list(categories)})
      AND ST_DWithin(p.geom, ST_GeogFromText(${points}), ${radiusM})
      AND ${areaPredicate(area)}
  `);
  return rows.rows.map((r) => ({
    ...candidateOf(r),
    nameKa: (r.name_ka as string | null) ?? null,
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids worth asking the catalogue about. `place.id` is a uuid column, and
 * Postgres answers `id IN ('p7')` with a type error rather than an empty
 * result — so an id a model invented, or a client mistyped, would crash the
 * query that exists to report it as unknown. Anything not uuid-shaped cannot be
 * a place, and is simply not found.
 */
const lookupable = (ids: readonly string[]) =>
  ids.filter((id) => UUID.test(id));

/** Catalogue facts the validator needs, for every place a document mentions. */
export async function placeFacts(
  ids: readonly string[],
  conn: Queryable = db,
): Promise<Map<string, PlaceInfo>> {
  const wanted = lookupable(ids);
  if (wanted.length === 0) return new Map();
  const rows = await conn.execute(sql`
    SELECT id, tier, opening_hours,
           ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
    FROM place WHERE id IN (${list(wanted)})
  `);
  return new Map(
    rows.rows.map((r) => {
      const hours = r.opening_hours
        ? openingHours.safeParse(r.opening_hours)
        : null;
      return [
        r.id as string,
        {
          tier: r.tier as PlaceInfo["tier"],
          openingHours: hours?.success ? hours.data : null,
          lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
        },
      ];
    }),
  );
}

/** Names for a handful of catalogue ids. What the briefing shows a swap as. */
export async function placeNames(
  ids: readonly string[],
  conn: Queryable = db,
): Promise<Map<string, string>> {
  const wanted = lookupable(ids);
  if (wanted.length === 0) return new Map();
  const rows = await conn.execute(sql`
    SELECT id, name FROM place WHERE id IN (${list(wanted)})
  `);
  return new Map(rows.rows.map((r) => [r.id as string, r.name as string]));
}

export type PlaceCard = {
  id: string;
  name: string;
  nameKa: string | null;
  category: string;
  tier: PlaceInfo["tier"];
  lonLat: LonLat;
  openingHours: OpeningHours | null;
  address: string | null;
  website: string | null;
  phone: string | null;
};

const firstOf = (value: unknown): string | null =>
  Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;

/** What a place screen shows about each place: name, kind, contacts, hours. */
export async function placeCards(
  ids: readonly string[],
): Promise<Map<string, PlaceCard>> {
  const wanted = lookupable(ids);
  if (wanted.length === 0) return new Map();
  const rows = await db.execute(sql`
    SELECT id, name, name_ka, category, tier, opening_hours, attrs,
           ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
    FROM place WHERE id IN (${list(wanted)})
  `);
  return new Map(
    rows.rows.map((r) => {
      const hours = r.opening_hours
        ? openingHours.safeParse(r.opening_hours)
        : null;
      const attrs = (r.attrs ?? {}) as Record<string, unknown>;
      return [
        r.id as string,
        {
          id: r.id as string,
          name: r.name as string,
          nameKa: (r.name_ka as string | null) ?? null,
          category: r.category as string,
          tier: r.tier as PlaceInfo["tier"],
          lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
          openingHours: hours?.success ? hours.data : null,
          address: typeof attrs.address === "string" ? attrs.address : null,
          website: firstOf(attrs.websites),
          phone: firstOf(attrs.phones),
        },
      ];
    }),
  );
}

export type PlaceHit = {
  id: string;
  name: string;
  nameKa: string | null;
  category: string;
  group: CategoryGroup;
  tier: PlaceInfo["tier"];
  lonLat: LonLat;
  outdoor: boolean;
  /** From `near`, when one was given. */
  distanceM: number | null;
  /** How sure the source is that it exists, 0 to 1, when it said. Search only. */
  confidence?: number | null;
  /** How many websites of its own are listed. Search only. */
  websites?: number;
};

export type PlaceSearch = {
  /** Matched against the name in either script; empty browses. */
  q?: string;
  near?: LonLat;
  area?: AreaMatch;
  groups?: readonly CategoryGroup[];
  limit: number;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The catalogue as a traveller searches it: adding a stop, browsing a region.
 * Every tier is searchable (a traveller may add any place); curated places
 * come first, then names that start with the query, then the nearest.
 */
export async function searchPlaces(search: PlaceSearch): Promise<PlaceHit[]> {
  const q = search.q?.trim() ?? "";
  const pattern = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const near = search.near
    ? sql`ST_SetSRID(ST_MakePoint(${search.near[0]}, ${search.near[1]}), 4326)::geography`
    : null;
  const categories = search.groups?.flatMap(
    (g) => categoryGroups[g] as readonly string[],
  );

  const rows = await db.execute(sql`
    SELECT p.id, p.name, p.name_ka, p.category, p.tier,
           ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat,
           ${near ? sql`ST_Distance(p.geom, ${near})` : sql`NULL`} AS distance_m,
           (p.attrs->>'confidence')::float AS confidence,
           CASE WHEN jsonb_typeof(p.attrs->'websites') = 'array'
                THEN jsonb_array_length(p.attrs->'websites') ELSE 0 END AS websites
    FROM place p
    WHERE TRUE
      ${q ? sql`AND (p.name ILIKE ${pattern} OR p.name_ka ILIKE ${pattern})` : sql``}
      ${search.area ? sql`AND ${areaPredicate(search.area)}` : sql``}
      ${categories?.length ? sql`AND p.category IN (${list(categories)})` : sql``}
    ORDER BY CASE p.tier WHEN 'curated' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END,
             ${q ? sql`(p.name ILIKE ${prefix}) DESC,` : sql``}
             ${near ? sql`ST_Distance(p.geom, ${near}),` : sql``}
             (p.attrs->>'confidence')::float DESC NULLS LAST,
             p.name
    LIMIT ${search.limit}
  `);
  return rows.rows.map((r) => {
    const category = r.category as string;
    return {
      id: r.id as string,
      name: r.name as string,
      nameKa: (r.name_ka as string | null) ?? null,
      category,
      group: categoryGroup[category as keyof typeof categoryGroup],
      tier: r.tier as PlaceInfo["tier"],
      lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
      outdoor: isOutdoor(category),
      distanceM: r.distance_m === null ? null : Number(r.distance_m),
      confidence: r.confidence === null ? null : Number(r.confidence),
      websites: Number(r.websites ?? 0),
    };
  });
}

/** How many places the catalogue holds in one area, by tier a plan may use. */
export async function countInArea(
  match: AreaMatch,
): Promise<{ curated: number; verified: number }> {
  const rows = await db.execute(sql`
    SELECT count(*) FILTER (WHERE p.tier = 'curated')::int AS curated,
           count(*) FILTER (WHERE p.tier = 'verified')::int AS verified
    FROM place p WHERE ${areaPredicate(match)}
  `);
  const r = rows.rows[0] ?? {};
  return {
    curated: (r.curated as number) ?? 0,
    verified: (r.verified as number) ?? 0,
  };
}

/**
 * The best-attested places of the given categories in one area, at most
 * `perCategory` of each, curated first: what the planner on /new recommends
 * from before any trip is composed.
 */
export async function sightsInArea(
  match: AreaMatch,
  categories: readonly string[],
  perCategory: number,
): Promise<{ name: string; category: string }[]> {
  if (!categories.length) return [];
  const rows = await db.execute(sql`
    SELECT name, category
    FROM (
      SELECT p.name, p.category, p.tier,
             (p.attrs->>'confidence')::float AS confidence,
             row_number() OVER (
               PARTITION BY p.category
               ORDER BY p.tier = 'curated' DESC,
                        (p.attrs->>'confidence')::float DESC NULLS LAST, p.name
             ) AS rank
      FROM place p
      WHERE p.tier IN ('curated', 'verified')
        AND p.category IN (${list(categories)})
        AND ${areaPredicate(match)}
    ) ranked
    WHERE rank <= ${perCategory}
    ORDER BY tier = 'curated' DESC, confidence DESC NULLS LAST, name
  `);
  return rows.rows.map((r) => ({
    name: r.name as string,
    category: r.category as string,
  }));
}
