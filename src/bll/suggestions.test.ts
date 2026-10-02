import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PlaceHit } from "../dal/places.ts";
import type { Suggester } from "../domain/trip/suggest.ts";
import { kazbegiDoc, N, P, places } from "../domain/trip/test-fixtures.ts";
import { type SuggestDeps, suggestForStop } from "./suggestions.ts";

// The use case with every dependency faked: what matters here is the order the
// pieces are used in and what is promised about the result, not the rules (which
// src/domain/trip/suggest.test.ts holds) or the model (which is mocked).

const GEORGIAN_CATEGORY: Record<string, string> = {
  [P.zetaCamp]: "restaurant",
  [P.gergeti]: "christian_place_of_worship",
  [P.friendship]: "monument",
};

const hit = (id: string, over: Partial<PlaceHit> = {}): PlaceHit => ({
  id,
  name: "Verified café",
  nameKa: null,
  category: "cafe",
  group: "food",
  tier: "verified",
  lonLat: places.get(id)?.lonLat ?? [44.644, 42.659],
  outdoor: false,
  distanceM: 300,
  ...over,
});

function deps(over: Partial<SuggestDeps> = {}) {
  const counts = new Map<string, number>();
  const calls = { forecast: 0, search: 0 };
  const base: SuggestDeps = {
    trip: async () => ({ doc: kazbegiDoc() }),
    cards: async (ids) =>
      new Map(
        ids.flatMap((id) => {
          const p = places.get(id);
          return p
            ? [
                [
                  id,
                  {
                    category: GEORGIAN_CATEGORY[id] ?? "hotel",
                    lonLat: p.lonLat,
                  },
                ],
              ]
            : [];
        }),
      ),
    facts: async (ids) =>
      new Map(
        ids.flatMap((id) =>
          places.has(id) ? [[id, places.get(id) as never]] : [],
        ),
      ),
    search: async () => {
      calls.search++;
      return [hit(P.verifiedCafe)];
    },
    forecast: async () => {
      calls.forecast++;
      return null;
    },
    count: async (key) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    suggester: undefined,
    now: () => new Date("2026-09-16T08:00:00Z"),
    limits: { userPerMinute: 6, userPerDay: 60 },
  };
  return { deps: { ...base, ...over }, calls, counts };
}

const ask = (
  d: ReturnType<typeof deps>,
  nodeId = N.lunch,
  wish: string | null = null,
) => suggestForStop("trip", "u1", nodeId, wish, d.deps);

describe("without a model", () => {
  test("the rules answer, in their own words, and say so", async () => {
    const out = await ask(deps());
    assert.ok(out.ok);
    assert.equal(out.source, "rules");
    assert.ok(out.suggestions.length > 0 && out.suggestions.length <= 3);
    for (const s of out.suggestions) {
      assert.ok(s.ops.length > 0);
      assert.ok(s.reason.length > 0);
    }
  });

  test("a wish puts what answers it first", async () => {
    const out = await ask(deps(), N.lunch, "somewhere indoors");
    assert.ok(out.ok);
    assert.equal(out.suggestions[0].kind, "swap");
  });
});

describe("with a model", () => {
  test("its choice and its reasons are what is shown, in its order", async () => {
    const d = deps();
    let seen: string[] = [];
    const suggester: Suggester = async ({ options }) => {
      seen = options.map((o) => o.id);
      return {
        picks: [
          { id: seen[seen.length - 1], reason: "The quiet one." },
          { id: seen[0], reason: "The easy one." },
        ],
      };
    };
    const out = await ask({ ...d, deps: { ...d.deps, suggester } });
    assert.ok(out.ok);
    assert.equal(out.source, "ai");
    assert.deepEqual(
      out.suggestions.map((s) => s.reason),
      ["The quiet one.", "The easy one."],
    );
    assert.equal(out.suggestions[0].id, seen[seen.length - 1]);
  });

  test("it is given only options the rules built, with their facts and the wish", async () => {
    const d = deps();
    let input: Parameters<Suggester>[0] | undefined;
    const suggester: Suggester = async (i) => {
      input = i;
      return { picks: [] };
    };
    await ask(
      { ...d, deps: { ...d.deps, suggester } },
      N.lunch,
      "something dry",
    );
    assert.equal(input?.wish, "something dry");
    assert.ok(input && input.options.length > 0);
    assert.ok(input?.options.every((o) => o.id && o.facts));
    assert.match(input?.context ?? "", /=> /);
  });

  test("an option it invents is never shown", async () => {
    const d = deps();
    const suggester: Suggester = async ({ options }) => ({
      picks: [
        { id: "swap:made-up", reason: "Invented." },
        { id: options[0].id, reason: "Real." },
      ],
    });
    const out = await ask({ ...d, deps: { ...d.deps, suggester } });
    assert.ok(out.ok);
    assert.deepEqual(
      out.suggestions.map((s) => s.reason),
      ["Real."],
    );
  });

  test("a model that throws costs nothing: the rules' own are shown", async () => {
    const d = deps();
    const suggester: Suggester = async () => {
      throw new Error("503");
    };
    const out = await ask({ ...d, deps: { ...d.deps, suggester } });
    assert.ok(out.ok);
    assert.equal(out.source, "rules");
    assert.ok(out.suggestions.length > 0);
  });

  test("a model that answers with nothing usable falls back too", async () => {
    const d = deps();
    for (const reply of [
      { nonsense: true },
      { picks: [] },
      { picks: [{ id: "zz", reason: "x" }] },
    ]) {
      const out = await ask({
        ...d,
        deps: { ...d.deps, suggester: async () => reply },
      });
      assert.ok(out.ok);
      assert.equal(out.source, "rules", JSON.stringify(reply));
    }
  });
});

describe("what it will and will not do", () => {
  test("a stop that is not there is not found, and a trip that is not there too", async () => {
    assert.deepEqual(await ask(deps(), "nope"), {
      ok: false,
      reason: "no-such-stop",
    });
    const d = deps({ trip: async () => null });
    assert.deepEqual(await ask(d), { ok: false, reason: "not-found" });
  });

  test("a drive has nothing to suggest, and costs no search", async () => {
    const d = deps();
    const out = await ask(d, N.drive);
    assert.ok(out.ok);
    assert.deepEqual(out.suggestions, []);
    assert.equal(d.calls.search, 0);
  });

  test("a traveller past their minute is refused before anything is read", async () => {
    const d = deps({ limits: { userPerMinute: 1, userPerDay: 60 } });
    assert.ok((await ask(d)).ok);
    assert.deepEqual(await ask(d), { ok: false, reason: "rate-limited" });
  });

  test("the weather failing is no failure: only the rain is not considered", async () => {
    const d = deps({
      forecast: async () => {
        throw new Error("open-meteo down");
      },
    });
    const out = await ask(d);
    assert.ok(out.ok);
    assert.ok(out.suggestions.length > 0);
  });

  test("rain in the forecast moves a dry start to the front for a stop in the open", async () => {
    const d = deps({
      forecast: async () => [
        {
          at: "2026-09-16T08:00:00Z",
          precipitation: 2,
          apparentTemperature: 12,
        },
      ],
    });
    const out = await ask(d, N.lunch);
    assert.ok(out.ok);
    assert.ok(out.suggestions.some((s) => /rain/i.test(s.reason)));
  });
});
