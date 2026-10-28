import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { destination } from "../domain/catalogue/destinations.ts";
import type {
  RatedOutcome,
  RatingSource,
} from "../domain/catalogue/ratings.ts";
import { type RatingDeps, ratedInArea } from "./ratings.ts";

const kutaisi = destination("kutaisi");
if (!kutaisi) throw new Error("Kutaisi is a destination");

const palaty: RatedOutcome = {
  ok: true,
  places: [
    {
      id: "ChIJpalaty",
      names: ["Palaty"],
      lonLat: [42.7004, 42.2716],
      rating: { value: 4.6, count: 2_400 },
    },
  ],
};

/** A source that answers restaurants with Palaty, and counts what it is asked. */
function world(overrides: Partial<RatingDeps> = {}) {
  const searched: string[] = [];
  const kept = new Map<string, RatedOutcome>();
  let today = 0;
  const source: RatingSource = {
    provider: "google",
    configured: true,
    async popular({ kind }) {
      searched.push(kind);
      return kind === "restaurant" ? palaty : { ok: true, places: [] };
    },
  };
  const deps: RatingDeps = {
    source,
    kept: {
      get: async (key) => kept.get(key) ?? null,
      set: async (key, outcome) => {
        kept.set(key, outcome);
      },
    },
    ttlSeconds: 60,
    perDay: 100,
    count: async () => ++today,
    now: () => new Date("2026-10-28T10:00:00Z"),
    near: async ({ categories }) =>
      categories.includes("restaurant")
        ? [
            {
              id: "palaty",
              name: "Palaty",
              nameKa: null,
              category: "restaurant",
              group: "food",
              tier: "verified",
              lonLat: [42.7004, 42.2716],
              openingHours: null,
              outdoor: false,
            },
          ]
        : [],
    ...overrides,
  };
  return { deps, searched, kept };
}

describe("rated places in a destination", () => {
  test("a listing that is a catalogue place comes back as a candidate there, with its rating", async () => {
    const { deps, searched } = world();
    const rated = await ratedInArea(kutaisi, deps);
    assert.deepEqual(
      rated.map((c) => [c.id, c.area, c.rating]),
      [["palaty", "kutaisi", { value: 4.6, count: 2_400 }]],
    );
    assert.deepEqual(searched.sort(), ["attraction", "hotel", "restaurant"]);
  });

  test("a town searched once is kept, and the next trip searches nothing", async () => {
    const { deps, searched } = world();
    await ratedInArea(kutaisi, deps);
    searched.length = 0;
    const again = await ratedInArea(kutaisi, deps);
    assert.equal(again.length, 1);
    assert.deepEqual(searched, []);
  });

  test("past the day's searches, or unconfigured, the trip is planned without ratings", async () => {
    const over = world({ perDay: 0 });
    assert.deepEqual(await ratedInArea(kutaisi, over.deps), []);
    assert.deepEqual(over.searched, []);

    const off = world();
    const none = await ratedInArea(kutaisi, {
      ...off.deps,
      source: { ...off.deps.source, configured: false },
    });
    assert.deepEqual(none, []);
    assert.deepEqual(off.searched, []);
  });

  test("a source, a store or a database that fails costs the ratings, not the trip", async () => {
    const { deps } = world({
      kept: {
        get: async () => {
          throw new Error("redis down");
        },
        set: async () => {
          throw new Error("redis down");
        },
      },
    });
    assert.equal((await ratedInArea(kutaisi, deps)).length, 1);

    const broken = world({
      near: async () => {
        throw new Error("database");
      },
    });
    assert.deepEqual(await ratedInArea(kutaisi, broken.deps), []);

    const down = world();
    const failing = await ratedInArea(kutaisi, {
      ...down.deps,
      source: {
        ...down.deps.source,
        popular: async () => {
          throw new Error("network");
        },
      },
    });
    assert.deepEqual(failing, []);
  });

  test("a failed search is not kept", async () => {
    const { deps, kept } = world();
    await ratedInArea(kutaisi, {
      ...deps,
      source: {
        ...deps.source,
        popular: async () => ({ ok: false, reason: "auth" }),
      },
    });
    assert.equal(kept.size, 0);
  });
});
