import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RequestState } from "../dal/plans.ts";
import type { LonLat } from "../domain/geo.ts";
import { initialState } from "../domain/trip/generate/intake.ts";
import type { Candidate } from "../domain/trip/generate/plan.ts";
import {
  type BuildDeps,
  buildTripOnce,
  type GeneratedTrip,
  loadRoadStops,
  merged,
  type RoadStopDeps,
} from "./trip-generation.ts";

const wanted = initialState("2026-10-07").constraints;
const REQUEST = "5f0d1c1e-0000-4000-8000-000000000001";

/** The request table as one row, and a generator that counts its calls. */
function world(start: RequestState | null = null) {
  let row = start;
  let built = 0;
  const deps: BuildDeps = {
    claim: async () => {
      if (row) return row;
      row = { status: "pending" };
      return { status: "claimed" };
    },
    state: async () => row,
    finish: async (_id, tripId) => {
      if (row?.status !== "pending") return false;
      row = { status: "done", tripId };
      return true;
    },
    release: async () => {
      if (row?.status === "pending") row = null;
    },
    generate: async (_wanted, _userId, options) => {
      if (!(await options?.stillWanted?.())) {
        return { ok: false, reason: "cancelled" };
      }
      built += 1;
      return { ok: true, tripId: `trip-${built}` } as GeneratedTrip;
    },
  };
  return {
    deps,
    built: () => built,
    row: () => row,
    cancel: () => {
      row = { status: "cancelled" };
    },
  };
}

describe("buildTripOnce", () => {
  test("the same request twice is one trip", async () => {
    const w = world();
    const first = await buildTripOnce(REQUEST, wanted, "u1", w.deps);
    const second = await buildTripOnce(REQUEST, wanted, "u1", w.deps);
    assert.equal(first.kind, "built");
    assert.deepEqual(second, { kind: "existing", tripId: "trip-1" });
    assert.equal(w.built(), 1);
  });

  test("a request still being built is not built again", async () => {
    const w = world({ status: "pending" });
    assert.deepEqual(await buildTripOnce(REQUEST, wanted, "u1", w.deps), {
      kind: "in-progress",
    });
    assert.equal(w.built(), 0);
  });

  test("cancelled while composing writes no trip", async () => {
    const w = world();
    const outcome = await buildTripOnce(REQUEST, wanted, "u1", {
      ...w.deps,
      generate: async (wanted_, userId, options) => {
        w.cancel();
        return w.deps.generate(wanted_, userId, options);
      },
    });
    assert.deepEqual(outcome, { kind: "cancelled" });
    assert.equal(w.built(), 0);
    assert.deepEqual(w.row(), { status: "cancelled" });
  });

  test("a cancelled request stays cancelled", async () => {
    const w = world({ status: "cancelled" });
    assert.deepEqual(await buildTripOnce(REQUEST, wanted, "u1", w.deps), {
      kind: "cancelled",
    });
    assert.equal(w.built(), 0);
  });

  test("a failed build can be tried again under the same id", async () => {
    const w = world();
    const failed = await buildTripOnce(REQUEST, wanted, "u1", {
      ...w.deps,
      generate: async () => ({
        ok: false,
        reason: "insufficient-coverage",
        attempts: [],
        explanations: [],
      }),
    });
    assert.equal(failed.kind, "failed");
    assert.equal(w.row(), null);
    assert.equal(
      (await buildTripOnce(REQUEST, wanted, "u1", w.deps)).kind,
      "built",
    );
  });

  test("a build that throws releases the request", async () => {
    const w = world();
    await assert.rejects(
      buildTripOnce(REQUEST, wanted, "u1", {
        ...w.deps,
        generate: async () => {
          throw new Error("model down");
        },
      }),
    );
    assert.equal(w.row(), null);
  });
});

describe("stops on the road", () => {
  const roundTrip = {
    start: "tbilisi",
    places: ["kutaisi"],
    finish: "tbilisi",
  };
  const fort = (roads: string[]): Candidate => ({
    id: "fort",
    name: "Gori Fortress",
    category: "fort",
    group: "heritage",
    tier: "verified",
    lonLat: [44.108, 41.986],
    openingHours: null,
    outdoor: true,
    area: roads[0],
    areas: [],
    roads,
  });

  /** A straight road with a hundred bends too small to matter. */
  const wiggly = (from: LonLat, to: LonLat): LonLat[] =>
    Array.from({ length: 101 }, (_, i) => [
      from[0] + ((to[0] - from[0]) * i) / 100,
      from[1] + ((to[1] - from[1]) * i) / 100 + (i % 2 ? 0.00001 : 0),
    ]);

  test("a road driven there and back is routed once, and searched both ways", async () => {
    let routed = 0;
    const asked: Parameters<RoadStopDeps["find"]>[0][] = [];
    const stops = await loadRoadStops(roundTrip, {
      road: async (from, to) => {
        routed += 1;
        return wiggly(from, to);
      },
      find: async (query) => {
        asked.push(query);
        return [fort([query.label])];
      },
    });
    assert.equal(routed, 1);
    assert.deepEqual(
      asked.map((q) => q.label),
      ["tbilisi > kutaisi", "kutaisi > tbilisi"],
    );
    // Sent simplified: the bends are inside the tolerance.
    assert.equal(asked[0].road.length, 2);
    assert.deepEqual(
      merged(stops).map((s) => s.roads),
      [["tbilisi > kutaisi", "kutaisi > tbilisi"]],
    );
  });

  test("a road that cannot be routed, or searched, has no stops and fails nothing", async () => {
    const none = await loadRoadStops(roundTrip, {
      road: async () => null,
      find: async () => [fort(["x"])],
    });
    assert.deepEqual(none, []);
    const thrown = await loadRoadStops(roundTrip, {
      road: async () => {
        throw new Error("quota");
      },
      find: async () => [fort(["x"])],
    });
    assert.deepEqual(thrown, []);
    const unsearched = await loadRoadStops(roundTrip, {
      road: async (from, to) => [from, to],
      find: async () => {
        throw new Error("database");
      },
    });
    assert.deepEqual(unsearched, []);
  });

  test("a rating found by one search is kept when another finds the place too", () => {
    const rating = { value: 4.4, count: 900 };
    const [one] = merged([
      { ...fort(["tbilisi > kutaisi"]) },
      { ...fort([]), roads: undefined, rating },
    ]);
    assert.deepEqual(one.rating, rating);
  });

  test("a place in a town on the trip and on the road keeps both", () => {
    const [one] = merged([
      { ...fort([]), roads: undefined, area: "gori", areas: ["gori"] },
      fort(["tbilisi > kutaisi"]),
    ]);
    assert.deepEqual(one.areas, ["gori"]);
    assert.deepEqual(one.roads, ["tbilisi > kutaisi"]);
    assert.equal(one.area, "gori");
  });
});
