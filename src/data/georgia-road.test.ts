import assert from "node:assert/strict";
import { test } from "node:test";
import { haversineM } from "../domain/geo.ts";
import { georgiaRoad } from "./georgia-road.ts";
import { georgiaMapStops } from "./trip.ts";

test("the recorded road is the one through the example's stops", () => {
  // A stop moved or added since recording: `pnpm record:example-road`.
  assert.deepEqual(
    georgiaRoad.stops,
    georgiaMapStops.map((s) => s.lonLat),
  );
  const [route] = georgiaRoad.answer.routes;
  assert.equal(route.legs.length, georgiaMapStops.length - 1);
  assert.equal(georgiaRoad.answer.stops.length, georgiaMapStops.length);
});

test("its legs meet, and end beside their stops", () => {
  const { legs } = georgiaRoad.answer.routes[0];
  legs.forEach((leg, i) => {
    const from = georgiaRoad.answer.stops[i].lonLat;
    const to = georgiaRoad.answer.stops[i + 1].lonLat;
    assert.ok(haversineM(leg.path[0], from) < 5, `leg ${i} starts at its stop`);
    assert.ok(
      haversineM(leg.path.at(-1) ?? from, to) < 5,
      `leg ${i} ends at its stop`,
    );
  });
  for (const snap of georgiaRoad.answer.stops) {
    assert.ok(snap.distanceM < 500, "every stop is beside a road");
  }
});
