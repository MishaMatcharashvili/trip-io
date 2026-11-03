import type { LonLat } from "../../geo.ts";

// Conversations on /new, played end to end against the real planner, the real
// catalogue and the real composer by `pnpm planner:eval`
// (scripts/dev/planner-eval.ts), and what each must come out as. A scenario is
// a report from someone who used the planner, turned into something that can
// be run again: what they said, and what they should have got.
//
// The traveller's messages are sent in order whatever the planner replies, the
// first as the request and the rest as answers to what it is likely to ask.
// Add one whenever a trip comes out wrong, with the words that made it.

export type Expectation =
  /** The request, after the conversation. */
  | { kind: "days"; equals: number }
  | { kind: "startWeekday"; is: number }
  | { kind: "places"; includes?: string[]; excludes?: string[] }
  | { kind: "start"; is: string }
  | { kind: "freeNights"; atLeast: number }
  | { kind: "notes"; mention: string }
  | { kind: "interests"; includes: string[] }
  | { kind: "dayEnds"; is: string }
  /** The plan the request was built into. */
  | { kind: "built" }
  | { kind: "calendarDays"; equals: number }
  /** Every stop, meal and bed within this far of a point. */
  | { kind: "near"; name: string; at: LonLat; withinKm: number }
  /** No night in a hotel: the traveller has somewhere to sleep. */
  | { kind: "noLodging" }
  /** The request holds the home, and the plan's nights are spent at it. */
  | { kind: "homeAt"; name: string; at: LonLat; withinKm: number }
  /** The map's start and finish pins are here, by this name. */
  | { kind: "endpointsAt"; name: string; at: LonLat; withinKm: number }
  /** No day with more than this between one stop ending and the next starting; by default the pace's limit. */
  | { kind: "maxIdle"; minutes?: number }
  /** No sight visited on two days: a thin catalogue shows as the same fortress every morning. */
  | { kind: "noRepeats" }
  /** The last day's last drive arrives by this time ("12:00"). */
  | { kind: "homeBy"; time: string };

export type Scenario = {
  id: string;
  title: string;
  /** Where the scenario came from: whose report, and what went wrong. */
  origin: string;
  /** YYYY-MM-DD in Tbilisi: the conversation's today. */
  today: string;
  /** Where the browser says the traveller is, if anywhere. */
  here?: LonLat;
  says: string[];
  expect: Expectation[];
};

/** Amaghleba, the village in Chokhatauri, Guria (OpenStreetMap). */
const AMAGHLEBA: LonLat = [42.1908, 42.0369];
const KUTAISI: LonLat = [42.6996, 42.2679];

export const FRIDAY = 5;

export const scenarios: Scenario[] = [
  {
    id: "guria-home-weekend",
    title: "A weekend at home in Guria, Friday morning to Monday morning",
    origin:
      "2026-11-03 report: Monday left out, the trip went to the Ureki coast instead of Amaghleba, a resort booked though they have a home there, and long gaps in the days",
    today: "2026-11-03",
    here: AMAGHLEBA,
    says: [
      "I need a weekend in Guria. Start on Friday morning and get back on Monday morning. I have my home there in Amaghleba",
      "Nature and food, two of us, relaxed",
    ],
    expect: [
      { kind: "days", equals: 4 },
      { kind: "startWeekday", is: FRIDAY },
      { kind: "places", includes: ["chokhatauri"] },
      { kind: "start", is: "chokhatauri" },
      { kind: "freeNights", atLeast: 3 },
      { kind: "notes", mention: "amaghleba" },
      { kind: "built" },
      { kind: "calendarDays", equals: 4 },
      { kind: "near", name: "Amaghleba", at: AMAGHLEBA, withinKm: 30 },
      { kind: "noLodging" },
      { kind: "homeAt", name: "Amaghleba", at: AMAGHLEBA, withinKm: 3 },
      { kind: "endpointsAt", name: "Amaghleba", at: AMAGHLEBA, withinKm: 3 },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
      { kind: "homeBy", time: "13:00" },
    ],
  },
  {
    id: "guria-from-tbilisi",
    title: "The same weekend asked from Tbilisi",
    origin:
      "The Guria report, with no position: the start must stay Tbilisi and the days still count Monday",
    today: "2026-11-03",
    says: [
      "Weekend in Guria with my partner, leave Tbilisi Friday morning and back Monday morning. We stay at my family's house in Amaghleba near Chokhatauri",
      "Food and nature",
    ],
    expect: [
      { kind: "days", equals: 4 },
      { kind: "startWeekday", is: FRIDAY },
      { kind: "start", is: "tbilisi" },
      { kind: "places", includes: ["chokhatauri"] },
      { kind: "freeNights", atLeast: 3 },
      { kind: "built" },
      { kind: "calendarDays", equals: 4 },
      { kind: "homeAt", name: "Amaghleba", at: AMAGHLEBA, withinKm: 3 },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
    ],
  },
  {
    id: "located-in-kutaisi",
    title: "Planned from Kutaisi, to Kakheti",
    origin:
      "2026-11-03 report: a new trip always starts in Tbilisi instead of where the traveller is",
    today: "2026-11-03",
    here: KUTAISI,
    says: ["3 days in Kakheti for the wine", "Couple, moderate pace"],
    expect: [
      { kind: "start", is: "kutaisi" },
      { kind: "places", includes: ["kakheti"] },
      { kind: "days", equals: 3 },
      { kind: "built" },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
    ],
  },
  {
    id: "mtskheta-day-trip",
    title: "A day trip to Mtskheta, back by six",
    origin: "Baseline: a short day must still be a full one until it ends",
    today: "2026-11-03",
    says: [
      "Day trip from Tbilisi to Mtskheta next Saturday, back by 6pm",
      "History and churches",
    ],
    expect: [
      { kind: "days", equals: 1 },
      { kind: "dayEnds", is: "18:00" },
      { kind: "places", includes: ["mtskheta"] },
      { kind: "built" },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
    ],
  },
  {
    id: "kazbegi-hiking",
    title: "Five days, Tbilisi and Kazbegi, hiking",
    origin: "Baseline: the most common trip, with a stated interest",
    today: "2026-11-03",
    says: [
      "5 days in Tbilisi and Kazbegi from 20 November, hiking and old churches, solo",
      "Moderate pace",
    ],
    expect: [
      { kind: "days", equals: 5 },
      { kind: "places", includes: ["tbilisi", "kazbegi"] },
      { kind: "interests", includes: ["nature", "heritage"] },
      { kind: "built" },
      { kind: "calendarDays", equals: 5 },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
    ],
  },
  {
    id: "batumi-saturday-to-monday",
    title: "Batumi, Saturday to Monday, for the food",
    origin: "Baseline for weekdays: Saturday to Monday is three days",
    today: "2026-11-03",
    says: [
      "Batumi from Saturday to Monday with my girlfriend, mostly food and the sea",
    ],
    expect: [
      { kind: "days", equals: 3 },
      { kind: "startWeekday", is: 6 },
      { kind: "places", includes: ["batumi"] },
      { kind: "built" },
      { kind: "maxIdle" },
      { kind: "noRepeats" },
    ],
  },
];
