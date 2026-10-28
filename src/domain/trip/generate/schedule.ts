import { isOpenThroughout } from "../../catalogue/opening-hours.ts";
import type { LonLat } from "../../geo.ts";
import type { Pace, TripNode } from "../document.ts";
import { CIVIL, sunWindow } from "../sun.ts";
import type { TravelEstimator } from "../travel.ts";
import { IMPLICIT_LEG_MAX_MIN, LEG_BUFFER_MIN } from "../validate.ts";
import { DEFAULT_DAY_ENDS } from "./constraints.ts";
import type { Candidate, Plan, Slot } from "./plan.ts";
import { REST_STOP_MIN, restStops } from "./rests.ts";

// Untimed plan → timed trip nodes. Deterministic: the model output, a cached
// plan and the fallback plan all go through here, and the validator checks the
// result either way. Whatever can't be placed is reported, never forced in —
// problems go back to the model on the retry, or make the fallback drop a stop.

export const DAY_START: Record<Pace, string> = {
  relaxed: "09:30",
  moderate: "09:00",
  packed: "08:00",
};

/**
 * Earliest and latest start per slot, Tbilisi wall-clock. Morning opens at the
 * pace's day start, and no slot starts after the day ends: dinner at half six
 * is a day that ends at eight.
 */
export const SLOT_WINDOW: Record<Slot, [string | null, string]> = {
  morning: [null, "12:00"],
  midday: ["12:30", "14:30"],
  afternoon: ["14:30", "18:00"],
  evening: ["18:30", "21:30"],
};

/**
 * How long after the day ends the drive home may still be on the road. A day
 * that ends at eight with dinner in Sighnaghi gets back to Tbilisi at ten; a
 * day in Stepantsminda has to leave before dinner. Darkness is not the limit:
 * a drive after dusk is a warning (validate.ts), and a full day in October
 * would otherwise be over at four.
 */
export const HOME_BY_MIN = 120;
const slotOrder: Slot[] = ["morning", "midday", "afternoon", "evening"];

const STAY_CHECK_IN_MIN = 15;
const SHIFT_STEP_MIN = 15;

const MIN = 60_000;
const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** Georgia is UTC+4 year-round; wall-clock times are built with that offset. */
const wall = (day: string, hhmm: string) =>
  Date.parse(`${day}T${hhmm}:00+04:00`);
/** The other way: a moment as "HH:MM" on Tbilisi's wall clock. */
const hhmm = (ms: number) =>
  new Date(ms + 4 * 3_600_000).toISOString().slice(11, 16);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A station by its chain when its own name is a number: "Rompetrol · Gori 1". */
const stationName = (s: Candidate) =>
  s.brand && !s.name.toLowerCase().includes(s.brand.toLowerCase())
    ? `${s.brand} · ${s.name}`
    : s.name;

const mealTitle: Record<Slot, string> = {
  morning: "Breakfast",
  midday: "Lunch",
  afternoon: "Coffee",
  evening: "Dinner",
};

export type ScheduleProblem = {
  day: string;
  placeId: string;
  message: string;
};

export type ScheduleInput = {
  plan: Plan;
  startDate: string;
  pace: Pace;
  places: ReadonlyMap<string, Candidate>;
  travel: TravelEstimator;
  newId: () => string;
  /** Where the traveller arrives: the first day starts with the drive from here. */
  start?: LonLat | null;
  /** Where the traveller leaves from: the last day ends with the drive there. */
  finish?: { lonLat: LonLat; name: string } | null;
  /** "HH:MM": no stop starts after it, and no drive ends more than HOME_BY_MIN past it. */
  dayEnds?: string;
  /** Fuel stations along the trip's long drives, where a drive rests (rests.ts). */
  stations?: readonly Candidate[];
};

