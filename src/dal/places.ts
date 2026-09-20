import { sql } from "drizzle-orm";
import { categoryGroup, isOutdoor } from "@/domain/catalogue/categories.ts";
import {
  type AreaMatch,
  areaBySlug,
  type FocusAreaSlug,
} from "@/domain/catalogue/focus-areas.ts";
import { openingHours } from "@/domain/catalogue/opening-hours.ts";
import type { PlaceInput } from "@/domain/catalogue/review-input.ts";
import type { LonLat } from "@/domain/geo.ts";
import type { Candidate } from "@/domain/trip/generate/plan.ts";
import { areaPredicate, list } from "./area-predicate.ts";
import { db } from "./client.ts";
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

export type Decision = "curate" | "reject" | "skip";

/** A reject or a skip: the log row alone, the place untouched. */
export async function recordDecision(
  placeId: string,
  decision: Exclude<Decision, "curate">,
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
 * Curated places in one focus area — what trip generation may compose from. The
 * tier filter is what makes "the model cannot name a place it wasn't given" mean
 * something; the validator enforces it again when the plan is written
 * (context/architecture.md, place.tier).
 */
export async function curatedInArea(
  slug: FocusAreaSlug,
  limit: number,
): Promise<Candidate[]> {
  const rows = await db.execute(sql`
    SELECT p.id, p.name, p.category, p.opening_hours,
           ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat
    FROM place p
    WHERE p.tier = 'curated' AND ${areaPredicate(areaBySlug(slug).match)}
    ORDER BY p.name
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
      tier: "curated" as const,
      lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
      openingHours: parsed?.success ? parsed.data : null,
      outdoor: isOutdoor(category),
      area: slug,
    } satisfies Candidate;
  });
}
