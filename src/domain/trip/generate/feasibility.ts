import {
  type Destination,
  destination,
  destinationName,
  unreachable,
} from "../../catalogue/destinations.ts";
import { haversineM } from "../../geo.ts";
import { straightLineTravel } from "../travel.ts";
import { type Constraints, routeOf } from "./constraints.ts";
import { addDays } from "./schedule.ts";

// Can this trip be done at all? Judged before a plan is attempted, from the
// request alone, so the answer is on screen while the traveller is still
// typing — and judged again on the server, which trusts nothing the screen
// sent. A request that cannot work is refused with the reason and what would
// make it work, never quietly bent into a different trip.
//
// The numbers are deliberately on the generous side of possible: a "no" here
// has to be one a traveller who knows Georgia would agree with. Money is never
// a "no": a family's spare room or a friend's car are things only the
// traveller knows, so a thin budget is advice they may overrule.

export type Judgement = {
  /** `tight` can be done and is worth a warning; `impossible` cannot. */
  level: "ok" | "tight" | "impossible";
  /** A few words, for the card. */
  note: string;
  /** Why not, and what would work. Only when `impossible`. */
  why?: string;
  /** What is worth knowing before building, when it can still be done. */
  advice?: string;
};

export type Assessment = {
  places: Judgement;
  days: Judgement;
  budget: Judgement;
  possible: boolean;
};

/** Roads aren't straight (the same factor travel.ts uses). */
const DETOUR = 1.4;

/**
 * A drive longer than this leaves no time to see the place it ends in: the
 * day starts at nine and the last visit has to begin by six.
 */
const LONGEST_DRIVE_WITH_A_VISIT_MIN = 8 * 60;
/** Past this average, a third of every day is road. */
const HEAVY_DRIVING_MIN_PER_DAY = 3 * 60;

/**
 * What a day costs one adult at the very least, in euros: a dorm bed (€12),
 * three simple meals (€13) and getting around town with an entry fee (€5).
 */
const FLOOR_EUR_PER_DAY = 30;
/** The dorm bed in the floor, which a night with family or friends saves. */
const BED_EUR_PER_NIGHT = 12;
/** Below this a day is hostels and marshrutkas; above it, guesthouses and restaurants. */
const COMFORT_EUR_PER_DAY = 45;
/** Above this, hotels and private drivers. */
const GENEROUS_EUR_PER_DAY = 120;
const CHILD_SHARE = 0.6;
/** A marshrutka seat: Tbilisi–Mestia is about 470 km and 50 lari. */
const TRANSPORT_EUR_PER_KM = 0.04;
/** Fuel for one car: 8 l/100 km at about 3 lari a litre. */
const FUEL_EUR_PER_KM = 0.09;
/** Seats in a car, for how many cars a party of its own needs. */
const SEATS_PER_CAR = 5;

const euros = (n: number) => `€${Math.round(n).toLocaleString("en-GB")}`;
const hours = (min: number) => {
  const h = Math.round(min / 30) / 2;
  return `${Number.isInteger(h) ? h : `${Math.floor(h)}½`} h`;
};
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type Leg = { from: string; to: string; minutes: number; km: number };

/** The drives between the places on a route, in order. */
export function routeLegs(places: readonly string[]): Leg[] {
  return places.slice(1).flatMap((to, i) => {
    const a = destination(places[i]);
    const b = destination(to);
    if (!a || !b) return [];
    return [
      {
        from: a.slug,
        to: b.slug,
        minutes: straightLineTravel.minutes(a.lonLat, b.lonLat),
        km: (haversineM(a.lonLat, b.lonLat) * DETOUR) / 1000,
      },
    ];
  });
}

function judgePlaces(
  c: Constraints,
  refused: readonly { name: string; why: string }[],
): Judgement {
  if (refused.length) {
    return {
      level: "impossible",
      note: `Can’t include ${refused.map((r) => r.name).join(", ")}`,
      why: `${refused.map((r) => `${r.name} can’t be part of this trip: ${r.why}.`).join(" ")} Take it out of what you asked for and I can plan the rest.`,
    };
  }

  const months = new Set(
    Array.from({ length: c.days }, (_, i) =>
      Number(addDays(c.startDate, i).slice(5, 7)),
    ),
  );
  const shut = [...new Set(routeOf(c))]
    .map(destination)
    .filter(
      (d): d is Destination & { closed: NonNullable<Destination["closed"]> } =>
        !!d?.closed?.months.some((m) => months.has(m)),
    );
  if (shut.length) {
    const month = MONTH_NAMES[Number(c.startDate.slice(5, 7)) - 1];
    return {
      level: "impossible",
      note: `${shut.map((d) => d.name).join(", ")} closed in ${month}`,
      why: `${shut.map((d) => `${d.name} can’t be reached in ${month}: ${d.closed.why}.`).join(" ")} Move the trip to between June and October, or leave ${shut.length === 1 ? "it" : "them"} out.`,
    };
  }
  return { level: "ok", note: "" };
}

