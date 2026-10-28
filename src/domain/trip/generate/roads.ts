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

/** How one drive is told from another: Tbilisi to Kutaisi is not Kutaisi to Tbilisi. */
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

/** The road is sent to the database simplified to this, well inside STATION_OFF_ROAD_M. */
export const ROAD_SIMPLIFY_M = 250;
