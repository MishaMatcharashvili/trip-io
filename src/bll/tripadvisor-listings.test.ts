import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  Listing,
  ListingCollect,
  ListingSource,
} from "../domain/catalogue/listings.ts";
import {
  LISTING_JOB,
  type ListingDeps,
  listingStep,
  readListing,
  requestListings,
  scheduleListingRefresh,
} from "./tripadvisor-listings.ts";

const NOW = new Date("2030-05-01T09:00:00Z");
const query = {
  destination: "tbilisi",
  name: "Tbilisi",
  kind: "restaurant" as const,
  max: 150,
};

const listing: Listing = {
  id: "2425451",
  kind: "restaurant",
  destination: "tbilisi",
  name: "Barbarestan",
  lonLat: [44.8031, 41.7105],
  rating: 4.5,
  count: 2873,
  ranking: { rank: 12, of: 3104 },
  url: null,
};

function world(answers: ListingCollect[] = []) {
  const queued: { kind: string; payload: unknown; runAfter?: Date }[] = [];
  const saved: { destination: string; kind: string; n: number }[] = [];
  const asked = { start: 0, collect: 0 };
  const source: ListingSource = {
    configured: true,
    async start() {
      asked.start++;
      return { ok: true, runId: "run1" };
    },
    async collect() {
      asked.collect++;
      return answers.shift() ?? { ok: true, state: "running" };
    },
  };
  const deps: ListingDeps & { sleep: (ms: number) => Promise<void> } = {
    source,
    save: async (destination, kind, listings) => {
      saved.push({ destination, kind, n: listings.length });
    },
    enqueue: async (kind, payload, runAfter) => {
      queued.push({ kind, payload, runAfter });
      return "job";
    },
    now: () => NOW,
    sleep: async () => {},
  };
  return { deps, queued, saved, asked };
}

describe("listingStep", () => {
  test("the first step starts the read and checks back in a few minutes", async () => {
    const { deps, queued } = world();
    assert.deepEqual(await listingStep(query, deps), {
      state: "started",
      runId: "run1",
    });
    assert.equal(queued[0].kind, LISTING_JOB);
    assert.deepEqual(queued[0].payload, { ...query, runId: "run1", checks: 0 });
    assert.ok((queued[0].runAfter?.getTime() ?? 0) > NOW.getTime());
  });

  test("a read still going is checked again later, counting the checks", async () => {
    const { deps, queued, saved } = world([{ ok: true, state: "running" }]);
    const step = await listingStep(
      { ...query, runId: "run1", checks: 3 },
      deps,
    );
    assert.equal(step.state, "running");
    assert.equal((queued[0].payload as { checks: number }).checks, 4);
    assert.equal(saved.length, 0);
  });

  test("a finished read keeps the town's list", async () => {
    const { deps, queued, saved } = world([
      { ok: true, state: "done", listings: [listing] },
    ]);
    assert.deepEqual(await listingStep({ ...query, runId: "run1" }, deps), {
      state: "saved",
      listings: 1,
    });
    assert.deepEqual(saved, [
      { destination: "tbilisi", kind: "restaurant", n: 1 },
    ]);
    assert.equal(queued.length, 0);
  });

  test("a read that never finishes is given up on, not checked for ever", async () => {
    const { deps, queued } = world([{ ok: true, state: "running" }]);
    const step = await listingStep(
      { ...query, runId: "run1", checks: 29 },
      deps,
    );
    assert.deepEqual(step, { state: "failed", reason: "gave-up" });
    assert.equal(queued.length, 0);
  });

  test("a refused token is a failure to report, not a job to retry", async () => {
    const { deps, queued } = world();
    deps.source.start = async () => ({ ok: false, reason: "auth" });
    assert.deepEqual(await listingStep(query, deps), {
      state: "failed",
      reason: "auth",
    });
    assert.equal(queued.length, 0);
  });

  test("a job without a town is a bug", async () => {
    const { deps } = world();
    await assert.rejects(() => listingStep({ kind: "restaurant" }, deps));
  });
});

describe("requestListings", () => {
  const tbilisi = { slug: "tbilisi", name: "Tbilisi" };

  test("a destination without lists has its restaurants and sights queued", async () => {
    const { deps, queued } = world();
    const { queued: n } = await requestListings(tbilisi, {
      configured: true,
      enqueue: deps.enqueue,
      count: async () => 1,
      now: () => NOW,
    });
    assert.equal(n, 2);
    assert.deepEqual(
      queued.map((q) => (q.payload as { kind: string }).kind).sort(),
      ["attraction", "restaurant"],
    );
  });

  test("asked again within the week, nothing more is queued", async () => {
    const { deps, queued } = world();
    await requestListings(tbilisi, {
      configured: true,
      enqueue: deps.enqueue,
      count: async () => 2,
      now: () => NOW,
    });
    assert.equal(queued.length, 0);
  });

  test("with nothing to read them with, nothing is queued", async () => {
    const { deps, queued } = world();
    await requestListings(tbilisi, {
      configured: false,
      enqueue: deps.enqueue,
      count: async () => 1,
      now: () => NOW,
    });
    assert.equal(queued.length, 0);
  });
});

describe("scheduleListingRefresh", () => {
  test("reads again every destination that has lists, and skips unknown ones", async () => {
    const { deps, queued } = world();
    const { queued: n } = await scheduleListingRefresh({
      enqueue: deps.enqueue,
      listed: async () => ["tbilisi", "kutaisi", "atlantis"],
    });
    assert.equal(n, 4);
    assert.deepEqual(
      [
        ...new Set(
          queued.map((q) => (q.payload as { destination: string }).destination),
        ),
      ].sort(),
      ["kutaisi", "tbilisi"],
    );
  });
});

describe("readListing", () => {
  test("waits for the read and keeps it", async () => {
    const { deps, saved, asked } = world([
      { ok: true, state: "running" },
      { ok: true, state: "done", listings: [listing, listing] },
    ]);
    assert.deepEqual(await readListing(query, deps), {
      state: "saved",
      listings: 2,
    });
    assert.equal(asked.collect, 2);
    assert.equal(saved[0].n, 2);
  });
});
