import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SightHit } from "../dal/places.ts";
import type { SightFinder } from "../domain/catalogue/sight-search.ts";
import {
  type SightSearchDeps,
  searchSights,
  takeSight,
} from "./sight-search.ts";

const bodbe = {
  externalId: "ChIJbodbe",
  name: "Bodbe Monastery",
  where: "Sighnaghi, Georgia",
};

function finder(over: Partial<SightFinder> = {}) {
  const calls: string[] = [];
  const f: SightFinder = {
    provider: "google",
    configured: true,
    async suggest(q) {
      calls.push(`suggest:${q}`);
      return { ok: true, value: [bodbe] };
    },
    async details(id) {
      calls.push(`details:${id}`);
      return {
        ok: true,
        value: {
          externalId: id,
          name: "Bodbe Monastery",
          lonLat: [45.9331, 41.6064],
          types: ["church", "tourist_attraction"],
        },
      };
    },
    ...over,
  };
  return { finder: f, calls };
}

const hit = (name: string, region: string | null = "signagi"): SightHit => ({
  id: crypto.randomUUID(),
  name,
  category: "historic_site",
  lonLat: [45.9, 41.6],
  region,
});

function deps(over: Partial<SightSearchDeps> = {}) {
  const taken: unknown[] = [];
  const remembered: unknown[] = [];
  const d: Partial<SightSearchDeps> = {
    count: async () => 1,
    now: () => new Date("2026-10-30T10:00:00Z"),
    find: async () => [],
    sourced: async () => new Set(),
    regionAt: async () => "signagi",
    take: async (input) => {
      taken.push(input);
      return "11111111-1111-4111-8111-111111111111";
    },
    remember: async (...args) => {
      remembered.push(args);
    },
    ...over,
  };
  return { deps: d, taken, remembered };
}

describe("searchSights", () => {
  test("what the catalogue lacks is asked of Google", async () => {
    const { finder: f, calls } = finder();
    const result = await searchSights(f, "u1", "Bodbe", "s", deps().deps);
    assert.deepEqual(result, { ok: true, sights: [], more: [bodbe] });
    assert.deepEqual(calls, ["suggest:Bodbe"]);
  });

  test("with enough of its own, the catalogue answers alone", async () => {
    const { finder: f, calls } = finder();
    const five = ["a", "b", "c", "d", "e"].map((n) => hit(`Church ${n}`));
    const result = await searchSights(
      f,
      "u1",
      "Church",
      "s",
      deps({ find: async () => five }).deps,
    );
    assert.ok(result.ok);
    assert.equal(result.sights.length, 5);
    assert.equal(result.sights[0].place, "signagi");
    assert.deepEqual(calls, []);
  });

  test("a sight outside every destination is not offered", async () => {
    const { finder: f } = finder();
    const result = await searchSights(
      f,
      "u1",
      "Somewhere",
      "s",
      deps({ find: async () => [hit("Nowhere", null)] }).deps,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.sights, []);
  });

  test("a suggestion already taken in is not offered to take in again", async () => {
    const { finder: f } = finder();
    const result = await searchSights(
      f,
      "u1",
      "Bodbe",
      "s",
      deps({ sourced: async () => new Set(["ChIJbodbe"]) }).deps,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.more, []);
  });

  test("Google down is the catalogue alone; one letter is nothing", async () => {
    const { finder: f } = finder({
      suggest: async () => ({ ok: false, reason: "unavailable" }),
    });
    assert.deepEqual(await searchSights(f, "u1", "Bodbe", "s", deps().deps), {
      ok: true,
      sights: [],
      more: [],
    });
    const { finder: g, calls } = finder();
    await searchSights(g, "u1", "B", "s", deps().deps);
    assert.deepEqual(calls, []);
  });

  test("too many searches is a rate limit", async () => {
    const { finder: f } = finder();
    const result = await searchSights(
      f,
      "u1",
      "Bodbe",
      "s",
      deps({ count: async () => 1_000 }).deps,
    );
    assert.deepEqual(result, { ok: false, reason: "rate-limited" });
  });
});

describe("takeSight", () => {
  test("a pick is taken in, remembered by its Google id, and pinned in its destination", async () => {
    const { finder: f } = finder();
    const { deps: d, taken, remembered } = deps();
    const result = await takeSight(f, "u1", "ChIJbodbe", "s", d);
    assert.deepEqual(result, {
      ok: true,
      sight: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Bodbe Monastery",
        place: "signagi",
      },
    });
    assert.deepEqual(taken, [
      {
        source: "google",
        sourceId: "ChIJbodbe",
        name: "Bodbe Monastery",
        category: "christian_place_of_worship",
        lonLat: [45.9331, 41.6064],
      },
    ]);
    assert.equal(remembered.length, 1);
  });

  test("a hotel is not a sight, and nothing is taken in", async () => {
    const { finder: f } = finder({
      details: async (id) => ({
        ok: true,
        value: {
          externalId: id,
          name: "Bodbe Hotel",
          lonLat: [45.92, 41.6],
          types: ["lodging", "hotel"],
        },
      }),
    });
    const { deps: d, taken } = deps();
    assert.deepEqual(await takeSight(f, "u1", "ChIJhotel", "s", d), {
      ok: false,
      reason: "not-a-sight",
    });
    assert.deepEqual(taken, []);
  });

  test("somewhere no destination covers is refused", async () => {
    const { finder: f } = finder();
    const { deps: d, taken } = deps({ regionAt: async () => null });
    assert.deepEqual(await takeSight(f, "u1", "ChIJbodbe", "s", d), {
      ok: false,
      reason: "outside",
    });
    assert.deepEqual(taken, []);
  });
});
