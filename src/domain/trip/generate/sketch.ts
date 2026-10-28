import { type Constraints, routeOf } from "./constraints.ts";
import { type Leg, routeLegs } from "./feasibility.ts";
import { addDays, DAY_START } from "./schedule.ts";

// The trip as the conversation on /new has it so far, in numbers: which day is
// spent where, what each day drives, when the days start and end, and what the
// budget comes to for each person and day. No IO and no model: the planner is
// handed these numbers so that it quotes them instead of doing arithmetic it
// is bad at, and the browser draws the same sketch from the same request.
//
// It is a sketch, not the plan. The days are shared out evenly between the
// places; the composer, which knows what there is to see in each, decides.

export type SketchDay = {
  day: number;
  /** YYYY-MM-DD. */
  date: string;
  /** The destination slug the day is spent in. */
  place: string;
  /** The drives that day, in order: in from the start or the place before, out to the finish. */
  drives: Leg[];
  /** "HH:MM", by the pace. */
  starts: string;
  /** "HH:MM", when the traveller asked their days to end. */
  ends: string;
};

export type Sketch = {
  days: SketchDay[];
  /** Every drive in the trip, in minutes. */
  driveMinutes: number;
  people: number;
  /** The budget for one person for one day, in whole euros. */
  perPersonDay: number;
};

/**
 * Days per place, in order: an even share each, the days left over going to
 * the places first on the route. With fewer days than places, the places
 * that do not fit get none (feasibility.ts says why that cannot be done).
 */
export function shareDays(days: number, places: readonly string[]): string[] {
  if (!places.length) return [];
  const each = Math.floor(days / places.length);
  const extra = days % places.length;
  return places.flatMap((p, i) =>
    Array<string>(each + (i < extra ? 1 : 0)).fill(p),
  );
}

const drive = (from: string, to: string): Leg[] =>
  from === to ? [] : routeLegs([from, to]);

export function sketchTrip(c: Constraints): Sketch {
  const where = shareDays(c.days, c.places);
  const days = where.map((place, i): SketchDay => {
    const before = i === 0 ? c.start : where[i - 1];
    const last = i === where.length - 1;
    return {
      day: i + 1,
      date: addDays(c.startDate, i),
      place,
      drives: [
        ...drive(before, place),
        ...(last ? drive(place, c.finish) : []),
      ],
      starts: DAY_START[c.pace],
      ends: c.dayEnds,
    };
  });
  const people = c.party.adults + c.party.children;
  return {
    days,
    driveMinutes: routeLegs(routeOf(c)).reduce((sum, l) => sum + l.minutes, 0),
    people,
    perPersonDay: Math.round(c.budgetEur / c.days / people),
  };
}
