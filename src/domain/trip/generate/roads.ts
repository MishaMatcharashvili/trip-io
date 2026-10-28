import { type Constraints, routeOf } from "./constraints.ts";
import { type Leg, routeLegs } from "./feasibility.ts";
import { REST_EVERY_MIN, REST_LAST_MIN } from "./rests.ts";

// Long drives: which drives on a route have a rest in them (rests.ts), so
// that the stations along them are looked up (src/dal/places.ts).

/** A drive this long has a rest in it, when there is a station where one falls due. */
export const ROAD_STOP_DRIVE_MIN = REST_EVERY_MIN + REST_LAST_MIN;

/** A station further than this from the road is off it: a pump in town, not on the highway. */
export const STATION_OFF_ROAD_M = 500;
/** Enough for Tbilisi to Batumi, every station on the way. */
export const STATIONS_PER_ROAD = 80;

/** How a drive is named, on the stations found along it. */
export const driveLabel = (d: Pick<Leg, "from" | "to">) =>
  `${d.from} > ${d.to}`;

/**
 * The drives on a route long enough to rest on, in order, each once: a round
 * trip drives the same road both ways, and those are two drives.
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

/** Lunch on the road is a sit-down meal: a roadside "eatery" is as often a bakery or a doughnut stand. */
export const ROAD_MEALS = ["restaurant"] as const;

/** A sight may be this far off the road: Uplistsikhe is worth the detour. */
export const ROAD_SIGHT_DETOUR_M = 10_000;
/** Lunch is by the road. */
export const ROAD_MEAL_DETOUR_M = 2_500;
/** Closer than this to either end is still the town the drive left, or already the one it is going to. */
export const ROAD_END_MARGIN_M = 15_000;
/**
 * How far along the road, as a share of it, a stop may lie: a break twenty
 * minutes out of Tbilisi on a four-hour drive is not a break, and lunch there
 * is at ten in the morning.
 */
export const ROAD_STOP_SPAN = [0.15, 0.85] as const;
export const ROAD_SIGHTS_PER_DRIVE = 10;
export const ROAD_MEALS_PER_DRIVE = 6;
/** The road is sent to the database simplified to this, well inside the detours above. */
export const ROAD_SIMPLIFY_M = 250;
