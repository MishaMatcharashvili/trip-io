import { isOpenThroughout } from "../../catalogue/opening-hours.ts";
import type { LonLat } from "../../geo.ts";
import type { Pace, TripNode } from "../document.ts";
import { CIVIL, sunWindow } from "../sun.ts";
import type { TravelEstimator } from "../travel.ts";
import { IMPLICIT_LEG_MAX_MIN, LEG_BUFFER_MIN } from "../validate.ts";
import type { Candidate, Plan, Slot } from "./plan.ts";

// Untimed plan → timed trip nodes. Deterministic: the model output, a cached
// plan and the fallback plan all go through here, and the validator checks the
// result either way. Whatever can't be placed is reported, never forced in —
// problems go back to the model on the retry, or make the fallback drop a stop.

const DAY_START: Record<Pace, string> = {
  relaxed: "09:30",
  moderate: "09:00",
  packed: "08:00",
};

/** Earliest and latest start per slot, Tbilisi wall-clock. Morning opens at the pace's day start. */
const SLOT_WINDOW: Record<Slot, [string | null, string]> = {
  morning: [null, "12:00"],
  midday: ["12:30", "14:30"],
  afternoon: ["14:30", "18:00"],
  evening: ["19:00", "21:30"],
};
const slotOrder: Slot[] = ["morning", "midday", "afternoon", "evening"];

const STAY_CHECK_IN_MIN = 15;
const SHIFT_STEP_MIN = 15;

const MIN = 60_000;
const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** Georgia is UTC+4 year-round; wall-clock times are built with that offset. */
const wall = (day: string, hhmm: string) =>
  Date.parse(`${day}T${hhmm}:00+04:00`);

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
};

export function schedule(input: ScheduleInput): {
  nodes: Record<string, TripNode>;
  problems: ScheduleProblem[];
} {
  const { plan, startDate, pace, places, travel, newId } = input;
  const nodes: Record<string, TripNode> = {};
  const problems: ScheduleProblem[] = [];
  let baseId: string | null = null;

  const node = (fields: Omit<TripNode, "meta"> & { title: string }) => {
    const { title, ...rest } = fields;
    nodes[newId()] = { ...rest, meta: { title, urban: false } };
  };

  for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
    const date = addDays(startDate, day.day - 1);
    const sun = (at: LonLat) => sunWindow(date, at, CIVIL);
    const problem = (placeId: string, message: string) =>
      problems.push({ day: date, placeId, message });

    let cursor = wall(date, DAY_START[pace]);
    let here: LonLat | null = baseId
      ? (places.get(baseId)?.lonLat ?? null)
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
      const drive = leg > IMPLICIT_LEG_MAX_MIN ? roundUp5(leg * MIN) : 0;
      const driveStart = roundUp5(cursor);
      const ready = drive
        ? driveStart + drive
        : cursor + (leg > 0 ? (leg + LEG_BUFFER_MIN) * MIN : 0);

      const [open, latest] = SLOT_WINDOW[stop.slot];
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
          `"${place.name}" can't be fitted into the ${stop.slot} (${stop.durationMin} min): closed or after dark`,
        );
        continue;
      }
      if (drive && light && driveStart + drive > light.set.getTime()) {
        problem(
          stop.placeId,
          `the drive to "${place.name}" would end after dark`,
        );
        continue;
      }

      if (drive) {
        node({
          kind: "transfer",
          placeId: null,
          lonLat: place.lonLat,
          startsAt: new Date(driveStart).toISOString(),
          durationMin: drive / MIN,
          indoor: false,
          title: `Drive to ${place.name}`,
        });
      }
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
    }

    // A multi-night base is one stay node: only a new base gets a check-in.
    if (day.stayId && day.stayId !== baseId) {
      const stay = places.get(day.stayId);
      if (!stay) {
        problem(day.stayId, "not among the candidate places");
        continue;
      }
      const leg = here ? travel.minutes(here, stay.lonLat) : 0;
      let checkIn = roundUp5(cursor);
      if (leg > IMPLICIT_LEG_MAX_MIN) {
        const drive = roundUp5(leg * MIN);
        node({
          kind: "transfer",
          placeId: null,
          lonLat: stay.lonLat,
          startsAt: new Date(checkIn).toISOString(),
          durationMin: drive / MIN,
          indoor: false,
          title: `Drive to ${stay.name}`,
        });
        checkIn += drive;
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

  return { nodes, problems };
}
