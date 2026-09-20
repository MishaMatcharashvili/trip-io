import { sql } from "drizzle-orm";
import { db } from "../../../dal/client.ts";
import { areaBySlug, areaPredicate } from "../../catalogue/area-query.ts";
import { categoryGroup, isOutdoor } from "../../catalogue/categories.ts";
import type { FocusAreaSlug } from "../../catalogue/focus-areas.ts";
import {
  type OpeningHours,
  openingHours,
  summariseHours,
} from "../../catalogue/opening-hours.ts";
import type { LonLat } from "../../geo.ts";
import type { Candidate } from "./plan.ts";

// What the model may choose from. Only `curated` places: the tier is what makes
// "the model cannot name a place it wasn't given" mean something, and it is
// enforced again by the validator when the plan is written
// (context/architecture.md, place.tier).

/** Enough for a two-week trip without flooding the prompt. */
export const CANDIDATE_LIMIT = 150;

export async function loadCandidates(
  areas: readonly FocusAreaSlug[],
  limit = CANDIDATE_LIMIT,
): Promise<Candidate[]> {
  const perArea = Math.max(20, Math.ceil(limit / Math.max(1, areas.length)));

  const results = await Promise.all(
    areas.map(async (slug) => {
      const rows = await db.execute(sql`
        SELECT p.id, p.name, p.category, p.opening_hours,
               ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat
        FROM place p
        WHERE p.tier = 'curated' AND ${areaPredicate(areaBySlug(slug).match)}
        ORDER BY p.name
        LIMIT ${perArea}
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
    }),
  );

  // A place on the boundary of two areas comes back once, under the first.
  const seen = new Set<string>();
  return results.flat().filter((c) => !seen.has(c.id) && seen.add(c.id));
}

/** The hours line the model sees; unknown hours are said to be unknown. */
export const describeHours = (c: { openingHours: OpeningHours | null }) =>
  c.openingHours ? summariseHours(c.openingHours) : "hours unknown";
