import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  conflictLine,
  currentDay,
  daysOf,
  type ModelNode,
  type ModelScreen,
  phaseOf,
  pointsOf,
  stopDetail,
} from "../mobile/src/trip-model.ts";

// The Expo app works a trip's days, stops and watch states out for itself
// (mobile/src/trip-model.ts), from the same read the web's screens use. It is
// pure, so it is tested here, with the rest of the rules.

const node = (
  startsAt: string,
  title: string,
  extra: Partial<ModelNode> = {},
): ModelNode => ({
  kind: "visit",
  placeId: null,
  startsAt,
  durationMin: 60,
  indoor: false,
  meta: { title },
  ...extra,
});

// Tbilisi is UTC+4: 05:00Z is 09:00 there.
const screen = (
  extra: Partial<ModelScreen<ModelNode, { name: string }>> = {},
): ModelScreen<ModelNode, { name: string }> => ({
  doc: {
    nodes: {
      b: node("2026-09-16T12:00:00.000Z", "Gergeti hike", {
        durationMin: 160,
      }),
      a: node("2026-09-16T05:00:00.000Z", "Breakfast", { placeId: "p1" }),
      c: node("2026-09-17T06:00:00.000Z", "Drive to Juta", {
        kind: "transfer",
      }),
      d: node("2026-09-17T08:00:00.000Z", "Juta valley", { indoor: false }),
    },
  },
  matches: [],
  places: { p1: { name: "Rooms" } },
  positions: { a: [44.6, 42.6], b: [44.62, 42.66] },
  watch: { cap: 4 },
  ...extra,
});

const at = (iso: string) => Date.parse(iso);

describe("the phone's trip model", () => {
  test("groups stops by Tbilisi day, in time order", () => {
    const days = daysOf(screen(), at("2026-09-10T00:00:00Z"));
    assert.deepEqual(
      days.map((d) => [d.key, d.index, d.stops.map((s) => s.id)]),
      [
        ["2026-09-16", 1, ["a", "b"]],
        ["2026-09-17", 2, ["c", "d"]],
      ],
    );
    assert.equal(days[0].stops[0].time, "09:00");
  });

  test("a stop late in the UTC day falls on the next Tbilisi day", () => {
    const days = daysOf(
      screen({
        doc: { nodes: { x: node("2026-09-16T21:00:00.000Z", "Late arrival") } },
      }),
    );
    assert.equal(days[0].key, "2026-09-17");
  });

  test("says where each stop stands against the clock", () => {
    const days = daysOf(screen(), at("2026-09-16T12:30:00Z"));
    assert.deepEqual(
      days[0].stops.map((s) => s.state),
      ["done", "now"],
    );
    assert.equal(days[0].state, "today");
    assert.equal(days[1].state, "future");
    assert.match(days[0].stamp, /^D1 · .* · Today$/);
  });

  test("marks a matched stop, and the day it is on", () => {
    const days = daysOf(
      screen({
        matches: [
          {
            nodeId: "b",
            kind: "weather.heavy_rain",
            validFrom: "2026-09-16T11:30:00.000Z",
            validTo: "2026-09-16T15:00:00.000Z",
          },
        ],
      }),
      at("2026-09-16T06:30:00Z"),
    );
    const hike = days[0].stops[1];
    assert.equal(hike.conflict, "Weather · heavy rain 15:30–19:00");
    assert.deepEqual(days[0].watch, { tone: "alert", label: "1 conflict" });
    assert.deepEqual(days[1].watch, { tone: "ok", label: "Clear" });
    assert.equal(days[0].segments.at(-1)?.tone, "alert");
    assert.match(stopDetail(hike), /^2h 40m · Weather/);
  });

  test("a day that is over is done, and an unwatched trip says so", () => {
    const past = daysOf(screen(), at("2026-09-20T00:00:00Z"));
    assert.deepEqual(past[0].watch, { tone: "idle", label: "Done" });
    const unwatched = daysOf(
      screen({ watch: null }),
      at("2026-09-10T00:00:00Z"),
    );
    assert.deepEqual(unwatched[0].watch, {
      tone: "idle",
      label: "Not watched",
    });
  });

  test("names a day by what is visited, not by the drive to it", () => {
    const days = daysOf(screen(), at("2026-09-10T00:00:00Z"));
    assert.equal(days[1].summary, "Juta valley");
    assert.equal(days[0].summary, "Breakfast · Gergeti hike");
  });

  test("carries each stop's place and position, when it has them", () => {
    const [first] = daysOf(screen(), at("2026-09-10T00:00:00Z"));
    assert.deepEqual(first.stops[0].place, { name: "Rooms" });
    assert.equal(first.stops[1].place, null);
    assert.deepEqual(pointsOf(first.stops), [
      [44.6, 42.6],
      [44.62, 42.66],
    ]);
    const [, second] = daysOf(screen(), at("2026-09-10T00:00:00Z"));
    assert.deepEqual(pointsOf(second.stops), []);
  });

  test("a gap between stops is drawn as empty time", () => {
    const [first] = daysOf(screen(), at("2026-09-10T00:00:00Z"));
    assert.deepEqual(
      first.segments.map((s) => s.tone),
      ["filled", "empty", "filled"],
    );
  });

  test("the current day is today, else the next, else the last", () => {
    const pick = (now: string) => currentDay(daysOf(screen(), at(now)))?.key;
    assert.equal(pick("2026-09-17T07:00:00Z"), "2026-09-17");
    assert.equal(pick("2026-09-01T07:00:00Z"), "2026-09-16");
    assert.equal(pick("2026-10-01T07:00:00Z"), "2026-09-17");
    assert.equal(currentDay([]), undefined);
  });

  test("a trip is under way, still to come, or over", () => {
    const trip = {
      startsAt: "2026-09-14T00:00:00Z",
      endsAt: "2026-09-20T00:00:00Z",
    };
    assert.equal(phaseOf(trip, at("2026-09-10T00:00:00Z")), "soon");
    assert.equal(phaseOf(trip, at("2026-09-16T00:00:00Z")), "now");
    assert.equal(phaseOf(trip, at("2026-09-21T00:00:00Z")), "done");
  });

  test("an open-ended match has no end time", () => {
    assert.equal(
      conflictLine({
        nodeId: "a",
        kind: "road.closure",
        validFrom: "2026-09-16T06:10:00.000Z",
        validTo: null,
      }),
      "Road · closure 10:10",
    );
  });
});
