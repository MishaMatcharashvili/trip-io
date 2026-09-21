import type { EventKind, Severity } from "../event.ts";
import type { Impact, JudgeInput } from "../judge.ts";
import type { Route } from "../route.ts";

// Thirty (event, node, trip) triples with what the judge should say about each.
//
// This exists in Phase 3 rather than Phase 9 for one reason: the kill criteria
// include a hand-audited false-positive rate, and you cannot measure that — or
// hold it steady across a prompt edit — without fixtures. The first time a
// change that improves rain handling quietly makes the model chatty about wind,
// this is what notices.
//
// Ten should clearly fire, ten should clearly not, and ten are genuinely
// arguable. For the arguable ten the fixture records the reasoning rather than
// a right answer: a corpus that pretends the hard cases are easy measures
// nothing but its own optimism.

/** Fixed, so a fixture's lead times mean the same thing on every run. */
export const NOW = "2026-07-15T06:00:00.000Z";
export const WINTER_NOW = "2026-01-20T06:00:00.000Z";

export type Band = "fire" | "quiet" | "ambiguous";

export type Expectation = {
  band: Band;
  /** Asserted for `fire` and `quiet`; left open for `ambiguous`. */
  relevant?: boolean;
  /** Impacts that would be defensible. Empty means "any". */
  impact?: readonly Impact[];
  /** Where the router should send it, when that is not arguable either. */
  route?: Route;
  /** Why. For an ambiguous fixture this is the whole of the expectation. */
  why: string;
};

export type EvalFixture = {
  id: string;
  /** The moment the fixture is judged at, so lead times are stable. */
  now: string;
  input: JudgeInput;
  expect: Expectation;
};

/** Stable ids, so a failure names the same fixture on every run. */
const uid = (n: number) =>
  `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

let seq = 0;
const nextId = () => uid(++seq);

type EventSpec = {
  kind: EventKind;
  severity: Severity;
  /** Hours from the fixture's `now`. */
  from: number;
  to: number;
  peak: number;
  confidence?: number;
  observedHoursAgo?: number;
};

type NodeSpec = {
  what: string;
  kind?: JudgeInput["node"]["kind"];
  /** Hours from the fixture's `now`. */
  at: number;
  durationMin: number;
  indoor: boolean;
  corridorSlug?: string;
};

type Alternative = {
  name: string;
  category: string;
  indoor: boolean;
  distanceM: number;
};

const hoursFrom = (base: string, h: number) =>
  new Date(Date.parse(base) + h * 3_600_000).toISOString();

const METRICS: Record<string, { metric: string; unit: string }> = {
  "weather.rain": { metric: "precipitation", unit: "mm/h" },
  "weather.snow": { metric: "snowfall", unit: "cm/h" },
  "weather.wind": { metric: "wind gusts", unit: "km/h" },
  "weather.heat": { metric: "apparent temperature", unit: "°C" },
  "weather.cold": { metric: "apparent temperature", unit: "°C" },
  "weather.fog": { metric: "WMO weather code", unit: "" },
  "weather.thunderstorm": { metric: "WMO weather code", unit: "" },
};

function fixture(
  now: string,
  event: EventSpec,
  node: NodeSpec,
  trip: {
    party: Record<string, unknown>;
    pace: JudgeInput["trip"]["pace"];
    prefs?: Record<string, unknown>;
    restOfDay?: NodeSpec[];
  },
  alternatives: Alternative[],
  expect: Expectation,
): EvalFixture {
  const observedAt = hoursFrom(now, -(event.observedHoursAgo ?? 1));
  const nodeId = nextId();
  const day = [node, ...(trip.restOfDay ?? [])].map((n, i) => ({
    id: i === 0 ? nodeId : nextId(),
    title: n.what,
    startsAt: hoursFrom(now, n.at),
    durationMin: n.durationMin,
    indoor: n.indoor,
  }));

  return {
    id: `${expect.band}/${node.what.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    now,
    input: {
      event: {
        kind: event.kind,
        severity: event.severity,
        confidence: event.confidence ?? 0.9,
        validFrom: hoursFrom(now, event.from),
        validTo: hoursFrom(now, event.to),
        source: "open-meteo",
        observedAt,
        payload: {
          ...METRICS[event.kind],
          peak: event.peak,
          peakAt: hoursFrom(now, event.from),
          hours: event.to - event.from,
          observedAt,
        },
      },
      node: {
        id: nodeId,
        kind: node.kind ?? "visit",
        title: node.what,
        placeName: node.what,
        startsAt: hoursFrom(now, node.at),
        durationMin: node.durationMin,
        indoor: node.indoor,
        corridorSlug: node.corridorSlug,
      },
      trip: {
        party: trip.party,
        pace: trip.pace,
        prefs: trip.prefs ?? {},
        day,
      },
      alternatives: alternatives.map((a) => ({
        placeId: nextId(),
        name: a.name,
        category: a.category,
        indoor: a.indoor,
        distanceM: a.distanceM,
      })),
      sent: { countSoFar: 0, cap: 4, lastSentAt: null },
    },
    expect,
  };
}

