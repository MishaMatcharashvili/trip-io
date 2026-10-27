import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Pace, TripDoc, TripNode } from "../document.ts";
import { at, DAY, nodeId } from "../test-fixtures.ts";
import { idleGaps, MAX_IDLE_MIN } from "./idle.ts";

const node = (
  kind: TripNode["kind"],
  title: string,
  from: string,
  durationMin: number,
): TripNode => ({
  kind,
  placeId: null,
  lonLat: [44.7, 41.8],
  startsAt: at(DAY, from),
  durationMin,
  indoor: false,
  meta: { title, urban: false },
});

const doc = (pace: Pace, nodes: TripNode[]): TripDoc => ({
  trip: {
    title: "A day",
    startsAt: at(DAY, "00:00"),
    endsAt: at(DAY, "23:59"),
    party: { adults: 1, children: 0 },
    pace,
    budget: "€90",
    prefs: {
      places: [],
      start: "tbilisi",
      finish: "tbilisi",
      interests: [],
      mobility: "moderate",
    },
  },
  nodes: Object.fromEntries(nodes.map((n, i) => [nodeId(i + 1), n])),
});

// The day that was planned: a museum at 14:30, then dinner at 19:00.
const emptyAfternoon = [
  node("visit", "Svetitskhoveli Cathedral", "09:40", 75),
  node("meal", "Lunch · Tsiskvili", "12:30", 75),
  node("visit", "Georgian National Museum", "14:30", 75),
  node("meal", "Dinner · Restaurant Tiflisi", "19:00", 90),
  node("stay", "Check in · Sanapiro", "20:55", 15),
];

describe("idleGaps", () => {
  test("names the stretch and the stops either side of it", () => {
    const [gap, ...rest] = idleGaps(doc("moderate", emptyAfternoon));
    assert.equal(rest.length, 0);
    assert.equal(gap.day, DAY);
    assert.equal(gap.minutes, 195);
    assert.match(gap.message, /3h15 with nothing planned/);
    assert.match(gap.message, /"Georgian National Museum" \(ends 15:45\)/);
    assert.match(gap.message, /"Dinner · Restaurant Tiflisi" \(19:00\)/);
  });

  test("how long a day may rest depends on its pace", () => {
    const rest = [
      node("visit", "A", "10:00", 60),
      node("meal", "B", "14:00", 60), // 11:00 → 14:00, 3h
    ];
    assert.deepEqual(idleGaps(doc("relaxed", rest)), []);
    assert.equal(idleGaps(doc("moderate", rest)).length, 1);
    assert.equal(idleGaps(doc("packed", rest)).length, 1);
    // Three hours and a quarter is more than even a relaxed day rests.
    assert.equal(idleGaps(doc("relaxed", emptyAfternoon)).length, 1);
  });

  test("the limit is inclusive", () => {
    const limit = MAX_IDLE_MIN.moderate;
    const on = [
      node("visit", "A", "10:00", 60),
      node("visit", "B", "13:00", 60), // 11:00 → 13:00
    ];
    assert.equal(limit, 120);
    assert.deepEqual(idleGaps(doc("moderate", on)), []);
    on[1] = node("visit", "B", "13:05", 60);
    assert.equal(idleGaps(doc("moderate", on)).length, 1);
  });

  test("the evening after dinner, and the check-in, are not holes", () => {
    const night = [
      node("meal", "Dinner", "19:00", 90),
      node("stay", "Check in · Hotel", "23:30", 15),
    ];
    assert.deepEqual(idleGaps(doc("packed", night)), []);
  });

  test("days are judged apart: the night between two is not a gap", () => {
    const two = [
      node("visit", "Day one", "17:00", 60),
      {
        ...node("visit", "Day two", "09:00", 60),
        startsAt: at("2026-09-17", "09:00"),
      },
    ];
    assert.deepEqual(idleGaps(doc("packed", two)), []);
  });
});
