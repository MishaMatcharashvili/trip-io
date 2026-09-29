import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RouteAnswer } from "../domain/route/contract.ts";
import type { TripRoute } from "../ui/map/use-trip-route.ts";
import { describeRoute } from "./route-model.ts";

const NOW = new Date("2030-05-01T06:10:00Z");
const leg = { distanceM: 1, durationS: 1, staticDurationS: null, path: [] };
const answer = (over: Partial<RouteAnswer> = {}): RouteAnswer => ({
  routes: [
    {
      distanceM: 22_400,
      durationS: 1310,
      staticDurationS: 1200,
      path: [],
      legs: [leg],
      description: "Kakheti Hwy",
      labels: [],
      warnings: ["This route has tolls."],
    },
  ],
  mode: "drive",
  traffic: "live",
  computedAt: "2030-05-01T06:07:00Z",
  fallback: null,
  ...over,
});
const ready = (a: RouteAnswer, refreshing = false): TripRoute => ({
  status: "ready",
  answer: a,
  refreshing,
});

describe("describeRoute", () => {
  test("a ready route says time, distance, what kind of estimate and how old", () => {
    const view = describeRoute(ready(answer()), 0, 2, NOW);
    assert.ok(view.kind === "ready");
    assert.equal(view.time, "22 min");
    assert.equal(view.distance, "22 km");
    assert.match(view.basis, /current traffic, 3 min ago/);
    assert.deepEqual(view.warnings, ["This route has tolls."]);
    assert.equal(view.via, "via Kakheti Hwy");
    assert.deepEqual(view.choices, []);
  });

  test("a future departure is called a prediction, never live traffic", () => {
    const view = describeRoute(
      ready(answer({ traffic: "predicted" })),
      0,
      2,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.match(view.basis, /Predicted/);
    assert.doesNotMatch(view.basis, /current traffic/);
  });

  test("walking has no traffic to speak of", () => {
    const view = describeRoute(
      ready(answer({ traffic: "none", mode: "walk" })),
      0,
      2,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.match(view.basis, /Walking/);
  });

  test("a provider fallback is passed on as a caution", () => {
    const view = describeRoute(
      ready(
        answer({
          fallback: {
            mode: "FALLBACK_TRAFFIC_UNAWARE",
            reason: "SERVER_ERROR",
          },
        }),
      ),
      0,
      2,
      NOW,
    );
    assert.ok(view.kind === "ready");
    assert.ok(view.fallback);
  });

  test("alternatives are listed with the chosen one marked", () => {
    const two = answer();
    two.routes.push({
      ...two.routes[0],
      description: "Old road",
      durationS: 1500,
    });
    const view = describeRoute(ready(two), 1, 2, NOW);
    assert.ok(view.kind === "ready");
    assert.equal(view.choices.length, 2);
    assert.deepEqual(
      view.choices.map((c) => c.selected),
      [false, true],
    );
    assert.equal(view.time, "25 min");
  });

  test("a refresh shows the previous answer as updating", () => {
    const view = describeRoute(ready(answer(), true), 0, 2, NOW);
    assert.ok(view.kind === "ready" && view.updating);
  });

  test("each failure says what happened, and only fixable ones offer a retry", () => {
    const failed = (
      reason: Extract<TripRoute, { status: "failed" }>["reason"],
    ) => describeRoute({ status: "failed", reason }, 0, 2, NOW);
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
      (describeRoute({ status: "off" }, 0, 1, NOW) as { text: string }).text,
      /second stop/,
    );
    assert.equal(
      describeRoute({ status: "loading" }, 0, 3, NOW).kind,
      "loading",
    );
  });
});
