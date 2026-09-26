import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { candidates, idSequence, P, PREV } from "../test-fixtures.ts";
import { straightLineTravel } from "../travel.ts";
import type { Constraints } from "./constraints.ts";
import { fallbackPlan, splitDays } from "./fallback.ts";
import {
  type ComposeFeedback,
  type Composer,
  candidateRefs,
  generate,
  type PlanCache,
} from "./pipeline.ts";
import type { Candidate, Plan, RefPlan } from "./plan.ts";

const constraints: Constraints = {
  startDate: PREV, // Tuesday; day 2 is Wednesday, when the museum is closed
  days: 2,
  areas: ["kazbegi-corridor"],
  pace: "moderate",
  interests: [],
  party: { adults: 2, children: 0 },
  mobility: "moderate",
  budgetEur: 700,
};

// The model only ever sees curated places; the fixtures' verified and raw
// places are for validator tests.
const curated = [...candidates.values()].filter((c) => c.tier === "curated");
const { toRef } = candidateRefs(curated);
const ref = (placeId: string) => toRef.get(placeId) ?? "p999";

const goodPlan = (): RefPlan => ({
  days: [
    {
      day: 1,
      theme: "Up the Military Road",
      stayRef: ref(P.roomsGudauri),
      stops: [
        {
          ref: ref(P.friendship),
          slot: "afternoon",
          kind: "visit",
          durationMin: 40,
        },
      ],
    },
    {
      day: 2,
      theme: "Kazbegi",
      stayRef: ref(P.roomsKazbegi),
      stops: [
        { ref: ref(P.zetaCamp), slot: "midday", kind: "meal", durationMin: 75 },
        {
          ref: ref(P.gergeti),
          slot: "afternoon",
          kind: "visit",
          durationMin: 160,
        },
        {
          ref: ref(P.cafe5047),
          slot: "evening",
          kind: "meal",
          durationMin: 90,
        },
      ],
    },
  ],
});

const invented = (): RefPlan => {
  const plan = goodPlan();
  plan.days[1].stops[1].ref = "p99";
  return plan;
};

function memoryCache(initial?: Plan) {
  const store = new Map<string, Plan>();
  const calls: string[] = [];
  const cache: PlanCache & { calls: string[]; seed(plan: Plan): void } = {
    calls,
    seed(plan) {
      store.set("__seed__", plan);
    },
    async get(key) {
      calls.push("get");
      return store.get(key) ?? store.get("__seed__") ?? null;
    },
    async put(key, plan) {
      calls.push("put");
      store.set(key, plan);
    },
    async drop(key) {
      calls.push("drop");
      store.delete(key);
      store.delete("__seed__");
    },
  };
  if (initial) cache.seed(initial);
  return cache;
}

