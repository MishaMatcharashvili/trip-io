import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { nodeEnd } from "../document.ts";
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
  routeProblems,
} from "./pipeline.ts";
import type { Candidate, Plan, RefPlan } from "./plan.ts";

const constraints: Constraints = {
  startDate: PREV, // Tuesday; day 2 is Wednesday, when the museum is closed
  days: 2,
  places: ["kazbegi"],
  // Nothing to drive to or from: the day is in Kazbegi from first to last.
  start: "kazbegi",
  finish: "kazbegi",
  pace: "moderate",
  dayEnds: "20:00",
  interests: [],
  party: { adults: 2, children: 0 },
  mobility: "moderate",
  budgetEur: 700,
  notes: "",
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
      // Arrives at two and runs until dinner: a full afternoon and evening.
      stops: [
        {
          ref: ref(P.friendship),
          slot: "afternoon",
          kind: "visit",
          durationMin: 40,
        },
        {
          ref: ref(P.museum),
          slot: "afternoon",
          kind: "visit",
          durationMin: 90,
        },
        {
          ref: ref(P.cafe5047),
          slot: "evening",
          kind: "meal",
          durationMin: 90,
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

/** The same trip with its second day filled from morning to dinner. */
const fullPlan = (): RefPlan => {
  const plan = goodPlan();
  plan.days[1].stops.unshift({
    ref: ref(P.friendship),
    slot: "morning",
    kind: "visit",
    durationMin: 45,
  });
  return plan;
};

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
    const { compose } = scripted(fullPlan());
    const cache = memoryCache();
    const result = await generate(constraints, deps(compose, cache));
    assert.ok(result.ok);
    assert.equal(result.source, "model");
    assert.ok(cache.calls.includes("put"));
    assert.equal(
      Object.values(result.doc.nodes).filter((n) => n.kind === "visit").length,
      4,
    );
  });

  test("an invented place is rejected and the retry is told which", async () => {
    const { compose, seen } = scripted(invented(), fullPlan());
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
    const { compose, seen } = scripted(bad, fullPlan());
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
      deps(scripted(fullPlan()).compose),
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
      deps(scripted(fullPlan()).compose),
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
      deps(scripted(fullPlan()).compose, cache),
    );
    assert.ok(result.ok);
    assert.equal(result.source, "model");
    assert.ok(cache.calls.includes("drop"));
  });

  describe("days with holes in them", () => {
    // goodPlan() leaves day 2's morning empty after the drive: 2h50, and a
    // moderate day leaves at most 2h.
    test("the model is told where, and a fuller retry is used and cached", async () => {
      const { compose, seen } = scripted(goodPlan(), fullPlan());
      const cache = memoryCache();
      const result = await generate(constraints, deps(compose, cache));
      assert.ok(result.ok);
      assert.equal(result.source, "retry");
      assert.match(seen[1]?.problems[0] ?? "", /2h50 with nothing planned/);
      assert.deepEqual(seen[1]?.invented, []);
      assert.ok(cache.calls.includes("put"));
    });

    test("two museums in a day nobody asked for go back to the model", async () => {
      // Sorts after every fixture, so the other refs stay what they were.
      const gallery: Candidate = {
        ...(candidates.get(P.museum) as Candidate),
        id: "f0000000-0000-4000-8000-000000000001",
        name: "Kazbegi Gallery",
        category: "art_gallery",
      };
      // The fixture's museum is filed under its group; the catalogue's are "museum".
      const pool = [
        ...curated.map((p) =>
          p.id === P.museum ? { ...p, category: "museum" } : p,
        ),
        gallery,
      ];
      const heavy = fullPlan();
      heavy.days[0].stops[0] = {
        ref: `p${pool.length}`,
        slot: "afternoon",
        kind: "visit",
        durationMin: 40,
      };
      const { compose, seen } = scripted(heavy, fullPlan());
      const cache = memoryCache();
      const result = await generate(
        { ...constraints, interests: ["food", "nature"] },
        { ...deps(compose, cache), candidates: pool },
      );
      assert.ok(result.ok);
      assert.equal(result.source, "retry");
      assert.match(
        seen[1]?.problems.join("\n") ?? "",
        /2 museums and galleries \("Kazbegi Gallery", /,
      );
      assert.ok(cache.calls.includes("put"));
    });

    test("a plan that stays sparse is still the trip, but is not cached", async () => {
      const { compose } = scripted(goodPlan(), goodPlan());
      const cache = memoryCache();
      const result = await generate(constraints, deps(compose, cache));
      assert.ok(result.ok);
      assert.equal(result.source, "model");
      assert.deepEqual(
        result.attempts.map((a) => a.source),
        ["model", "retry"],
      );
      assert.ok(!cache.calls.includes("put"));
    });

    test("a retry that breaks something does not cost the sparse plan", async () => {
      const { compose } = scripted(goodPlan(), invented());
      const result = await generate(constraints, deps(compose));
      assert.ok(result.ok);
      assert.equal(result.source, "model");
    });

    test("a cached plan with a hole is composed again", async () => {
      const sparse = await generate(
        constraints,
        deps(scripted(goodPlan(), goodPlan()).compose),
      );
      assert.ok(sparse.ok);
      const cache = memoryCache(sparse.plan);
      const result = await generate(
        constraints,
        deps(scripted(fullPlan()).compose, cache),
      );
      assert.ok(result.ok);
      assert.equal(result.source, "model");
      assert.ok(cache.calls.includes("drop"));
    });

    test("a relaxed day may rest between its stops", async () => {
      const result = await generate(
        { ...constraints, pace: "relaxed" },
        deps(scripted(goodPlan()).compose),
      );
      assert.ok(result.ok);
      assert.equal(result.source, "model");
      assert.equal(result.attempts.length, 1);
    });
  });
});