const couple = { adults: 2 };
const family = { adults: 2, children: 2 };
const solo = { adults: 1 };

const blocksOrDegrades: readonly Impact[] = ["blocks", "degrades"];

// ─── Ten that should fire ────────────────────────────────────────────────────

const fires: EvalFixture[] = [
  fixture(
    NOW,
    { kind: "weather.rain", severity: "severe", from: 1, to: 6, peak: 14 },
    { what: "Gergeti Trinity hike", at: 2, durationMin: 240, indoor: false },
    { party: couple, pace: "moderate", prefs: { interests: ["hiking"] } },
    [
      {
        name: "Stepantsminda Museum of Alpinism",
        category: "museum",
        indoor: true,
        distanceM: 2100,
      },
      {
        name: "Kazbegi Historical Museum",
        category: "museum",
        indoor: true,
        distanceM: 2400,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Fourteen millimetres an hour over a four-hour exposed climb: the whole reason the traveller came, unwalkable for the whole window.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.snow", severity: "extreme", from: 1, to: 9, peak: 11 },
    {
      what: "Drive to Stepantsminda over the Jvari Pass",
      kind: "transfer",
      at: 2,
      durationMin: 210,
      indoor: false,
      corridorSlug: "military-road",
    },
    { party: family, pace: "relaxed" },
    [],
    {
      band: "fire",
      relevant: true,
      impact: ["blocks"],
      why: "Eleven centimetres an hour on the only road north. This is the case the road detector exists for and the one the weather detector must not miss in the meantime.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "weather.thunderstorm",
      severity: "severe",
      from: 2,
      to: 5,
      peak: 96,
    },
    { what: "Chalaadi Glacier trail", at: 3, durationMin: 210, indoor: false },
    { party: couple, pace: "packed", prefs: { interests: ["hiking"] } },
    [
      {
        name: "Svaneti Museum of History and Ethnography",
        category: "museum",
        indoor: true,
        distanceM: 5200,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: ["blocks"],
      why: "Lightning on an exposed glacier approach. Severity aside, there is no version of this where waiting is not the answer.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.wind", severity: "severe", from: 0, to: 4, peak: 88 },
    { what: "Gudauri ropeway", at: 1, durationMin: 90, indoor: false },
    { party: solo, pace: "moderate" },
    [
      {
        name: "Gudauri Panorama viewpoint",
        category: "viewpoint",
        indoor: false,
        distanceM: 900,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Ropeways stop well below 88km/h gusts; the stop will not happen whatever the traveller decides.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.heat", severity: "extreme", from: 4, to: 10, peak: 42 },
    {
      what: "Old Tbilisi walking tour",
      at: 5,
      durationMin: 180,
      indoor: false,
    },
    { party: family, pace: "packed" },
    [
      {
        name: "Georgian National Museum",
        category: "museum",
        indoor: true,
        distanceM: 700,
      },
      {
        name: "Sulphur baths, Abanotubani",
        category: "spa",
        indoor: true,
        distanceM: 400,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Three hours of pavement at 42°C apparent, with two children. The morning version of the same walk is pleasant, which makes this a proposal rather than a warning.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.cold", severity: "severe", from: 1, to: 8, peak: -22 },
    {
      what: "Kazbegi valley viewpoint",
      at: 2,
      durationMin: 120,
      indoor: false,
    },
    { party: couple, pace: "relaxed" },
    [
      {
        name: "Rooms Hotel terrace café",
        category: "cafe",
        indoor: true,
        distanceM: 1200,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Two hours standing still at -22°C apparent is a medical question, not a comfort one.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.fog", severity: "moderate", from: 0, to: 5, peak: 48 },
    {
      what: "Drive from Gudauri to Ananuri",
      kind: "transfer",
      at: 1,
      durationMin: 150,
      indoor: false,
      corridorSlug: "military-road",
    },
    { party: solo, pace: "moderate" },
    [],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Depositing rime fog ices the road as well as hiding it, on a descent with no alternative route.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "severe", from: 3, to: 8, peak: 12 },
    {
      what: "Martvili Canyon boat trip",
      at: 4,
      durationMin: 120,
      indoor: false,
    },
    { party: family, pace: "moderate" },
    [
      {
        name: "Motsameta Monastery",
        category: "monastery",
        indoor: true,
        distanceM: 14000,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Canyon boat trips close on heavy rain — the water rises, which is also the safety question.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.snow", severity: "severe", from: 2, to: 10, peak: 6 },
    { what: "Ushguli tower walk", at: 3, durationMin: 180, indoor: false },
    { party: couple, pace: "relaxed", prefs: { interests: ["history"] } },
    [
      {
        name: "Ushguli Ethnographic Museum",
        category: "museum",
        indoor: true,
        distanceM: 300,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Six centimetres an hour over three hours outdoors in Svaneti, with an indoor alternative three hundred metres away.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "weather.thunderstorm",
      severity: "extreme",
      from: 1,
      to: 4,
      peak: 99,
    },
    {
      what: "Vineyard tour, Tsinandali",
      at: 2,
      durationMin: 150,
      indoor: false,
    },
    { party: couple, pace: "relaxed", prefs: { interests: ["wine"] } },
    [
      {
        name: "Tsinandali Estate cellar",
        category: "winery",
        indoor: true,
        distanceM: 150,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: blocksOrDegrades,
      why: "Hail-bearing storm during an outdoor tour with the cellar of the same estate a hundred and fifty metres away. The obvious proposal, and a chance to say something better than 'cancelled'.",
    },
  ),
];

// ─── Ten that should not ─────────────────────────────────────────────────────

const quiet: EvalFixture[] = [
  fixture(
    NOW,
    { kind: "weather.rain", severity: "severe", from: 2, to: 7, peak: 13 },
    { what: "Georgian National Museum", at: 3, durationMin: 120, indoor: true },
    { party: couple, pace: "moderate" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Rain does not affect a museum. The commonest matched pair in the whole system, and the one it must stay silent about.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.wind", severity: "moderate", from: 10, to: 14, peak: 64 },
    {
      what: "Dinner at Shavi Lomi",
      kind: "meal",
      at: 11,
      durationMin: 90,
      indoor: true,
    },
    { party: couple, pace: "relaxed" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Wind, indoors, at dinner. Nothing about the evening changes.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.heat", severity: "severe", from: 4, to: 11, peak: 39 },
    { what: "Art Palace of Georgia", at: 5, durationMin: 90, indoor: true },
    { party: solo, pace: "moderate" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "A hot afternoon spent indoors is the plan working, not the plan breaking.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "minor", from: 1, to: 3, peak: 2.4 },
    {
      what: "Taxi across Tbilisi",
      kind: "transfer",
      at: 1,
      durationMin: 25,
      indoor: false,
    },
    { party: solo, pace: "packed" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Light rain on a twenty-five-minute city drive. If this fires, every trip-day produces a dozen verdicts and the product is noise.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.fog", severity: "minor", from: 0, to: 3, peak: 45 },
    { what: "Wine tasting, Telavi", at: 1, durationMin: 90, indoor: true },
    { party: couple, pace: "relaxed", prefs: { interests: ["wine"] } },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Fog outside a tasting room. The traveller is indoors for the whole window and has nowhere to be until it lifts.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.cold", severity: "moderate", from: 1, to: 9, peak: -13 },
    {
      what: "Museum of Soviet Occupation",
      at: 2,
      durationMin: 90,
      indoor: true,
    },
    { party: solo, pace: "moderate" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "A cold January day, spent inside. Tbilisi in winter is cold; that is not news.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.wind", severity: "minor", from: 2, to: 5, peak: 47 },
    { what: "Rustaveli Avenue stroll", at: 3, durationMin: 60, indoor: false },
    { party: couple, pace: "relaxed" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "A breezy hour on a city street. Outdoors is not the same as exposed.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "moderate", from: 12, to: 16, peak: 6 },
    {
      what: "Check in, Hotel Kabadoni",
      kind: "stay",
      at: 13,
      durationMin: 30,
      indoor: true,
    },
    { party: family, pace: "relaxed" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Rain during a hotel check-in. Nothing a traveller could act on, and nothing they would thank you for.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.snow", severity: "minor", from: 3, to: 6, peak: 0.7 },
    {
      what: "Lunch at Salobie Bia",
      kind: "meal",
      at: 4,
      durationMin: 75,
      indoor: true,
    },
    { party: couple, pace: "moderate" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "Light snow during an indoor lunch. It may matter for the drive afterwards, but that is a different node and will be matched as one.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.heat", severity: "minor", from: 5, to: 12, peak: 33 },
    {
      what: "Sulphur baths, Abanotubani",
      at: 6,
      durationMin: 90,
      indoor: true,
    },
    { party: couple, pace: "relaxed" },
    [],
    {
      band: "quiet",
      relevant: false,
      route: "drop",
      why: "A warm day and a hot bath. The one stop on the trip where the temperature outside is beside the point.",
    },
  ),
];

// ─── Ten that are genuinely arguable ─────────────────────────────────────────

const ambiguous: EvalFixture[] = [
  fixture(
    NOW,
    { kind: "weather.rain", severity: "moderate", from: 5, to: 8, peak: 6 },
    {
      what: "Lunch on the terrace at Azarphesha",
      kind: "meal",
      at: 6,
      durationMin: 75,
      indoor: false,
    },
    { party: couple, pace: "relaxed" },
    [{ name: "Cafe Stamba", category: "cafe", indoor: true, distanceM: 600 }],
    {
      band: "ambiguous",
      why: "Six millimetres an hour on a terrace lunch. Most Tbilisi terraces are covered, which the catalogue does not record — so a judge that says 'degrades, sit inside' and one that says 'not relevant' are both defensible. What is not defensible is proposing to move the meal an hour, which solves nothing.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "moderate", from: 1, to: 5, peak: 7 },
    { what: "Narikala Fortress walk", at: 2, durationMin: 120, indoor: false },
    { party: couple, pace: "moderate" },
    [
      {
        name: "Sulphur baths, Abanotubani",
        category: "spa",
        indoor: true,
        distanceM: 500,
      },
      {
        name: "Georgian National Museum",
        category: "museum",
        indoor: true,
        distanceM: 1400,
      },
    ],
    {
      band: "ambiguous",
      why: "A fortress in the rain is wet but not ruined, and the cable car up is enclosed. Both 'degrades, here is a swap' and 'not relevant, take a coat' are honest. Watch for the model reaching for `blocks`.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.heat", severity: "minor", from: 3, to: 10, peak: 34 },
    {
      what: "Tbilisi Botanical Garden",
      at: 4,
      durationMin: 120,
      indoor: false,
    },
    { party: family, pace: "relaxed" },
    [
      {
        name: "Georgian National Museum",
        category: "museum",
        indoor: true,
        distanceM: 1800,
      },
    ],
    {
      band: "ambiguous",
      why: "A shaded garden at 34°C is the coolest outdoor option in the city, so the event arguably improves nothing and blocks nothing. A verdict of 'degrades, go earlier' is reasonable with children; 'not relevant' is reasonable too.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.wind", severity: "moderate", from: 0, to: 4, peak: 63 },
    {
      what: "Narikala cable car",
      kind: "transfer",
      at: 1,
      durationMin: 20,
      indoor: false,
    },
    { party: solo, pace: "packed" },
    [],
    {
      band: "ambiguous",
      why: "Sixty-three km/h gusts sit right at the threshold where a cable car suspends service, and gusts are not sustained wind. The right answer depends on an operator rule the system does not have — so either verdict is fine, but the evidence line must say it is a forecast of gusts.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.snow", severity: "moderate", from: 2, to: 8, peak: 2.5 },
    {
      what: "Drive Tbilisi to Sighnaghi",
      kind: "transfer",
      at: 3,
      durationMin: 120,
      indoor: false,
      corridorSlug: "kakheti",
    },
    { party: couple, pace: "relaxed" },
    [],
    {
      band: "ambiguous",
      why: "Kakheti is low and its roads are gritted; 2.5cm/h is a serious matter on the Military Road and an ordinary winter morning here. A judge that treats all snow on all corridors alike is wrong, and this is the fixture that catches it.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.fog", severity: "minor", from: 0, to: 3, peak: 45 },
    { what: "Sighnaghi town walk", at: 1, durationMin: 120, indoor: false },
    { party: couple, pace: "relaxed", prefs: { interests: ["photography"] } },
    [],
    {
      band: "ambiguous",
      why: "Sighnaghi's whole draw is the view over the Alazani valley, which fog removes — but fog over the valley is also what the photographers came for. 'Degrades' and 'improves' are both arguable; 'blocks' is not.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "severe", from: 2, to: 7, peak: 11 },
    {
      what: "Drive Kutaisi to Batumi",
      kind: "transfer",
      at: 3,
      durationMin: 150,
      indoor: false,
    },
    { party: family, pace: "moderate" },
    [],
    {
      band: "ambiguous",
      why: "The travellers are inside a car, so the rain does not touch them — but eleven millimetres an hour is a driving-conditions event. A judge that says 'not relevant, they're in a car' has missed something; one that says 'blocks' has overreached.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "weather.thunderstorm",
      severity: "moderate",
      from: 40,
      to: 44,
      peak: 95,
      confidence: 0.58,
    },
    { what: "Juta to Chaukhi hike", at: 41, durationMin: 300, indoor: false },
    { party: couple, pace: "packed", prefs: { interests: ["hiking"] } },
    [
      {
        name: "Stepantsminda Museum of Alpinism",
        category: "museum",
        indoor: true,
        distanceM: 9000,
      },
    ],
    {
      band: "ambiguous",
      route: "briefing",
      why: "A storm guessed at nearly two days out, over the trip's hardest day. Worth saying in tomorrow's briefing and not worth a push whatever the model's own confidence — which is what the router's min(verdict, forecast) gate is for. The judgement at issue is whether to propose moving a hike on a forecast this soft.",
    },
  ),
  fixture(
    WINTER_NOW,
    { kind: "weather.cold", severity: "minor", from: 1, to: 6, peak: -7 },
    { what: "Dezerter Bazaar", at: 2, durationMin: 90, indoor: false },
    { party: solo, pace: "moderate", prefs: { interests: ["food"] } },
    [],
    {
      band: "ambiguous",
      why: "Minus seven at a half-covered market for ninety minutes: uncomfortable, not a problem, and entirely a question of what the traveller packed. The interesting failure is a verdict that proposes dropping the stop.",
    },
  ),
  fixture(
    NOW,
    { kind: "weather.rain", severity: "moderate", from: 2, to: 6, peak: 5 },
    { what: "Mtatsminda Park", at: 3, durationMin: 150, indoor: false },
    { party: family, pace: "relaxed" },
    [
      {
        name: "Mtatsminda Pantheon",
        category: "monument",
        indoor: false,
        distanceM: 400,
      },
      {
        name: "Funicular Restaurant",
        category: "restaurant",
        indoor: true,
        distanceM: 200,
      },
    ],
    {
      band: "ambiguous",
      why: "A hilltop funfair in moderate rain with an indoor restaurant two hundred metres away. The best answer is the opportunity framing — lunch first, rides after it passes — and this fixture is mainly a test of whether the model reaches for that or for 'cancel'.",
    },
  ),
];

export const fixtures: EvalFixture[] = [...fires, ...quiet, ...ambiguous];

export const byBand = (band: Band) =>
  fixtures.filter((f) => f.expect.band === band);
