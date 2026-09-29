import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_STOPS, type RouteAnswer } from "./contract.ts";
import { chunkStops, joinAnswers, routeSignature } from "./plan.ts";

const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("chunkStops", () => {
  test("a trip that fits is one request", () => {
    assert.deepEqual(chunkStops(nums(5)), [nums(5)]);
    assert.equal(chunkStops(nums(MAX_STOPS)).length, 1);
  });

  test("a longer trip splits with the boundary stop shared, in order, none lost", () => {
    const stops = nums(MAX_STOPS + 5);
    const chunks = chunkStops(stops);
    assert.equal(chunks.length, 2);
    assert.ok(chunks.every((c) => c.length <= MAX_STOPS));
    assert.equal(chunks[0].at(-1), chunks[1][0]);
    const joined = [...chunks[0], ...chunks[1].slice(1)];
    assert.deepEqual(joined, stops);
  });

  test("fewer than two stops is nothing to route", () => {
    assert.deepEqual(chunkStops(nums(1)), []);
    assert.deepEqual(chunkStops([]), []);
  });
});

describe("routeSignature", () => {
  const a = {
    stops: [
      { lonLat: [44.8, 41.7] as [number, number] },
      { lonLat: [44.7, 41.8] as [number, number] },
    ],
  };

  test("is the same for the same question, defaults spelled out or not", () => {
    assert.equal(
      routeSignature(a),
      routeSignature({
        ...a,
        mode: "drive",
        departure: "now",
        alternatives: false,
      }),
    );
  });

  test("changes with the order, the mode and the departure", () => {
    const reversed = { stops: [...a.stops].reverse() };
    assert.notEqual(routeSignature(a), routeSignature(reversed));
    assert.notEqual(routeSignature(a), routeSignature({ ...a, mode: "walk" }));
    assert.notEqual(
      routeSignature(a),
      routeSignature({ ...a, departure: "2030-01-01T00:00:00Z" }),
    );
  });

  test("ignores noise below ten centimetres", () => {
    const b = {
      stops: [
        { lonLat: [44.8000000001, 41.7] as [number, number] },
        a.stops[1],
      ],
    };
    assert.equal(routeSignature(a), routeSignature(b));
  });
});

describe("joinAnswers", () => {
  const answer = (
    over: Partial<RouteAnswer["routes"][number]>,
    computedAt: string,
  ): RouteAnswer => ({
    routes: [
      {
        distanceM: 1000,
        durationS: 100,
        staticDurationS: 90,
        path: [
          [44, 41],
          [44.1, 41.1],
        ],
        legs: [
          {
            distanceM: 1000,
            durationS: 100,
            staticDurationS: 90,
            path: [
              [44, 41],
              [44.1, 41.1],
            ],
          },
        ],
        description: "via A",
        labels: [],
        warnings: [],
        ...over,
      },
    ],
    mode: "drive",
    traffic: "live",
    computedAt,
    fallback: null,
  });

  test("one answer stays itself", () => {
    const one = answer({}, "2030-01-01T00:00:00Z");
    assert.equal(joinAnswers([one]), one);
  });

  test("legs go end to end, totals add, the oldest part sets the age", () => {
    const joined = joinAnswers([
      answer({ warnings: ["tolls"] }, "2030-01-01T00:05:00Z"),
      answer(
        { distanceM: 500, durationS: 50, warnings: ["tolls", "ferry"] },
        "2030-01-01T00:01:00Z",
      ),
    ]);
    const [route] = joined.routes;
    assert.equal(route.distanceM, 1500);
    assert.equal(route.durationS, 150);
    assert.equal(route.legs.length, 2);
    assert.deepEqual(route.warnings, ["tolls", "ferry"]);
    assert.equal(joined.computedAt, "2030-01-01T00:01:00Z");
    assert.equal(joined.routes.length, 1);
  });
});