// Two places a day's drive apart, each with a bed, a table and things to see.
const somewhere = (
  slug: string,
  n: number,
  group: Candidate["group"],
  lonLat: [number, number],
) =>
  ({
    ...(candidates.get(P.gergeti) as Candidate),
    id: `20000000-0000-4000-8000-0000000${slug === "tbilisi" ? "a" : "b"}00${n}`,
    name: `${slug} ${group} ${n}`,
    category: group,
    group,
    lonLat,
    openingHours: null,
    outdoor: false,
    area: slug,
    areas: [slug],
  }) satisfies Candidate;
const town = (slug: string, lon: number, lat: number) => [
  somewhere(slug, 1, "lodging", [lon, lat]),
  somewhere(slug, 2, "heritage", [lon + 0.002, lat]),
  somewhere(slug, 3, "heritage", [lon + 0.004, lat]),
  somewhere(slug, 4, "culture", [lon + 0.006, lat]),
  somewhere(slug, 5, "food", [lon + 0.003, lat]),
];
const acrossGeorgia = [
  ...town("tbilisi", 44.8, 41.695),
  ...town("mestia", 42.72, 43.045),
];
const down: Composer = async () => {
  throw new Error("down");
};

describe("the route", () => {
  const route: Constraints = {
    ...constraints,
    places: ["tbilisi", "mestia"],
    start: "tbilisi",
    finish: "mestia",
  };

  test("a plan that leaves a place out says which", () => {
    const plan = fallbackPlan({ ...route, places: ["tbilisi"] }, acrossGeorgia);
    const problems = routeProblems(
      plan,
      route.places,
      new Map(acrossGeorgia.map((p) => [p.id, p])),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Mestia is on the route/);
  });

  test("the start and the finish need no stop of their own", () => {
    const plan = fallbackPlan({ ...route, places: ["mestia"] }, acrossGeorgia);
    assert.deepEqual(
      routeProblems(
        plan,
        ["mestia"],
        new Map(acrossGeorgia.map((p) => [p.id, p])),
      ),
      [],
    );
  });

  test("the model's plan is rejected until every place is in it", async () => {
    const { toRef } = candidateRefs(acrossGeorgia);
    const stop = (id: string, slot: "morning" | "afternoon") => ({
      ref: toRef.get(id) as string,
      slot,
      kind: "visit" as const,
      durationMin: 60,
    });
    const [bed, church] = acrossGeorgia;
    const onlyTbilisi: RefPlan = {
      days: [1, 2].map((day) => ({
        day,
        theme: "Tbilisi",
        stayRef: toRef.get(bed.id) as string,
        stops: [stop(acrossGeorgia[day].id, "morning")],
      })),
    };
    assert.equal(church.areas[0], "tbilisi");
    const { compose, seen } = scripted(onlyTbilisi, new Error("down"));
    const result = await generate(route, {
      ...deps(compose),
      candidates: acrossGeorgia,
    });
    assert.ok(seen[1]?.problems.some((p) => /Mestia is on the route/.test(p)));
    assert.ok(result.ok, JSON.stringify(result.attempts, null, 1));
    assert.equal(result.source, "template");
  });

  test("the fallback starts at the start, ends at the finish, and drives first", async () => {
    const result = await generate(route, {
      ...deps(down),
      candidates: acrossGeorgia,
    });
    assert.ok(result.ok, JSON.stringify(result.attempts, null, 1));
    const [first, last] = result.plan.days;
    const areaOf = (id: string) => acrossGeorgia.find((p) => p.id === id)?.area;
    assert.ok(first.stops.every((s) => areaOf(s.placeId) === "tbilisi"));
    assert.ok(last.stops.every((s) => areaOf(s.placeId) === "mestia"));
    // Six and a half hours on the road: nothing before the afternoon.
    assert.ok(last.stops.length > 0);
    assert.ok(
      last.stops.every((s) => s.slot === "afternoon" || s.slot === "evening"),
    );
    assert.ok(
      Object.values(result.doc.nodes).some((n) => n.kind === "transfer"),
    );
  });

  test("a day trip drives out from the start, fills the day, and drives back to the finish", async () => {
    const dayTrip: Constraints = {
      ...route,
      days: 1,
      places: ["signagi"],
      start: "tbilisi",
      finish: "tbilisi",
    };
    const result = await generate(dayTrip, {
      ...deps(down),
      candidates: town("signagi", 45.724, 41.484),
    });
    assert.ok(result.ok, JSON.stringify(result.attempts, null, 1));
    const titles = Object.values(result.doc.nodes)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((n) => n.meta.title);
    assert.match(titles[0], /^Drive to /);
    assert.equal(titles.at(-1), "Drive to Tbilisi");
    // A full day, not a morning: the afternoon has its visits, and the
    // drive home is not cut short by dusk.
    const nodes = Object.values(result.doc.nodes).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    const home = nodes.at(-1);
    assert.ok(home);
    const local = (ms: number) =>
      new Date(ms + 4 * 3_600_000).toISOString().slice(11, 16);
    assert.ok(local(Date.parse(home.startsAt)) >= "17:00");
    assert.ok(local(nodeEnd(home)) <= "22:00");
    assert.ok(
      nodes.filter((n) => n.kind === "visit").length >= 3,
      titles.join(", "),
    );
    // And no bed: the traveller sleeps where they started.
    assert.ok(!titles.some((t) => t.startsWith("Check in")));
  });

  test("a place with nothing to visit is named, before any model call", async () => {
    const result = await generate(route, {
      ...deps(down),
      candidates: acrossGeorgia.filter(
        (p) => p.area === "tbilisi" || p.group === "lodging",
      ),
    });
    assert.ok(!result.ok);
    assert.deepEqual(result.uncovered, ["mestia"]);
    assert.deepEqual(result.attempts, []);
  });
});

