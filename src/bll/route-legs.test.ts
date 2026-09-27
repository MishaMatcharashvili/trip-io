import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LonLat } from "../domain/geo.ts";
import type { RoadRouter } from "../domain/trip/legs.ts";
import { routeLegs } from "./route-legs.ts";

const stops = (n: number): LonLat[] =>
  Array.from({ length: n }, (_, i) => [44 + i * 0.01, 41.7]);

/** A router that drives straight and records what it was asked. */
function fakeRouter(
  fail: (points: readonly LonLat[]) => boolean = () => false,
) {
  const calls: (readonly LonLat[])[] = [];
  const router: RoadRouter = {
    async route(points) {
      calls.push(points);
      if (fail(points)) return null;
      return { line: [...points], legsM: points.slice(1).map(() => 1) };
    },
  };
  return { router, calls };
}

describe("routeLegs", () => {
  test("one leg per pair of stops, in order", async () => {
    const points = stops(4);
    const { router } = fakeRouter();
    const legs = await routeLegs(points, router);
    assert.equal(legs.length, 3);
    legs.forEach((leg, i) => {
      assert.deepEqual(leg[0], points[i]);
      assert.deepEqual(leg[leg.length - 1], points[i + 1]);
    });
  });

  test("asks in chunks that share their boundary stop", async () => {
    const points = stops(60);
    const { router, calls } = fakeRouter();
    const legs = await routeLegs(points, router);
    assert.equal(legs.length, 59);
    assert.deepEqual(
      calls.map((c) => c.length),
      [25, 25, 12],
    );
    assert.deepEqual(calls[1][0], calls[0][24]);
  });

  test("a chunk the router cannot answer falls back to straight legs", async () => {
    const points = stops(30);
    const { router } = fakeRouter((p) => p[0] === points[24]);
    const legs = await routeLegs(points, router);
    assert.equal(legs.length, 29);
    assert.deepEqual(legs[26], [points[26], points[27]]);
  });

  test("nothing to route for fewer than two stops", async () => {
    const { router, calls } = fakeRouter();
    assert.deepEqual(await routeLegs(stops(1), router), []);
    assert.equal(calls.length, 0);
  });
});
