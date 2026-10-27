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
