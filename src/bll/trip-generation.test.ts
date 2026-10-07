import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RequestState } from "../dal/plans.ts";
import { initialState } from "../domain/trip/generate/intake.ts";
import {
  type BuildDeps,
  buildTripOnce,
  type GeneratedTrip,
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
