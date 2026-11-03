import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TripDoc, TripNode } from "../document.ts";
import { initialState } from "../generate/intake.ts";
import { at, nodeId } from "../test-fixtures.ts";
import { score, type Trace, timeline } from "./checks.ts";
import type { Expectation, Scenario } from "./scenarios.ts";

// 2026-11-13 is a Friday.
const FRI = "2026-11-13";
const MON = "2026-11-16";
const HOME: [number, number] = [42.19, 42.037];
const COAST: [number, number] = [41.762, 41.988];
const HOTEL = "a0000000-0000-4000-8000-000000000001";
const PARK = "a0000000-0000-4000-8000-000000000002";

const node = (
  kind: TripNode["kind"],
  title: string,
  day: string,
  from: string,
  durationMin: number,
  placeId: string | null = null,
): TripNode => ({
  kind,
  placeId,
  lonLat: placeId ? null : HOME,
  startsAt: at(day, from),
  durationMin,
  indoor: false,
  meta: { title, urban: false },
});

const doc = (nodes: TripNode[]): TripDoc => ({
  trip: {
    title: "Guria",
    startsAt: at(FRI, "00:00"),
    endsAt: at(MON, "23:59"),
    party: { adults: 2, children: 0 },
    pace: "relaxed",
    budget: "€240",
    prefs: {
      places: ["guria"],
      start: "tbilisi",
      finish: "tbilisi",
      interests: [],
      mobility: "low",
    },
  },
  nodes: Object.fromEntries(nodes.map((n, i) => [nodeId(i + 1), n])),
});

// The trip as it was built for the report this eval began with.
const built = doc([
  node("visit", "Shekvetili Dendrological Park", FRI, "10:00", 180, PARK),
  node("meal", "Lunch", FRI, "13:25", 70),
  node("visit", "Georgia in Miniatures", FRI, "15:00", 60),
  node("meal", "Dinner", FRI, "18:30", 80),
  node("stay", "Check in · Kolkhida Resort & Spa", FRI, "20:05", 15, HOTEL),
  node("transfer", "Drive to Tbilisi", "2026-11-15", "16:40", 260),
]);

const c = initialState("2026-11-03").constraints;
const trace = (over: Partial<Trace> = {}): Trace => ({
  constraints: {
    ...c,
    days: 3,
    startDate: FRI,
    places: ["guria"],
    pace: "relaxed",
  },
  said: ["days", "startDate", "places"],
  build: { ok: true, doc: built },
  places: {
    [HOTEL]: {
      name: "Kolkhida Resort & Spa",
      category: "hotel",
      lonLat: COAST,
    },
    [PARK]: {
      name: "Shekvetili Dendrological Park",
      category: "park",
      lonLat: COAST,
    },
  },
  ...over,
});

const judge = (expect: Expectation[], t = trace()) =>
  score(
    { id: "t", title: "", origin: "", today: "", says: [], expect } as Scenario,
    t,
  );

describe("score", () => {
  test("says what was got beside what was expected", () => {
    const [days, start, places] = judge([
      { kind: "days", equals: 4 },
      { kind: "startWeekday", is: 5 },
      { kind: "places", includes: ["chokhatauri"] },
    ]);
    assert.deepEqual(days, {
      kind: "days",
      pass: false,
      expected: "4 days",
      got: "3 days",
    });
    assert.equal(start.pass, true);
    assert.match(start.got, /2026-11-13, a Fri/);
    assert.equal(places.pass, false);
    assert.equal(places.got, "places guria");
  });

  test("names the stops too far from home, and the hotel", () => {
    const [near, lodging] = judge([
      { kind: "near", name: "Amaghleba", at: HOME, withinKm: 30 },
      { kind: "noLodging" },
    ]);
    assert.equal(near.pass, false);
    assert.match(near.got, /Shekvetili Dendrological Park \(36 km\)/);
    assert.match(near.got, /Kolkhida/);
    assert.equal(lodging.got, "Check in · Kolkhida Resort & Spa");
  });

  test("finds the gap over the pace's limit, and the late drive home", () => {
    const [idle, home] = judge([
      { kind: "maxIdle" },
      { kind: "homeBy", time: "13:00" },
    ]);
    assert.equal(idle.pass, false);
    assert.equal(idle.expected, "no gap over 120 min (relaxed)");
    assert.match(idle.got, /Fri 2026-11-13 150 min before 18:30 Dinner/);
    assert.equal(home.pass, false);
    assert.match(home.got, /ends Sun 2026-11-15 21:00/);
  });

  test("a check on the plan fails, with the reason, when there is none", () => {
    const [built] = judge(
      [{ kind: "built" }],
      trace({ build: { ok: false, explanations: ["nothing to see"] } }),
    );
    assert.deepEqual(built, {
      kind: "built",
      pass: false,
      expected: "a plan",
      got: "no plan: nothing to see",
    });
  });
});

describe("timeline", () => {
  test("measures the stretch before each stop, and not before a bed", () => {
    const [friday] = timeline(built, trace().places);
    assert.equal(friday.weekday, "Fri");
    assert.deepEqual(
      friday.rows.map((r) => r.idleBefore),
      [null, 25, 25, 150, null],
    );
    assert.equal(friday.longestIdle, 150);
    assert.deepEqual(friday.rows[0].lonLat, COAST);
  });
});
