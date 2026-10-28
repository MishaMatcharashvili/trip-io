import { destinationName } from "../../catalogue/destinations.ts";
import { type Constraints, routeOf } from "./constraints.ts";
import { type Leg, routeLegs } from "./feasibility.ts";
import type { Candidate, Plan } from "./plan.ts";

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

/** A drive this long without a break is sent back to the composer, if there is anywhere to stop. */
export const MUST_BREAK_DRIVE_MIN = 180;

const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

/**
 * Long drives the plan takes without stopping, when there was somewhere to
 * stop: told it may break a drive, a model fills the afternoon in Kutaisi and
 * sits in the car for four hours. Feedback for the composer, like balance.ts;
 * a plan that cannot fit a stop in is still a plan.
 */
export function unbrokenDrives(
  plan: Plan,
  places: ReadonlyMap<string, Candidate>,
  c: Pick<Constraints, "start" | "places" | "finish">,
): { message: string }[] {
  const stopped = new Set(
    plan.days.flatMap((d) =>
      d.stops.flatMap((s) => places.get(s.placeId)?.roads ?? []),
    ),
  );
  const onThe = (label: string) =>
    [...places.values()].filter(
      (p) => p.roads?.includes(label) && p.group !== "food",
    );
  return longDrives(c).flatMap((drive) => {
    const label = driveLabel(drive);
    const sights = onThe(label);
    if (
      drive.minutes < MUST_BREAK_DRIVE_MIN ||
      stopped.has(label) ||
      !sights.length
    ) {
      return [];
    }
    const named = sights
      .slice(0, 3)
      .map((p) => `"${p.name}"`)
      .join(", ");
    return [
      {
        message: `the ${hours(drive.minutes)} drive from ${destinationName(drive.from)} to ${destinationName(drive.to)} has no stop on the way. Break it at a candidate on the road "${label}" (${named}), with lunch nearby, and shorten the day's other stops to make room`,
      },
    ];
  });
}
