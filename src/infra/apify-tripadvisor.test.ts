import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ListingQuery } from "../domain/catalogue/listings.ts";
import {
  actorInput,
  apifyTripadvisor,
  classify,
  toListings,
} from "./apify-tripadvisor.ts";

// MOCKED. Nothing here calls Apify: the items below have the shape the actor's
// README documents, around Tbilisi values. Whether a live run answers in that
// shape is what `pnpm catalogue:tripadvisor -- --destination tbilisi` is for.

const restaurants: ListingQuery = {
  destination: "tbilisi",
  name: "Tbilisi",
  kind: "restaurant",
  max: 150,
};

const barbarestan = {
  id: 2425451,
  type: "RESTAURANT",
  category: "restaurant",
  name: "Barbarestan",
  latitude: 41.7105,
  longitude: 44.8031,
  rating: 4.5,
  numberOfReviews: 2873,
  rankingPosition: 12,
  rankingDenominator: "2950",
  rankingString: "#12 of 3,104 Restaurants in Tbilisi",
  webUrl:
    "https://www.tripadvisor.com/Restaurant_Review-g294195-d2425451-Reviews-Barbarestan-Tbilisi.html",
  cuisines: ["Georgian", "European"],
};

describe("toListings", () => {
  test("a restaurant keeps its rating, its reviews and where it stands", () => {
    assert.deepEqual(toListings([barbarestan], restaurants), [
      {
        id: "2425451",
        kind: "restaurant",
        destination: "tbilisi",
        name: "Barbarestan",
        lonLat: [44.8031, 41.7105],
        rating: 4.5,
        count: 2873,
        // The sentence the site shows wins over the actor's own denominator.
        ranking: { rank: 12, of: 3104 },
        url: barbarestan.webUrl,
      },
    ]);
  });

  test("without a sentence, the position and denominator are used", () => {
    const [l] = toListings(
      [{ ...barbarestan, rankingString: undefined }],
      restaurants,
    );
    assert.deepEqual(l.ranking, { rank: 12, of: 2950 });
  });

  test("drops what cannot be placed, what is not in Georgia, and the wrong kind", () => {
    const listings = toListings(
      [
        { ...barbarestan, id: 1, latitude: null },
        { ...barbarestan, id: 2, latitude: 41.9, longitude: -87.6 },
        { ...barbarestan, id: 3, type: "ATTRACTION" },
        { id: 4 },
        barbarestan,
      ],
      restaurants,
    );
    assert.deepEqual(
      listings.map((l) => l.id),
      ["2425451"],
    );
  });

  test("a place with no reviews yet has a count of none, not a missing one", () => {
    const [l] = toListings(
      [{ ...barbarestan, numberOfReviews: undefined, rating: undefined }],
      restaurants,
    );
    assert.equal(l.count, 0);
    assert.equal(l.rating, null);
  });
});

const queryOf = (input: ReturnType<typeof actorInput>) =>
  "query" in input ? input.query : undefined;

