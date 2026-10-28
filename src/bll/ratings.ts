import { plannableNear } from "../dal/places.ts";
import { countUse } from "../dal/usage.ts";
import { categoryGroups } from "../domain/catalogue/categories.ts";
import type { Destination } from "../domain/catalogue/destinations.ts";
import {
  type KeptRatings,
  matchRadiusM,
  type RatedKind,
  type RatedOutcome,
  type RatingSource,
  rateCatalogue,
  ratedGroups,
  ratedKinds,
} from "../domain/catalogue/ratings.ts";
import type { Candidate } from "../domain/trip/generate/plan.ts";

// What travellers rate best in the places a trip goes, matched to the
// catalogue, for the planner to choose by. One search per town and kind, kept
// for as long as the owner decided Google's answers are kept
// (docs/google-places.md), under a ceiling on the day's searches so a busy day
// cannot run up the bill. A rating is a preference: without one, because the
// source is unconfigured, over its limit or down, the trip is planned as before.

/** Searches, everyone together, per UTC day, unless the server says otherwise. */
export const RATING_SEARCHES_PER_DAY = 300;

const DAY = 86_400;

export type RatingDeps = {
  source: RatingSource;
  /** Without one nothing is kept, and every trip searches. */
  kept?: KeptRatings;
  ttlSeconds: number;
  perDay: number;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  near: typeof plannableNear;
};

export const ratingDefaults = (): Pick<
  RatingDeps,
  "perDay" | "count" | "now" | "near"
> => ({
  perDay: RATING_SEARCHES_PER_DAY,
  count: countUse,
  now: () => new Date(),
  near: plannableNear,
});

/** A town's list of one kind: kept, or searched for if the day allows. */
async function listings(
  d: Destination,
  kind: RatedKind,
  deps: RatingDeps,
): Promise<RatedOutcome> {
  const key = `${d.slug}:${kind}`;
  const kept = await deps.kept?.get(key).catch(() => null);
  if (kept) return kept;
  if (!deps.source.configured) return { ok: false, reason: "not-configured" };
  // Counted when a search is made, so a kept list costs nothing.
  const today = await deps.count(
    `ratings:${deps.source.provider}`,
    DAY,
    deps.now(),
  );
  if (today > deps.perDay) return { ok: false, reason: "quota" };

  const outcome = await deps.source.popular({
    kind,
    in: d.name,
    near: d.lonLat,
  });
  // Only a list is kept: a failure is asked again by the next trip.
  if (outcome.ok) {
    await deps.kept?.set(key, outcome, deps.ttlSeconds).catch(() => {});
  }
  return outcome;
}

/**
 * The catalogue places in one destination that travellers rate, each with its
 * rating, as candidates for that destination. Empty, never an error, when
 * there is nothing to rate by.
 */
export async function ratedInArea(
  d: Destination,
  deps: RatingDeps,
): Promise<Candidate[]> {
  const found = await Promise.all(
    ratedKinds.map(async (kind) => {
      const outcome = await listings(d, kind, deps).catch(() => null);
      if (!outcome?.ok || !outcome.places.length) return [];
      const catalogue = await deps
        .near({
          near: outcome.places.flatMap((p) => (p.lonLat ? [p.lonLat] : [])),
          radiusM: matchRadiusM[kind],
          categories: ratedGroups[kind].flatMap((g) => categoryGroups[g]),
          area: d.match,
        })
        .catch(() => []);
      const ratings = rateCatalogue(catalogue, outcome.places);
      return catalogue.flatMap(({ nameKa: _, ...place }): Candidate[] => {
        const rating = ratings.get(place.id);
        return rating
          ? [{ ...place, area: d.slug, areas: [d.slug], rating }]
          : [];
      });
    }),
  );
  return found.flat();
}
