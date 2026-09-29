import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RouteAnswer } from "../domain/route/contract.ts";
import type { TripRoute } from "../ui/map/use-trip-route.ts";
import { describeRoute } from "./route-model.ts";

const NOW = new Date("2030-05-01T06:10:00Z");
const leg = { distanceM: 1, durationS: 1, typicalDurationS: null, path: [] };
const snap = (distanceM: number) => ({
  lonLat: [44.8, 41.7] as [number, number],
  distanceM,
  road: null,
});
const two = [{ label: "Tbilisi" }, { label: "Rustavi" }];
const answer = (over: Partial<RouteAnswer> = {}): RouteAnswer => ({
  routes: [
    {
      distanceM: 22_400,
      durationS: 1310,
      typicalDurationS: 1200,
      path: [],
      legs: [leg],
      description: "Kakheti Hwy",
    },
  ],
  stops: [snap(4), snap(9)],
  mode: "drive",
  traffic: "live",
  computedAt: "2030-05-01T06:07:00Z",
  ...over,
});
const ready = (a: RouteAnswer, refreshing = false): TripRoute => ({
  status: "ready",
  answer: a,
  refreshing,
});

describe("describeRoute", () => {
  test("a ready route says time, distance, what kind of estimate and how old", () => {
    const view = describeRoute(ready(answer()), 0, two, NOW);
    assert.ok(view.kind === "ready");
    assert.equal(view.time, "22 min");
    assert.equal(view.distance, "22 km");
    assert.match(
      view.basis,
      /Calculated 3 min ago with traffic data where Mapbox has it/,
    );
    assert.equal(view.typical, "Usually 20 min");
    assert.deepEqual(view.warnings, []);
    assert.equal(view.via, "via Kakheti Hwy");
    assert.deepEqual(view.choices, []);
  });

  test("a future departure is called a prediction, never live traffic", () => {
    const view = describeRoute(
      ready(answer({ traffic: "predicted" })),
      0,
      two,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.match(view.basis, /for the departure time from usual traffic/);
    assert.doesNotMatch(view.basis, /live traffic data|observed/);
    assert.match(view.basis, /not live conditions/);
  });

  test("walking has no traffic to speak of", () => {
    const view = describeRoute(
      ready(answer({ traffic: "none", mode: "walk" })),
      0,
      two,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.match(view.basis, /Walking/);
  });

  test("never claims every road has live observations", () => {
    const view = describeRoute(ready(answer()), 0, two, NOW);
    assert.ok(view.kind === "ready");
    assert.match(view.basis, /not every road is observed/);
    assert.doesNotMatch(view.basis, /current traffic|live traffic\b/);
  });

  test("says the time is the drive, and leaves the visits out of it", () => {
    const view = describeRoute(ready(answer()), 0, two, NOW);
    assert.ok(view.kind === "ready");
    assert.match(view.scope, /Driving time only.*at stops isn't included/);
  });

  test("the usual time is shown only when it differs from the time now", () => {
    const same = answer();
    same.routes[0].typicalDurationS = 1310;
    const view = describeRoute(ready(same), 0, two, NOW);
    assert.ok(view.kind === "ready");
    assert.equal(view.typical, null);
    const none = answer();
    none.routes[0].typicalDurationS = null;
    const walking = describeRoute(ready(none), 0, two, NOW);
    assert.ok(walking.kind === "ready");
    assert.equal(walking.typical, null);
  });

  test("a stop a long way from any road is named, with how far", () => {
    const view = describeRoute(
      ready(answer({ stops: [snap(4), snap(3400)] })),
      0,
      two,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.deepEqual(view.warnings, [
      "Rustavi is 3.4 km from the nearest road; the route ends at the road.",
    ]);
  });

  test("a trip with several stretches lists each, with its own time", () => {
    const three = answer();
    three.routes[0].legs = [
      { ...leg, durationS: 6120, distanceM: 118_000 },
      { ...leg, durationS: 3000, distanceM: 47_000 },
    ];
    const view = describeRoute(
      ready(three),
      0,
      [{ label: "Tbilisi" }, { label: "Gudauri" }, { label: "Stepantsminda" }],
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.deepEqual(
      view.legs.map((l) => [l.label, l.time, l.distance]),
      [
        ["Tbilisi to Gudauri", "1h 42m", "118 km"],
        ["Gudauri to Stepantsminda", "50 min", "47 km"],
      ],
    );
  });

  test("a stop with no road near it is named when the provider says which", () => {
    const view = describeRoute(
      { status: "failed", reason: "unroutable-stop", stop: 1 },
      0,
      two,
      NOW,
    );
    assert.ok(view.kind === "failed");
    assert.match(view.text, /^Rustavi has no road near enough/);
    assert.equal(view.canRetry, false);
    const unnamed = describeRoute(
      { status: "failed", reason: "unroutable-stop" },
      0,
      two,
      NOW,
    );
    assert.ok(unnamed.kind === "failed");
    assert.match(unnamed.text, /A stop has no road/);
  });

  test("alternatives are listed with the chosen one marked", () => {
    const both = answer();
    both.routes.push({
      ...both.routes[0],
      description: "Old road",
      durationS: 1500,
    });
    const view = describeRoute(ready(both), 1, two, NOW);
    assert.ok(view.kind === "ready");
    assert.equal(view.choices.length, 2);
    assert.deepEqual(
      view.choices.map((c) => c.selected),
      [false, true],
    );
    assert.equal(view.time, "25 min");
  });

  test("a refresh shows the previous answer as updating", () => {
    const view = describeRoute(ready(answer(), true), 0, two, NOW);
    assert.ok(view.kind === "ready" && view.updating);
  });

  test("each failure says what happened, and only fixable ones offer a retry", () => {
    const failed = (
      reason: Extract<TripRoute, { status: "failed" }>["reason"],
    ) => describeRoute({ status: "failed", reason }, 0, two, NOW);
    assert.match((failed("no-route") as { text: string }).text, /No road/);
    assert.equal((failed("no-route") as { canRetry: boolean }).canRetry, false);
    assert.equal((failed("timeout") as { canRetry: boolean }).canRetry, true);
    assert.match(
      (failed("quota") as { text: string }).text,
      /paused for today/,
    );
    assert.match((failed("signed-out") as { text: string }).text, /Sign in/);
    for (const reason of [
      "signed-out",
      "offline",
      "no-route",
      "unroutable-stop",
      "invalid",
      "rate-limited",
      "quota",
      "not-configured",
      "auth",
      "timeout",
      "upstream",
      "malformed",
    ] as const) {
      assert.ok((failed(reason) as { text: string }).text.length > 0);
    }
  });

  test("with nothing to route, or nothing yet, it says so instead of drawing a line", () => {
    assert.match(
      (
        describeRoute({ status: "off" }, 0, two.slice(0, 1), NOW) as {
          text: string;
        }
      ).text,
      /second stop/,
    );
    assert.equal(
      describeRoute({ status: "loading" }, 0, [...two, two[0]], NOW).kind,
      "loading",
    );
  });
});