function scripted(...replies: (RefPlan | Error)[]) {
  const seen: (ComposeFeedback | undefined)[] = [];
  const compose: Composer = async (_input, feedback) => {
    seen.push(feedback);
    const reply = replies.shift();
    if (!reply) throw new Error("composer called too many times");
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { compose, seen };
}

const deps = (compose: Composer, cache = memoryCache()) => ({
  compose,
  cache,
  candidates: curated,
  travel: straightLineTravel,
  newId: idSequence(),
  describeHours: () => "unknown",
});

describe("generate", () => {
  test("a clean first attempt is used and cached", async () => {
    const { compose } = scripted(goodPlan());
    const cache = memoryCache();
    const result = await generate(constraints, deps(compose, cache));
    assert.ok(result.ok);
    assert.equal(result.source, "model");
    assert.ok(cache.calls.includes("put"));
    assert.equal(
      Object.values(result.doc.nodes).filter((n) => n.kind === "visit").length,
      2,
    );
  });

  test("an invented place is rejected and the retry is told which", async () => {
    const { compose, seen } = scripted(invented(), goodPlan());
    const result = await generate(constraints, deps(compose));
    assert.ok(result.ok);
    assert.equal(result.source, "retry");
    assert.deepEqual(seen[1]?.invented, ["p99"]);
    assert.deepEqual(
      result.attempts.map((a) => [a.source, a.ok]),
      [
        ["model", false],
        ["retry", true],
      ],
    );
  });

  test("scheduling problems go back to the model in words", async () => {
    const bad = goodPlan();
    // An outdoor hike in the evening can't end before dark.
    bad.days[1].stops[1].slot = "evening";
    const { compose, seen } = scripted(bad, goodPlan());
    const result = await generate(constraints, deps(compose));
    assert.ok(result.ok);
    assert.ok(seen[1]?.problems.some((p) => /after dark/.test(p)));
  });

  test("two failures fall back to the template plan", async () => {
    const { compose } = scripted(invented(), new Error("503 from the model"));
    const result = await generate(constraints, deps(compose));
    assert.ok(result.ok, JSON.stringify(result.attempts, null, 1));
    assert.equal(result.source, "template");
    assert.equal(result.attempts[1].error, "503 from the model");
  });

  test("with nowhere to go, it fails without calling the model", async () => {
    let calls = 0;
    const compose: Composer = async () => {
      calls++;
      throw new Error("should not be called");
    };
    const lodgingOnly = curated.filter((c) => c.group === "lodging");
    const result = await generate(constraints, {
      ...deps(compose),
      candidates: lodgingOnly,
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  });

  test("a plan the fallback can't rescue fails rather than render a hollow one", async () => {
    const { compose } = scripted(new Error("down"), new Error("down"));
    // One food place and one bed: no day has anything to see.
    const thin = curated.filter(
      (c) => c.group === "lodging" || c.group === "food",
    );
    const result = await generate(constraints, {
      ...deps(compose),
      candidates: thin,
    });
    assert.equal(result.ok, false);
  });

  test("a cache hit that still validates skips the model", async () => {
    const { compose } = scripted();
    const first = await generate(
      constraints,
      deps(scripted(goodPlan()).compose),
    );
    assert.ok(first.ok);
    const result = await generate(
      constraints,
      deps(compose, memoryCache(first.plan)),
    );
    assert.ok(result.ok);
    assert.equal(result.source, "cache");
  });

  test("a cache hit that doesn't fit these dates is dropped", async () => {
    const first = await generate(
      constraints,
      deps(scripted(goodPlan()).compose),
    );
    assert.ok(first.ok);
    // The museum is closed on day 2 (Wednesday) of these dates.
    const stale = structuredClone(first.plan);
    stale.days[1].stops[1] = {
      placeId: P.museum,
      slot: "afternoon",
      kind: "visit",
      durationMin: 90,
    };
    const cache = memoryCache(stale);
    const result = await generate(
      constraints,
      deps(scripted(goodPlan()).compose, cache),
    );
    assert.ok(result.ok);
    assert.equal(result.source, "model");
    assert.ok(cache.calls.includes("drop"));
  });
});

describe("fallbackPlan", () => {
  test("uses one base per area and fills the day shape for the pace", () => {
    const plan = fallbackPlan(constraints, curated);
    assert.equal(plan.days.length, 2);
    assert.equal(plan.days[0].stayId, plan.days[1].stayId);
    assert.deepEqual(
      plan.days[0].stops.map((s) => `${s.slot}:${s.kind}`),
      [
        "morning:visit",
        "morning:visit",
        "midday:meal",
        "afternoon:visit",
        "evening:meal",
      ],
    );
  });

  test("never repeats a visit", () => {
    const plan = fallbackPlan(constraints, curated);
    const visits = plan.days.flatMap((d) =>
      d.stops.filter((s) => s.kind === "visit").map((s) => s.placeId),
    );
    assert.equal(new Set(visits).size, visits.length);
  });

  test("a long visit ends its slot, so the next one can still start", () => {
    const at = (id: string, group: Candidate["group"], lon: number) =>
      ({
        ...(candidates.get(P.gergeti) as Candidate),
        id,
        name: id,
        category: group,
        group,
        lonLat: [lon, 42.66],
      }) satisfies Candidate;
    const pool = [
      at("10000000-0000-4000-8000-000000000a01", "lodging", 44.64),
      at("10000000-0000-4000-8000-000000000a02", "nature", 44.641),
      at("10000000-0000-4000-8000-000000000a03", "nature", 44.642),
      at("10000000-0000-4000-8000-000000000a04", "heritage", 44.65),
      at("10000000-0000-4000-8000-000000000a05", "food", 44.643),
    ];
    const plan = fallbackPlan({ ...constraints, interests: ["nature"] }, pool);
    for (const day of plan.days) {
      day.stops.forEach((stop, i) => {
        const next = day.stops[i + 1];
        if (stop.kind === "visit" && stop.durationMin > 90) {
          assert.ok(
            !(next?.kind === "visit" && next.slot === stop.slot),
            `${day.day}: a visit follows ${stop.durationMin} min in the ${stop.slot}`,
          );
        }
      });
    }
  });

  test("leaves out excluded places", () => {
    const plan = fallbackPlan(constraints, curated, new Set([P.gergeti]));
    assert.ok(
      !plan.days.some((d) => d.stops.some((s) => s.placeId === P.gergeti)),
    );
  });
});

describe("splitDays", () => {
  test("in proportion, every area at least one day", () => {
    assert.deepEqual(
      splitDays(
        7,
        ["tbilisi-core", "kazbegi-corridor", "kakheti"],
        (a) =>
          ({ "tbilisi-core": 40, "kazbegi-corridor": 20, kakheti: 20 })[
            a as string
          ] ?? 0,
      ),
      [
        "tbilisi-core",
        "tbilisi-core",
        "tbilisi-core",
        "kazbegi-corridor",
        "kazbegi-corridor",
        "kakheti",
        "kakheti",
      ],
    );
  });

  test("fewer days than areas keeps the first ones", () => {
    assert.deepEqual(
      splitDays(1, ["svaneti", "kakheti"], () => 1),
      ["svaneti"],
    );
  });
});
