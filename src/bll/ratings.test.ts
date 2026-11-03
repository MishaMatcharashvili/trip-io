import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { destination } from "../domain/catalogue/destinations.ts";
import type { Listing } from "../domain/catalogue/listings.ts";
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

describe("Tripadvisor's lists", () => {
  const listing = (over: Partial<Listing> = {}): Listing => ({
    id: "t-palaty",
    kind: "restaurant",
    destination: "kutaisi",
    name: "Palaty",
    lonLat: [42.7005, 42.2716],
    rating: 4.5,
    count: 1_900,
    ranking: { rank: 2, of: 410 },
    url: null,
    ...over,
  });

  const withLists = (
    lists: Partial<Record<Listing["kind"], Listing[]>>,
    requested: string[] = [],
  ) => ({
    lists: async (_d: string, kind: Listing["kind"]) => lists[kind] ?? [],
    request: async (d: { slug: string }) => {
      requested.push(d.slug);
    },
  });

  test("a place both rate takes Tripadvisor's rating, with its rank in the town", async () => {
    const { deps } = world();
    const rated = await ratedInArea(kutaisi, {
      ...deps,
      tripadvisor: withLists({
        restaurant: [listing()],
        attraction: [
          listing({
            id: "t-x",
            kind: "attraction",
            name: "Elsewhere",
            lonLat: [42.5, 42.1],
          }),
        ],
      }),
    });
    assert.deepEqual(rated[0].rating, {
      value: 4.5,
      count: 1_900,
      rank: { rank: 2, of: 410 },
    });
  });

  test("a place Google alone found is still rated, by Google", async () => {
    const { deps } = world();
    const rated = await ratedInArea(kutaisi, {
      ...deps,
      tripadvisor: withLists({
        restaurant: [
          listing({
            id: "t-other",
            name: "Somewhere Else",
            lonLat: [42.5, 42.1],
          }),
        ],
        attraction: [
          listing({
            id: "t-x",
            kind: "attraction",
            name: "Elsewhere",
            lonLat: [42.5, 42.1],
          }),
        ],
      }),
    });
    assert.deepEqual(rated[0].rating, { value: 4.6, count: 2_400 });
  });

  test("a place only Tripadvisor lists is rated even when Google is off", async () => {
    const { deps, searched } = world();
    const rated = await ratedInArea(kutaisi, {
      ...deps,
      source: { ...deps.source, configured: false },
      tripadvisor: withLists({ restaurant: [listing()] }),
    });
    assert.equal(rated.length, 1);
    assert.equal(rated[0].rating?.rank?.rank, 2);
    assert.deepEqual(searched, []);
  });

  test("a destination without lists has them asked for; one with them does not", async () => {
    const asked: string[] = [];
    const { deps } = world();
    await ratedInArea(kutaisi, { ...deps, tripadvisor: withLists({}, asked) });
    assert.deepEqual(asked, ["kutaisi"]);

    const none: string[] = [];
    await ratedInArea(kutaisi, {
      ...deps,
      tripadvisor: withLists(
        {
          restaurant: [listing()],
          attraction: [listing({ id: "t-x", kind: "attraction" })],
        },
        none,
      ),
    });
    // Hotels are never read, so their missing list asks for nothing.
    assert.deepEqual(none, []);
  });

  test("lists that cannot be read cost Tripadvisor's ratings, not the trip", async () => {
    const { deps } = world();
    const rated = await ratedInArea(kutaisi, {
      ...deps,
      tripadvisor: {
        lists: async () => {
          throw new Error("database");
        },
        request: async () => {
          throw new Error("queue");
        },
      },
    });
    assert.deepEqual(rated[0].rating, { value: 4.6, count: 2_400 });
  });
});