function judgeDays(c: Constraints): Judgement {
  // Only the places visited need a day each: the start and the finish are the
  // drive in and the drive out.
  const stops = c.places.length;
  const names = routeOf(c).map(destinationName).join(" → ");
  if (stops > c.days) {
    return {
      level: "impossible",
      note: `Too short for ${plural(stops, "place")}`,
      why: `${names} is ${plural(stops, "stop")} in ${plural(c.days, "day")}, and every stop needs at least a day of its own. Give the trip ${plural(stops, "day")}, or take ${plural(stops - c.days, "place")} out.`,
    };
  }

  const legs = routeLegs(routeOf(c));
  // A drive too long to see anything after it takes a day to itself.
  const long = legs.filter((l) => l.minutes > LONGEST_DRIVE_WITH_A_VISIT_MIN);
  const needed = stops + long.length;
  if (needed > c.days) {
    const worst = long[0];
    return {
      level: "impossible",
      note: "Too short for the driving",
      why: `The drive from ${destinationName(worst.from)} to ${destinationName(worst.to)} is about ${hours(worst.minutes)}, which leaves no time to see anything that day. This route needs at least ${plural(needed, "day")}; you gave it ${c.days}.`,
    };
  }

  const driving = legs.reduce((sum, l) => sum + l.minutes, 0);
  if (driving / c.days > HEAVY_DRIVING_MIN_PER_DAY) {
    return {
      level: "tight",
      note: `About ${hours(driving)} of driving`,
    };
  }
  return { level: "ok", note: "" };
}

function judgeBudget(c: Constraints): Judgement {
  const { adults, children } = c.party;
  const people = adults + children;
  const shares = adults + children * CHILD_SHARE;
  const km = routeLegs(routeOf(c)).reduce((sum, l) => sum + l.km, 0);
  const transport = c.ownCar
    ? km * FUEL_EUR_PER_KM * Math.ceil(people / SEATS_PER_CAR)
    : km * TRANSPORT_EUR_PER_KM * people;
  const freeNights = Math.min(c.freeNights, c.days);
  const saved = BED_EUR_PER_NIGHT * freeNights * shares;
  const daily = (c.budgetEur - transport + saved) / c.days / shares;

  if (daily < FLOOR_EUR_PER_DAY) {
    const least =
      Math.ceil(
        (FLOOR_EUR_PER_DAY * c.days * shares + transport - saved) / 10,
      ) * 10;
    const each = Math.max(0, Math.floor(c.budgetEur / c.days / people));
    const covered = [
      c.ownCar ? "your own car" : "",
      freeNights ? plural(freeNights, "free night") : "",
    ].filter(Boolean);
    return {
      level: "tight",
      note: `Usually at least ${euros(least)}`,
      advice: `${euros(c.budgetEur)} for ${plural(people, "person", "people")} over ${plural(c.days, "day")} is about ${euros(each)} each a day${transport >= 10 ? `, before ${euros(transport)} of ${c.ownCar ? "fuel" : "transport"} between places` : ""}. A day in Georgia usually costs at least ${euros(FLOOR_EUR_PER_DAY)} each — a dorm bed, simple meals and marshrutkas — so ${covered.length ? `even with ${covered.join(" and ")} ` : ""}a trip like this tends to need about ${euros(least)}.${covered.length ? "" : " If you have a car or somewhere free to stay, say so and I will count it."} You can still start planning with this budget.`,
    };
  }
  if (daily < COMFORT_EUR_PER_DAY) {
    return { level: "tight", note: "Tight: hostels and marshrutkas" };
  }
  if (daily < GENEROUS_EUR_PER_DAY) {
    return { level: "ok", note: "Covers guesthouses and restaurants" };
  }
  return { level: "ok", note: "Covers hotels and private drivers" };
}

/** Whether a request can become a trip, card by card. */
export function assess(
  c: Constraints,
  refused: readonly { name: string; why: string }[] = [],
): Assessment {
  const places = judgePlaces(c, refused);
  const days = judgeDays(c);
  const budget = judgeBudget(c);
  return {
    places,
    days,
    budget,
    possible: [places, days, budget].every((j) => j.level !== "impossible"),
  };
}

/**
 * `assess`, with the places the planner could not take. Each is a reason the
 * trip cannot be done as asked, and the reason is said when it is a known one.
 */
export function assessAsked(
  c: Constraints,
  unsupported: readonly string[] = [],
): Assessment {
  return assess(
    c,
    unsupported.map((name) => ({
      name,
      why:
        unreachable(name)[0]?.why ??
        "it is not somewhere a trip inside Georgia can go",
    })),
  );
}

/** What to know before building a trip that can be done, in card order. */
export const advice = (a: Assessment): string[] =>
  [a.places, a.days, a.budget].flatMap((j) =>
    j.level !== "impossible" && j.advice ? [j.advice] : [],
  );

/** Every reason a request cannot work, in the order the cards are shown. */
export const reasons = (a: Assessment): string[] =>
  [a.places, a.days, a.budget].flatMap((j) =>
    j.level === "impossible" && j.why ? [j.why] : [],
  );