export function schedule(input: ScheduleInput): {
  nodes: Record<string, TripNode>;
  problems: ScheduleProblem[];
} {
  const { plan, startDate, pace, places, travel, newId } = input;
  const startAt = input.start ?? null;
  const finish = input.finish ?? null;
  const dayEnds = input.dayEnds ?? DEFAULT_DAY_ENDS;
  const nodes: Record<string, TripNode> = {};
  const problems: ScheduleProblem[] = [];
  let baseId: string | null = null;
  /** Where the last day ended, for the drive to the finish. */
  let tail: { date: string; cursor: number; here: LonLat | null } | null = null;
  let lastPlaceId = "";
  const days = [...plan.days].sort((a, b) => a.day - b.day);

  const node = (
    fields: Omit<TripNode, "meta"> & { title: string; rest?: boolean },
  ) => {
    const { title, rest, ...at } = fields;
    nodes[newId()] = {
      ...at,
      meta: { title, urban: false, ...(rest ? { rest } : {}) },
    };
  };

  const stations = input.stations ?? [];
  /** A drive, broken where it rests: its legs, and how long it takes all told. */
  const driveOf = (from: LonLat, to: LonLat) => {
    let here = from;
    const legs = [...restStops(from, to, stations, travel), null].map(
      (station) => {
        const at = station?.lonLat ?? to;
        const ms = roundUp5(travel.minutes(here, at) * MIN);
        here = at;
        return { ms, at, station };
      },
    );
    return {
      legs,
      ms: legs.reduce(
        (sum, l) => sum + l.ms + (l.station ? REST_STOP_MIN * MIN : 0),
        0,
      ),
    };
  };
  /** The drive as nodes from `start`: a transfer each leg, a rest stop between. */
  const driveNodes = (
    road: ReturnType<typeof driveOf>,
    start: number,
    name: string,
  ) => {
    let at = start;
    for (const leg of road.legs) {
      node({
        kind: "transfer",
        placeId: null,
        lonLat: leg.at,
        startsAt: new Date(at).toISOString(),
        durationMin: leg.ms / MIN,
        indoor: false,
        title: `Drive to ${leg.station ? stationName(leg.station) : name}`,
      });
      at += leg.ms;
      if (!leg.station) continue;
      node({
        kind: "visit",
        placeId: leg.station.id,
        lonLat: null,
        startsAt: new Date(at).toISOString(),
        durationMin: REST_STOP_MIN,
        indoor: true,
        title: `Rest stop · ${stationName(leg.station)}`,
        rest: true,
      });
      at += REST_STOP_MIN * MIN;
    }
  };

  for (const day of days) {
    const date = addDays(startDate, day.day - 1);
    const sun = (at: LonLat) => sunWindow(date, at, CIVIL);
    const problem = (placeId: string, message: string) =>
      problems.push({ day: date, placeId, message });
    const ends = wall(date, dayEnds);
    const homeBy = ends + HOME_BY_MIN * MIN;

    let cursor = wall(date, DAY_START[pace]);
    let here: LonLat | null = baseId
      ? (places.get(baseId)?.lonLat ?? null)
      : day === days[0]
        ? startAt
        : null;

    const stops = [...day.stops].sort(
      (a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot),
    );
    for (const stop of stops) {
      const place = places.get(stop.placeId);
      if (!place) {
        problem(stop.placeId, "not among the candidate places");
        continue;
      }

      const leg = here ? travel.minutes(here, place.lonLat) : 0;
      const road =
        here && leg > IMPLICIT_LEG_MAX_MIN ? driveOf(here, place.lonLat) : null;
      const drive = road?.ms ?? 0;
      const driveStart = roundUp5(cursor);
      const ready = drive
        ? driveStart + drive
        : cursor + (leg > 0 ? (leg + LEG_BUFFER_MIN) * MIN : 0);

      const [open, slotLatest] = SLOT_WINDOW[stop.slot];
      const latest = slotLatest < dayEnds ? slotLatest : dayEnds;
      const earliest = Math.max(
        roundUp5(ready),
        wall(date, open ?? DAY_START[pace]),
      );
      const light = sun(place.lonLat);
      const fits = (start: number) => {
        const end = start + stop.durationMin * MIN;
        if (
          place.openingHours &&
          !isOpenThroughout(place.openingHours, new Date(start), new Date(end))
        ) {
          return false;
        }
        const daylightBound = stop.kind === "visit" && place.outdoor;
        return (
          !daylightBound ||
          !light ||
          (start >= light.rise.getTime() && end <= light.set.getTime())
        );
      };

      // Try the earliest start, then each quarter hour up to the slot's latest.
      const step = SHIFT_STEP_MIN * MIN;
      let start = earliest;
      while (start <= wall(date, latest) && !fits(start)) {
        start = Math.floor(start / step) * step + step;
      }
      if (start > wall(date, latest)) {
        problem(
          stop.placeId,
          `"${place.name}" can't be fitted into the ${stop.slot} (${stop.durationMin} min): closed, after dark, or after the day ends at ${dayEnds}`,
        );
        continue;
      }
      if (drive && driveStart + drive > homeBy) {
        problem(
          stop.placeId,
          `the drive to "${place.name}" would end after ${hhmm(homeBy)}, too late in a day that ends at ${dayEnds}`,
        );
        continue;
      }

      if (road) driveNodes(road, driveStart, place.name);
      node({
        kind: stop.kind,
        placeId: place.id,
        lonLat: null,
        startsAt: new Date(start).toISOString(),
        durationMin: stop.durationMin,
        indoor: !place.outdoor,
        title:
          stop.kind === "meal"
            ? `${mealTitle[stop.slot]} · ${place.name}`
            : place.name,
      });
      cursor = start + stop.durationMin * MIN;
      here = place.lonLat;
      lastPlaceId = place.id;
    }

    // The last day of a trip that finishes elsewhere ends on the road, not in a bed.
    const leaves =
      day === days.at(-1) &&
      finish !== null &&
      here !== null &&
      travel.minutes(here, finish.lonLat) > IMPLICIT_LEG_MAX_MIN;
    tail = { date, cursor, here };
    if (leaves) continue;

    // A multi-night base is one stay node: only a new base gets a check-in.
    if (day.stayId && day.stayId !== baseId) {
      const stay = places.get(day.stayId);
      if (!stay) {
        problem(day.stayId, "not among the candidate places");
        continue;
      }
      const leg = here ? travel.minutes(here, stay.lonLat) : 0;
      let checkIn = roundUp5(cursor);
      if (here && leg > IMPLICIT_LEG_MAX_MIN) {
        const road = driveOf(here, stay.lonLat);
        driveNodes(road, checkIn, stay.name);
        checkIn += road.ms;
      } else if (leg > 0) {
        checkIn = roundUp5(cursor + (leg + LEG_BUFFER_MIN) * MIN);
      }
      node({
        kind: "stay",
        placeId: stay.id,
        lonLat: null,
        startsAt: new Date(checkIn).toISOString(),
        durationMin: STAY_CHECK_IN_MIN,
        indoor: true,
        title: `Check in · ${stay.name}`,
      });
      baseId = day.stayId;
    }
  }

  if (tail?.here && finish) {
    const leg = travel.minutes(tail.here, finish.lonLat);
    if (leg > IMPLICIT_LEG_MAX_MIN) {
      const road = driveOf(tail.here, finish.lonLat);
      const drive = road.ms;
      const driveStart = roundUp5(tail.cursor);
      const homeBy = wall(tail.date, dayEnds) + HOME_BY_MIN * MIN;
      if (driveStart + drive > homeBy) {
        problems.push({
          day: tail.date,
          placeId: lastPlaceId,
          // The time to leave by, not only that it is late: told just "end
          // earlier", a model cuts dinner and leaves the rest as it was.
          message: `the drive to ${finish.name} would end after ${hhmm(homeBy)}, too late in a day that ends at ${dayEnds}: it has to leave by ${hhmm(homeBy - drive)}, and the stops before it run until ${hhmm(driveStart)}. Drop or shorten stops so the last one ends by ${hhmm(homeBy - drive)}`,
        });
      }
      driveNodes(road, driveStart, finish.name);
    }
  }

  return { nodes, problems };
}
