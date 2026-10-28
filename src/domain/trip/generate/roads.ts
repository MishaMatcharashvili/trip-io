import type { LonLat } from "../../geo.ts";
import type { TravelEstimator } from "../travel.ts";
import { type Constraints, routeOf } from "./constraints.ts";
import { type Leg, routeLegs } from "./feasibility.ts";
import type { Candidate } from "./plan.ts";

// Long drives, and where they stop. Nobody drives Tbilisi to Batumi without
// stopping for fuel, a coffee and the toilet, and the highway's big stations —
// Wissol and Gulf at Gori, SOCAR at Argveta — each have a market and somewhere
// to eat. The scheduler stops at one about every two hours of driving
// (schedule.ts); which stations lie along the road is the data layer's to find
// (src/dal/places.ts). A rest is not the composer's to plan: it is part of the
// drive, like the drive's length.

/** About this often a drive stops, on travel.ts's estimate. */
export const REST_EVERY_MIN = 120;
/** For this long: fuel, a coffee, the toilet. */
export const REST_STOP_MIN = 30;
/** Closer than this to the end, it drives on: arriving is the rest. */
export const REST_LAST_MIN = 60;
/**
 * How far either side of when a rest falls due a station may be. Wide: the
 * Rikoti Pass has no station the catalogue knows, and Kutaisi to Tbilisi
 * rests at Gori, three hours in on the estimate, or not at all.
 */
const REST_WINDOW_MIN = 75;
/** Further out of the way than this, a station is on some other road. */
const DETOUR_FACTOR = 1.1;
const DETOUR_SLACK_MIN = 10;
/** A big brand's station is worth driving on this much longer for. */
const BIG_STATION_MIN = 30;

/** A drive this long has a rest in it, when there is a station where one falls due. */
export const ROAD_STOP_DRIVE_MIN = REST_EVERY_MIN + REST_LAST_MIN;

/** The chains whose highway stations have a market and a café, in either script. */
const BIG_STATIONS = [
  "wissol",
  "socar",
  "gulf",
  "rompetrol",
  "lukoil",
  "ვისოლ",
  "სოკარ",
  "გალფ",
  "რომპეტროლ",
  "ლუკოილ",
];

export const isBigStation = (s: Pick<Candidate, "name" | "brand">) => {
  const said = `${s.name} ${s.brand ?? ""}`.toLowerCase();
  return BIG_STATIONS.some((b) => said.includes(b));
};

/**
 * Where a drive from one point to another stops, in order: about every
 * REST_EVERY_MIN, at the station nearest that point that is on the way,
 * a big brand's before a pump by the road. A rest that falls due where there
 * is no station is not made up, and the drive goes on without it.
 */
export function restStops(
  from: LonLat,
  to: LonLat,
  stations: readonly Candidate[],
  travel: TravelEstimator,
): Candidate[] {
  const chosen: Candidate[] = [];
  let here = from;
  for (
    let ahead = travel.minutes(here, to);
    ahead >= ROAD_STOP_DRIVE_MIN;
    ahead = travel.minutes(here, to)
  ) {
    const [best] = stations
      .filter((s) => !chosen.includes(s))
      .map((s) => ({
        s,
        out: travel.minutes(here, s.lonLat),
        on: travel.minutes(s.lonLat, to),
      }))
      .filter(
        ({ out, on }) =>
          Math.abs(out - REST_EVERY_MIN) <= REST_WINDOW_MIN &&
          on >= REST_LAST_MIN &&
          on < ahead &&
          out + on <= ahead * DETOUR_FACTOR + DETOUR_SLACK_MIN,
      )
      .map((c) => ({
        ...c,
        score:
          Math.abs(c.out - REST_EVERY_MIN) -
          (isBigStation(c.s) ? BIG_STATION_MIN : 0),
      }))
      .sort((a, b) => a.score - b.score || (a.s.id < b.s.id ? -1 : 1));
    if (!best) break;
    chosen.push(best.s);
    here = best.s.lonLat;
  }
  return chosen;
}

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
