import { type Constraints, routeOf } from "./constraints.ts";
import { type Leg, routeLegs } from "./feasibility.ts";

// Long drives, and what a traveller stops for on them. Tbilisi to Kutaisi is
// four hours in a car, and nobody drives it without a break: the break is
// Gori's fortress, Uplistsikhe or lunch by the highway. Which drives are offered
// places to stop at, and what counts as one, is decided here; the places along
// the road are found by the data layer (src/dal/places.ts, roadsideCandidates).

/** A drive at least this long (travel.ts's estimate) is offered places to stop on the way. */
export const ROAD_STOP_DRIVE_MIN = 90;

/** How a drive is named to the composer, and on the candidates found along it. */
export const driveLabel = (d: Pick<Leg, "from" | "to">) =>
  `${d.from} > ${d.to}`;

/**
 * The drives on a route worth breaking, in order, each once: a round trip
 * drives the same road both ways, and those are two drives.
 */
export function longDrives(
  c: Pick<Constraints, "start" | "places" | "finish">,
): Leg[] {
  const seen = new Set<string>();
  return routeLegs(routeOf(c)).filter((leg) => {
    const label = driveLabel(leg);
    if (leg.minutes < ROAD_STOP_DRIVE_MIN || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/**
 * What is worth getting out of the car for: what a town on the way is known
 * for, not its theatre or its cultural centre.
 */
export const ROAD_SIGHTS = [
  "castle",
  "fort",
  "historic_site",
  "monument",
  "christian_place_of_worship",
  "museum",
  "winery",
  "national_park",
  "nature_reserve",
  "lake",
  "waterfall",
  "mountain",
  "hot_springs",
] as const;

/** Lunch on the road is a sit-down meal, not a coffee. */
export const ROAD_MEALS = ["restaurant", "casual_eatery"] as const;

/** A sight may be this far off the road: Uplistsikhe is worth the detour. */
export const ROAD_SIGHT_DETOUR_M = 10_000;
/** Lunch is by the road. */
export const ROAD_MEAL_DETOUR_M = 2_500;
/** Closer than this to either end is still the town the drive left, or already the one it is going to. */
export const ROAD_END_MARGIN_M = 15_000;
export const ROAD_SIGHTS_PER_DRIVE = 10;
export const ROAD_MEALS_PER_DRIVE = 6;
/** The road is sent to the database simplified to this, well inside the detours above. */
export const ROAD_SIMPLIFY_M = 250;
