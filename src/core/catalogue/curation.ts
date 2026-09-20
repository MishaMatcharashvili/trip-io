import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { place, placeReview } from "@/db/schema";
import { areaBySlug, areaPredicate, list } from "./area-query.ts";
import { type CategoryGroup, categoryGroups } from "./categories.ts";
import { type FocusAreaSlug, focusAreas } from "./focus-areas.ts";
import type { PlaceInput, ReviewInput } from "./review-input.ts";

// The hand-verification queue behind /curate. A place is in an area's queue while
// it isn't curated and its latest review is absent or a skip; skips sort last.

// Heritage and nature first: they're what itineraries are built around, and
// they're scarcest in Overture. Lodging last: plentiful, and rarely a trip node.
const groupOrder: CategoryGroup[] = [
  "heritage",
  "nature",
  "culture",
  "food",
  "transport",
  "lodging",
];

const latestReview = sql`
  SELECT DISTINCT ON (place_id) place_id, decision, note
  FROM place_review
  ORDER BY place_id, created_at DESC
`;

export type QueuePlace = {
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

export async function getQueue({
  area,
  group,
  limit = 20,
}: {
  area: FocusAreaSlug;
  group?: CategoryGroup;
  limit?: number;
}): Promise<{ places: QueuePlace[]; pending: number }> {
  const inArea = areaPredicate(areaBySlug(area).match);
  const inGroup = group
    ? sql`p.category IN (${list(categoryGroups[group])})`
    : sql`TRUE`;
  const groupRank = sql.join(
    [
      sql`CASE`,
      ...groupOrder.map(
        (g, i) =>
          sql`WHEN p.category IN (${list(categoryGroups[g])}) THEN ${i}`,
      ),
      sql`ELSE ${groupOrder.length} END`,
    ],
    sql` `,
  );

  const pendingFrom = sql`
    FROM place p
    LEFT JOIN (${latestReview}) l ON l.place_id = p.id
    WHERE p.tier <> 'curated'
      AND (l.decision IS NULL OR l.decision = 'skip')
      AND ${inArea}
      AND ${inGroup}
  `;

  const [rows, counts] = await Promise.all([
    db.execute<QueuePlace>(sql`
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
      LIMIT ${limit}
    `),
    db.execute<{ pending: number }>(
      sql`SELECT count(*)::int AS pending ${pendingFrom}`,
    ),
  ]);

  return { places: rows.rows, pending: counts.rows[0].pending };
}

export type AreaProgress = {
  slug: FocusAreaSlug;
  name: string;
  target: number;
  curated: number;
  pending: number;
};

export async function getProgress(): Promise<AreaProgress[]> {
  return Promise.all(
    focusAreas.map(async (area) => {
      const result = await db.execute<{ curated: number; pending: number }>(sql`
        SELECT
          count(*) FILTER (WHERE p.tier = 'curated')::int AS curated,
          count(*) FILTER (
            WHERE p.tier <> 'curated' AND (l.decision IS NULL OR l.decision = 'skip')
          )::int AS pending
        FROM place p
        LEFT JOIN (${latestReview}) l ON l.place_id = p.id
        WHERE ${areaPredicate(area.match)}
      `);
      const [{ curated, pending }] = result.rows;
      return {
        slug: area.slug,
        name: area.name,
        target: area.target,
        curated,
        pending,
      };
    }),
  );
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

/** Returns false when the place doesn't exist. */
export async function reviewPlace(
  placeId: string,
  input: ReviewInput,
  reviewerId: string,
): Promise<boolean> {
  const exists = await db.execute(
    sql`SELECT 1 FROM place WHERE id = ${placeId}`,
  );
  if (exists.rows.length === 0) return false;

  const review = db.insert(placeReview).values({
    placeId,
    decision: input.decision,
    reviewerId,
    note: input.decision === "curate" ? input.place.note : input.note,
  });

  if (input.decision === "curate") {
    // One HTTP round trip, one transaction: a curated place always has its
    // review row, and vice versa.
    await db.batch([
      db
        .update(place)
        .set(curatedColumns(input.place, reviewerId))
        .where(sql`${place.id} = ${placeId}`),
      review,
    ]);
  } else {
    await review;
  }
  return true;
}

/** A place Overture doesn't have. Goes straight to the curated tier. */
export async function addPlace(
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