describe("actorInput", () => {
  test("a town whose geo is known is paged through, not searched for", () => {
    const input = actorInput({
      ...restaurants,
      max: 150,
      geo: { id: "294195", slug: "Tbilisi" },
    });
    assert.equal("query" in input, false);
    assert.deepEqual(
      "startUrls" in input ? input.startUrls.map((u) => u.url) : [],
      [
        "https://www.tripadvisor.com/Restaurants-g294195-Tbilisi.html",
        "https://www.tripadvisor.com/Restaurants-g294195-oa30-Tbilisi.html",
        "https://www.tripadvisor.com/Restaurants-g294195-oa60-Tbilisi.html",
        "https://www.tripadvisor.com/Restaurants-g294195-oa90-Tbilisi.html",
        "https://www.tripadvisor.com/Restaurants-g294195-oa120-Tbilisi.html",
      ],
    );
  });

  test("without a geo, or for sights, the destination is searched for by name", () => {
    assert.equal(queryOf(actorInput(restaurants)), "Tbilisi, Georgia");
    const sights = actorInput({
      ...restaurants,
      kind: "attraction",
      geo: { id: "294195", slug: "Tbilisi" },
    });
    assert.equal(queryOf(sights), "Tbilisi, Georgia");
  });

  test("asks for one kind of place in one Georgian town, without the extras that cost time", () => {
    const input = actorInput({
      destination: "mestia",
      name: "Mestia",
      kind: "attraction",
      max: 80,
    });
    assert.equal(queryOf(input), "Mestia, Georgia");
    assert.equal(input.maxItemsPerQuery, 80);
    assert.equal(input.includeAttractions, true);
    assert.equal(input.includeRestaurants, false);
    assert.equal(input.includeHotels, false);
    assert.equal(input.maxPhotosPerPlace, 0);
    assert.equal(input.maximumLeadsEnrichmentRecords, 0);
  });
});

type Call = { url: URL; init: RequestInit };

function fake(answers: Record<string, unknown | number>) {
  const calls: Call[] = [];
  const fetcher = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const answer = answers[url.pathname.replace("/v2", "")];
    if (typeof answer === "number")
      return new Response("{}", { status: answer });
    return Response.json(answer ?? {}, {
      status: answer === undefined ? 404 : 200,
    });
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

const run = (status: string) => ({
  data: { id: "run1", status, defaultDatasetId: "ds1" },
});

describe("the calls", () => {
  test("without a token nothing is sent", async () => {
    const { fetch, calls } = fake({});
    const source = apifyTripadvisor({ token: undefined, fetch });
    assert.equal(source.configured, false);
    assert.deepEqual(await source.start(restaurants), {
      ok: false,
      reason: "not-configured",
    });
    assert.equal(calls.length, 0);
  });

  test("starting a run posts the actor's input, with the token in a header", async () => {
    const { fetch, calls } = fake({
      "/acts/maxcopell~tripadvisor/runs": run("READY"),
    });
    const started = await apifyTripadvisor({ token: "secret", fetch }).start(
      restaurants,
    );
    assert.deepEqual(started, { ok: true, runId: "run1" });
    const { url, init } = calls[0];
    assert.equal(init.method, "POST");
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer secret",
    );
    assert.ok(!url.href.includes("secret"));
    assert.equal(JSON.parse(String(init.body)).query, "Tbilisi, Georgia");
  });

  test("a run still going is still going", async () => {
    const { fetch, calls } = fake({ "/actor-runs/run1": run("RUNNING") });
    assert.deepEqual(
      await apifyTripadvisor({ token: "t", fetch }).collect(
        "run1",
        restaurants,
      ),
      { ok: true, state: "running" },
    );
    assert.equal(calls.length, 1);
  });

  test("a finished run's list is read from its dataset", async () => {
    const { fetch, calls } = fake({
      "/actor-runs/run1": run("SUCCEEDED"),
      "/datasets/ds1/items": [barbarestan],
    });
    const done = await apifyTripadvisor({ token: "t", fetch }).collect(
      "run1",
      restaurants,
    );
    assert.ok(done.ok && done.state === "done");
    assert.equal(done.listings[0].name, "Barbarestan");
    assert.equal(calls[1].url.searchParams.get("clean"), "true");
  });

  test("a run that failed has nothing to read", async () => {
    const { fetch } = fake({ "/actor-runs/run1": run("FAILED") });
    assert.deepEqual(
      await apifyTripadvisor({ token: "t", fetch }).collect(
        "run1",
        restaurants,
      ),
      { ok: false, reason: "upstream" },
    );
  });

  test("statuses are reasons: a spent account is a quota", () => {
    assert.equal(classify(401), "auth");
    assert.equal(classify(402), "quota");
    assert.equal(classify(429), "rate-limited");
    assert.equal(classify(500), "upstream");
  });
});