describe("fallbackPlan", () => {
  test("a morning the drive has used up gets one visit, and the rest go to the afternoon", () => {
    // Two hours from Tbilisi to Sighnaghi: arriving after eleven leaves room
    // for one visit before noon, not two.
    const plan = fallbackPlan(
      {
        ...constraints,
        days: 1,
        places: ["signagi"],
        start: "tbilisi",
        finish: "tbilisi",
      },
      town("signagi", 45.724, 41.484),
    );
    const slots = plan.days[0].stops
      .filter((s) => s.kind === "visit")
      .map((s) => s.slot);
    assert.deepEqual(slots, ["morning", "afternoon", "afternoon"]);
  });

  test("uses one base per area, and each day takes its share of what there is to visit", () => {
    const plan = fallbackPlan(constraints, curated);
    assert.equal(plan.days.length, 2);
    assert.equal(plan.days[0].stayId, plan.days[1].stayId);
    // Two to visit on each of two days: the first does not take them all.
    assert.deepEqual(
      plan.days[0].stops.map((s) => `${s.slot}:${s.kind}`),
      ["morning:visit", "morning:visit", "midday:meal", "evening:meal"],
    );
    assert.ok(plan.days[1].stops.some((s) => s.kind === "visit"));
  });

  test("with enough to see, a moderate day fills its afternoon too", () => {
    const rich = [
      ...curated,
      ...[1, 2, 3, 4].map((n) =>
        somewhere("kazbegi", n, "heritage", [44.64 + n * 0.004, 42.66]),
      ),
    ];
    const plan = fallbackPlan({ ...constraints, days: 1 }, rich);
    assert.deepEqual(
      plan.days[0].stops.map((s) => `${s.slot}:${s.kind}`),
      [
        "morning:visit",
        "morning:visit",
        "midday:meal",
        "afternoon:visit",
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
        ["tbilisi", "kazbegi", "kakheti"],
        (a) => ({ tbilisi: 40, kazbegi: 20, kakheti: 20 })[a] ?? 0,
      ),
      [
        "tbilisi",
        "tbilisi",
        "tbilisi",
        "kazbegi",
        "kazbegi",
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
