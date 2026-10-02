import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { ExternalRow } from "../dal/place-external.ts";
import type {
  Enrichment,
  EnrichOutcome,
  PlaceEnricher,
  PlaceIdentity,
  SearchOutcome,
} from "../domain/catalogue/enrichment.ts";
import {
  type EnrichDeps,
  type EnrichLimits,
  enrichPlace,
} from "./place-enrichment.ts";

const NOW = new Date("2030-05-01T09:00:00Z");
const PLACE = "11111111-1111-4111-8111-111111111111";

const identity: PlaceIdentity = {
  name: "Fabrika",
  nameKa: null,
  lonLat: [44.8076, 41.7167],
  category: "hotel",
};

const enrichment: Enrichment = {
  source: { name: "Tripadvisor", url: "https://www.tripadvisor.com/x" },
  rating: { value: 4.5, count: 10, icon: null },
  ranking: null,
  url: "https://www.tripadvisor.com/x",
  reviews: [],
  photos: [],
};

const hit: SearchOutcome = {
  ok: true,
  candidates: [
    { id: "777", names: ["Fabrika Hostel"], lonLat: [44.8078, 41.7168] },
  ],
};

type World = ReturnType<typeof world>;

/** Every dependency faked, and a record of what the provider was asked. */
function world(over: { limits?: Partial<EnrichLimits> } = {}) {
  const stored = new Map<string, ExternalRow>();
  const counts = new Map<string, number>();
  const asked = { search: 0, allow: 0, read: 0 };
  const provider: PlaceEnricher & {
    answers: {
      search: SearchOutcome;
      allow: { ok: true } | { ok: false; reason: "upstream" };
      read: () => Promise<EnrichOutcome>;
    };
  } = {
    provider: "fake",
    configured: true,
    answers: {
      search: hit,
      allow: { ok: true },
      read: async () => ({ ok: true, enrichment }),
    },
    async search() {
      asked.search++;
      return provider.answers.search;
    },
    async allow() {
      asked.allow++;
      return provider.answers.allow;
    },
    async read() {
      asked.read++;
      return provider.answers.read();
    },
  };
  const deps: Pick<EnrichDeps, "provider"> & Partial<EnrichDeps> = {
    provider,
    identity: async () => identity,
    find: async (id) => stored.get(id) ?? null,
    save: async (id, _provider, answer) => {
      stored.set(
        id,
        answer.status === "matched"
          ? { status: "matched", externalId: answer.externalId, checkedAt: NOW }
          : { status: "none", externalId: null, checkedAt: NOW },
      );
    },
    count: async (key) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    now: () => NOW,
    log: () => {},
    limits: {
      userPerMinute: 10,
      userPerDay: 60,
      searchPerMinute: 40,
      globalPerDay: 500,
      ...over.limits,
    },
  };
  return { deps, provider, stored, counts, asked };
}

const run = (w: World, user = "u1") => enrichPlace(PLACE, user, w.deps);

describe("finding a place", () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  test("the first visit finds it, allows it, remembers the id, and reads it", async () => {
    const outcome = await run(w);
    assert.ok(outcome.ok);
    assert.deepEqual(w.asked, { search: 1, allow: 1, read: 1 });
    assert.deepEqual(w.stored.get(PLACE)?.externalId, "777");
  });

  test("the second visit goes straight to the read: no search, no allow", async () => {
    await run(w);
    await run(w);
    assert.deepEqual(w.asked, { search: 1, allow: 1, read: 2 });
  });

  test("what is shown is read again each time, never kept", async () => {
    let n = 0;
    w.provider.answers.read = async () => ({
      ok: true,
      enrichment: {
        ...enrichment,
        rating: { value: 4 + n++ / 10, count: 1, icon: null },
      },
    });
    const first = await run(w);
    const second = await run(w);
    assert.ok(first.ok && second.ok);
    assert.notEqual(
      first.enrichment.rating?.value,
      second.enrichment.rating?.value,
    );
  });

  test("nothing matched is remembered, and not asked again for a month", async () => {
    w.provider.answers.search = { ok: true, candidates: [] };
    assert.deepEqual(await run(w), { ok: false, reason: "no-match" });
    assert.deepEqual(await run(w), { ok: false, reason: "no-match" });
    assert.equal(w.asked.search, 1);
    assert.equal(w.asked.read, 0);
  });

  test("a month later it is looked for again", async () => {
    w.stored.set(PLACE, {
      status: "none",
      externalId: null,
      checkedAt: new Date(NOW.getTime() - 31 * 86_400_000),
    });
    await run(w);
    assert.equal(w.asked.search, 1);
    assert.equal(w.stored.get(PLACE)?.status, "matched");
  });

  test("an id that could not be allowed is not remembered", async () => {
    w.provider.answers.allow = { ok: false, reason: "upstream" };
    assert.deepEqual(await run(w), { ok: false, reason: "upstream" });
    assert.equal(w.stored.has(PLACE), false);
    assert.equal(w.asked.read, 0);
  });

  test("a failed search is not remembered as an absence", async () => {
    w.provider.answers.search = { ok: false, reason: "timeout" };
    assert.deepEqual(await run(w), { ok: false, reason: "timeout" });
    assert.equal(w.stored.has(PLACE), false);
  });

  test("a place the catalogue does not hold is nothing to look for", async () => {
    w.deps.identity = async () => null;
    assert.deepEqual(await run(w), { ok: false, reason: "no-match" });
    assert.equal(w.asked.search, 0);
  });
});

describe("spending", () => {
  test("without a key nothing is counted or asked", async () => {
    const w = world();
    w.provider.configured = false;
    assert.deepEqual(await run(w), { ok: false, reason: "not-configured" });
    assert.equal(w.counts.size, 0);
  });

  test("a traveller past their day is refused before the provider is asked", async () => {
    const w = world({ limits: { userPerDay: 2 } });
    await run(w);
    await run(w);
    assert.deepEqual(await run(w), { ok: false, reason: "rate-limited" });
    assert.equal(w.asked.read, 2);
  });

  test("the day's total stops everyone", async () => {
    const w = world({ limits: { globalPerDay: 1 } });
    await run(w, "a");
    assert.deepEqual(await run(w, "b"), { ok: false, reason: "quota" });
  });

  test("looking places up has its own, tighter limit", async () => {
    const w = world({ limits: { searchPerMinute: 0 } });
    assert.deepEqual(await run(w), { ok: false, reason: "rate-limited" });
    assert.equal(w.asked.search, 0);
  });

  test("a remembered absence costs nothing against the day", async () => {
    const w = world();
    w.provider.answers.search = { ok: true, candidates: [] };
    await run(w);
    await run(w);
    assert.equal(w.counts.get("enrich:all:d") ?? 0, 0);
  });

  test("two travellers opening one place at once share one read", async () => {
    const w = world();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    w.provider.answers.read = async () => {
      await gate;
      return { ok: true, enrichment };
    };
    const a = run(w, "a");
    const b = run(w, "b");
    // Let both reach the shared call before it answers.
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [x, y] = await Promise.all([a, b]);
    assert.ok(x.ok && y.ok);
    assert.equal(w.asked.read, 1);
    // Gone once answered: the next visit asks again.
    await run(w, "c");
    assert.equal(w.asked.read, 2);
  });
});
