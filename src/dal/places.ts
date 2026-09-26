import { sql } from "drizzle-orm";
import { categoryGroup, isOutdoor } from "../domain/catalogue/categories.ts";
import {
  type AreaMatch,
  areaBySlug,
  type FocusAreaSlug,
} from "../domain/catalogue/focus-areas.ts";
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
 * still being built. Verified places are dealt round-robin across categories,
 * most confident first, so a dense category (Tbilisi has hundreds of cafés)
 * cannot fill the prompt on its own. The validator checks the tier again when
 * the plan is written (context/architecture.md, place.tier).
 */
export async function candidatesInArea(
  slug: FocusAreaSlug,
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
        AND ${areaPredicate(areaBySlug(slug).match)}
    ) ranked
    ORDER BY tier = 'curated' DESC, rank, name
    LIMIT ${limit}
  `);
  return rows.rows.map((r) => {
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
      area: slug,
    } satisfies Candidate;
  });
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
