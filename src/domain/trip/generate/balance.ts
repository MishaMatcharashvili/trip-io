import type { Interest } from "./constraints.ts";
import type { Candidate, Plan } from "./plan.ts";
import { addDays } from "./schedule.ts";

// Days that lean on museums when nobody asked for them. A museum is always
// open, always indoors and always in the catalogue, so a model filling a day
// reaches for one, then another: the traveller who said "food and hiking"
// gets two galleries in Tbilisi. Like idle.ts, this is feedback for the
// composer, not a validator rule: a town with nothing else is still a day.

/** What a traveller who chose "culture" came for, and nobody else needs twice a day. */
const MUSEUMS = new Set(["museum", "art_gallery"]);

/** Museums and galleries a day may have when "culture" is not among the interests. */
export const MAX_MUSEUMS_A_DAY = 1;

export type Imbalance = {
  /** YYYY-MM-DD, Tbilisi. */
  day: string;
  /** Said to the model on a retry. */
  message: string;
};

export function museumHeavy(
  plan: Plan,
  places: ReadonlyMap<string, Candidate>,
  c: { interests: readonly Interest[]; startDate: string },
): Imbalance[] {
  if (c.interests.includes("culture")) return [];
  const asked = c.interests.length
    ? `who asked for ${c.interests.join(", ")}, not museums`
    : "who has not said they want museums";
  return plan.days.flatMap((d) => {
    const museums = d.stops
      .filter((s) => s.kind === "visit")
      .map((s) => places.get(s.placeId))
      .filter((p): p is Candidate => !!p && MUSEUMS.has(p.category));
    if (museums.length <= MAX_MUSEUMS_A_DAY) return [];
    const day = addDays(c.startDate, d.day - 1);
    return [
      {
        day,
        message: `${day}: ${museums.length} museums and galleries (${museums.map((m) => `"${m.name}"`).join(", ")}) for a traveller ${asked}. Keep at most ${MAX_MUSEUMS_A_DAY}, and put a view, a walk, a church, a market or a winery in place of the rest`,
      },
    ];
  });
}

/** Somewhere to get a coffee or buy food, not to sit down to lunch or dinner. */
const NOT_A_MEAL = new Set(["coffee_shop", "farmers_market"]);

/** Stages: what they are for is a performance in the evening, not a look round. */
const STAGES = new Set([
  "theatre_venue",
  "music_venue",
  "performing_arts_venue",
]);

/**
 * Stops in the wrong place for what they are: lunch at a coffee shop, a
 * theatre visited in the afternoon, or at all by someone who never asked for
 * one. Feedback for the composer, like the museums above.
 */
export function misplaced(
  plan: Plan,
  places: ReadonlyMap<string, Candidate>,
  c: { interests: readonly Interest[]; startDate: string },
): Imbalance[] {
  const culture = c.interests.includes("culture");
  return plan.days.flatMap((d) => {
    const day = addDays(c.startDate, d.day - 1);
    return d.stops.flatMap((s) => {
      const p = places.get(s.placeId);
      if (!p) return [];
      if (s.kind === "meal" && NOT_A_MEAL.has(p.category)) {
        return [
          {
            day,
            message: `${day}: the ${s.slot} meal is at "${p.name}", a ${p.category.replace(/_/g, " ")}, which serves no meal. Put it at a restaurant or an eatery nearby`,
          },
        ];
      }
      if (s.kind === "visit" && STAGES.has(p.category)) {
        if (!culture) {
          return [
            {
              day,
              message: `${day}: "${p.name}" is a stage, for a traveller who did not ask for theatre or music. Put a sight, a view, a walk, a church, a market or a winery in its place`,
            },
          ];
        }
        if (s.slot !== "evening") {
          return [
            {
              day,
              message: `${day}: "${p.name}" is a stage, visited in the ${s.slot}. A performance is in the evening: move it there, or put a sight in its place`,
            },
          ];
        }
      }
      return [];
    });
  });
}
