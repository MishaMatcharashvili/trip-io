import {
  type Destination,
  destination,
  destinationName,
} from "../../catalogue/destinations.ts";
import { haversineM } from "../../geo.ts";
import { straightLineTravel } from "../travel.ts";
import type { Constraints } from "./constraints.ts";
import { addDays } from "./schedule.ts";

// Can this trip be done at all? Judged before a plan is attempted, from the
// request alone, so the answer is on screen while the traveller is still
// typing — and judged again on the server, which trusts nothing the screen
// sent. A request that cannot work is refused with the reason and what would
// make it work, never quietly bent into a different trip.
//
// The numbers are deliberately on the generous side of possible: a "no" here
// has to be one a traveller who knows Georgia would agree with.

export type Judgement = {
  /** `tight` can be done and is worth a warning; `impossible` cannot. */
  level: "ok" | "tight" | "impossible";
  /** A few words, for the card. */
  note: string;
  /** Why not, and what would work. Only when `impossible`. */
  why?: string;
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
/** Below this a day is hostels and marshrutkas; above it, guesthouses and restaurants. */
const COMFORT_EUR_PER_DAY = 45;
/** Above this, hotels and private drivers. */
const GENEROUS_EUR_PER_DAY = 120;
const CHILD_SHARE = 0.6;
/** A marshrutka seat: Tbilisi–Mestia is about 470 km and 50 lari. */
const TRANSPORT_EUR_PER_KM = 0.04;

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
  const shut = [...new Set(c.places)]
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
  const stops = c.places.length;
  const names = c.places.map(destinationName).join(" → ");
  if (stops > c.days) {
    return {
      level: "impossible",
      note: `Too short for ${plural(stops, "place")}`,
      why: `${names} is ${plural(stops, "stop")} in ${plural(c.days, "day")}, and every stop needs at least a day of its own. Give the trip ${plural(stops, "day")}, or take ${plural(stops - c.days, "place")} out.`,
    };
  }

  const legs = routeLegs(c.places);
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
  const km = routeLegs(c.places).reduce((sum, l) => sum + l.km, 0);
  const transport = km * TRANSPORT_EUR_PER_KM * people;
  const daily = (c.budgetEur - transport) / c.days / shares;

  if (daily < FLOOR_EUR_PER_DAY) {
    const least =
      Math.ceil((FLOOR_EUR_PER_DAY * c.days * shares + transport) / 10) * 10;
    // What the money does stretch to, if the traveller would rather cut days.
    const affordable = Math.floor(
      (c.budgetEur - transport) / shares / FLOOR_EUR_PER_DAY,
    );
    const each = Math.max(0, Math.floor(c.budgetEur / c.days / people));
    return {
      level: "impossible",
      note: `Needs at least ${euros(least)}`,
      why: `${euros(c.budgetEur)} for ${plural(people, "person", "people")} over ${plural(c.days, "day")} is about ${euros(each)} each a day${transport >= 10 ? `, before ${euros(transport)} of transport between places` : ""}. The least a day costs in Georgia — a dorm bed, simple meals and marshrutkas — is about ${euros(FLOOR_EUR_PER_DAY)}. Raise the budget to ${euros(least)}${affordable >= c.places.length ? `, or cut the trip to ${plural(affordable, "day")}` : ""}.`,
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

/** Every reason a request cannot work, in the order the cards are shown. */
export const reasons = (a: Assessment): string[] =>
  [a.places, a.days, a.budget].flatMap((j) =>
    j.level === "impossible" && j.why ? [j.why] : [],
  );
