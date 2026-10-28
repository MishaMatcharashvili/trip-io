import type { LonLat } from "../../geo.ts";
import type { TravelEstimator } from "../travel.ts";
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
    ahead >= REST_EVERY_MIN + REST_LAST_MIN;
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

/** How long a drive takes with its rests: the legs between stations, and half an hour at each. */
export function restedMinutes(
  from: LonLat,
  to: LonLat,
  stations: readonly Candidate[],
  travel: TravelEstimator,
): number {
  const rests = restStops(from, to, stations, travel);
  let here = from;
  let minutes = 0;
  for (const at of [...rests.map((s) => s.lonLat), to]) {
    minutes += travel.minutes(here, at);
    here = at;
  }
  return minutes + rests.length * REST_STOP_MIN;
}
