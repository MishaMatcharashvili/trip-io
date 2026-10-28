import { sightsInArea } from "../dal/places.ts";
import {
  destination,
  destinationName,
  mentions,
} from "../domain/catalogue/destinations.ts";
import type { Interest } from "../domain/trip/generate/constraints.ts";
import {
  type IntakeState,
  SIGHTS_PER_INTEREST,
  type Sights,
  sightCategories,
} from "../domain/trip/generate/intake.ts";

// What there is to see in the places the conversation on /new is about: the
// route the traveller gave, and the places their latest message names. The
// planner recommends from it; it never decides what the trip is composed of.

/** More places than this in play and the planner is choosing, not recommending. */
const PLACES_MAX = 4;

export async function sightsInPlay(
  state: IntakeState,
  latest: string,
  find: typeof sightsInArea = sightsInArea,
): Promise<Sights> {
  const slugs = [
    ...new Set([
      ...(state.said.includes("places") ? state.constraints.places : []),
      ...mentions(latest).map((m) => m.slug),
    ]),
  ].slice(0, PLACES_MAX);
  const all = Object.values(sightCategories).flat();
  const interestOf = (category: string) =>
    (Object.keys(sightCategories) as Interest[]).find((i) =>
      (sightCategories[i] as readonly string[]).includes(category),
    );

  const found = await Promise.all(
    slugs.flatMap((slug) => {
      const d = destination(slug);
      if (!d) return [];
      return find(d.match, all, SIGHTS_PER_INTEREST).then((rows) => {
        const byInterest: Partial<Record<Interest, string[]>> = {};
        for (const row of rows) {
          const i = interestOf(row.category);
          if (!i) continue;
          const names = byInterest[i] ?? [];
          byInterest[i] = names;
          if (names.length < SIGHTS_PER_INTEREST && !names.includes(row.name)) {
            names.push(row.name);
          }
        }
        return [[destinationName(slug), byInterest] as const];
      });
    }),
  );
  return Object.fromEntries(found.flat());
}
