import { curatedInArea } from "@/dal/places.ts";
import type { FocusAreaSlug } from "@/domain/catalogue/focus-areas.ts";
import {
  CANDIDATE_LIMIT,
  CANDIDATES_PER_AREA_MIN,
} from "@/domain/trip/generate/candidates.ts";
import type { Candidate } from "@/domain/trip/generate/plan.ts";

// Generating a trip: gather what the planner may choose from, run the pipeline,
// write the result. The pipeline itself is pure and lives in the domain; this is
// where it meets the catalogue and the log.

/**
 * Curated places across the requested areas, spread evenly so one dense area
 * can't crowd the others out of the prompt. A place on the boundary of two areas
 * comes back once, under the first.
 */
export async function loadCandidates(
  areas: readonly FocusAreaSlug[],
  limit = CANDIDATE_LIMIT,
): Promise<Candidate[]> {
  const perArea = Math.max(
    CANDIDATES_PER_AREA_MIN,
    Math.ceil(limit / Math.max(1, areas.length)),
  );
  const perAreaResults = await Promise.all(
    areas.map((slug) => curatedInArea(slug, perArea)),
  );

  const seen = new Set<string>();
  return perAreaResults.flat().filter((c) => !seen.has(c.id) && seen.add(c.id));
}
