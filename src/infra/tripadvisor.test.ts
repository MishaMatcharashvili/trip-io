import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classify,
  toCandidates,
  toEnrichment,
  toPhotos,
  toReviews,
  tripadvisor,
} from "./tripadvisor.ts";

// MOCKED. Nothing here calls Tripadvisor: the bodies below have the shape the
// Terra reference documents, around real-looking values. They check that the
// adapter asks the right questions and refuses what does not fit. Whether
// Terra answers as its reference says is what `pnpm smoke:tripadvisor` is for.

const FABRIKA = { latitude: 41.7167, longitude: 44.8076 };

const search = {
  data: [
    {
      location: {
        id: 12345,
        names: [{ language: "en", value: "Fabrika Hostel", primary: true }],
        coordinates: FABRIKA,
      },
      matched_value: { language: "en", value: "Fabrika" },
    },
    { location: { id: 999, names: [{ value: "Nowhere" }] } },
  ],
  pagination: { page: 1, size: 5, total_elements: 2, total_pages: 1 },
};

const details = {
  data: [
    {
      id: 12345,
      names: [{ language: "en", value: "Fabrika Hostel", primary: true }],
      traveler_ratings: {
        overall: {
          rating: 4.5,
          count: 1204,
          icon_url: "https://static.example/bubbles/45.svg",
        },
      },
      rankings: [{ display_text: "#4 of 120 Hostels in Tbilisi" }],
      urls: {
        tripadvisor: { main: "https://www.tripadvisor.com/Hotel_Review-x" },
      },
    },
  ],
};

const reviews = {
  data: [
    {
      id: 1,
      rating: 5,
      title: [{ language: "en", value: "Lovely", primary: true }],
      text: [
        { language: "de", value: "Schön", primary: true },
        { language: "en", value: "Great courtyard", primary: false },
      ],
      publish_ts: "2030-04-02T10:00:00Z",
      trip_type: "SOLO",
      user: { username: "mari" },
      url: "https://www.tripadvisor.com/ShowUserReviews-1",
      rating_icon_url: { key: "k", url: "https://static.example/r/50.svg" },
    },
    {
      id: 2,
      rating: 4,
      text: [],
      publish_ts: "2030-04-01T10:00:00Z",
    },
  ],
};

const photos = {
  data: [
    {
      id: 77,
      photo: {
        original_size_url: "https://media.example/p/77.jpg",
        original_width: 4000,
        original_height: 3000,
      },
      caption: " The yard ",
      source: { name: "Traveler" },
    },
    {
      id: 78,
      photo: { original_size_url: "https://media.example/p/78.jpg" },
      source: { name: "Management" },
    },
  ],
};

type Call = { url: URL; init: RequestInit };

/** A fetch that answers by path and records what it was asked. */
function fake(answers: Record<string, unknown | number>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetcher = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const answer = answers[url.pathname.replace("/api", "")];
    if (typeof answer === "number")
      return new Response("{}", { status: answer });
    return Response.json(answer ?? {}, {
      status: answer === undefined ? 404 : 200,
    });
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

describe("parsing", () => {
  test("candidates carry every name and the coordinates, longitude first", () => {
    const [first, second] = toCandidates(search);
    assert.deepEqual(first, {
      id: "12345",
      names: ["Fabrika Hostel"],
      lonLat: [44.8076, 41.7167],
    });
    assert.equal(second.lonLat, null);
  });

  test("a review in English is shown in English, and one with no text is not shown", () => {
    const parsed = toReviews(reviews);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].text, "Great courtyard");
    assert.equal(parsed[0].title, "Lovely");
    assert.equal(parsed[0].tripType, "solo");
    assert.equal(parsed[0].ratingIcon, "https://static.example/r/50.svg");
  });

  test("a photo says whose it is, and a missing size is not a crash", () => {
    const [a, b] = toPhotos(photos);
    assert.equal(a.by, "traveller");
    assert.equal(a.caption, "The yard");
    assert.equal(b.by, "venue");
    assert.equal(b.width, 4);
  });

  test("an address that is not https is a malformed reply", () => {
    assert.throws(() =>
      toPhotos({
        data: [
          { id: 1, photo: { original_size_url: "http://media.example/x.jpg" } },
        ],
      }),
    );
  });

  test("a place with no page to link to has nothing to show", () => {
    const noUrl = { data: [{ id: 1, urls: {} }] };
    assert.equal(toEnrichment(noUrl, [], []), null);
  });

  test("the rating and ranking come with the page they are from", () => {
    const e = toEnrichment(details, [], []);
    assert.equal(e?.rating?.value, 4.5);
    assert.equal(e?.rating?.count, 1204);
    assert.equal(e?.ranking, "#4 of 120 Hostels in Tbilisi");
    assert.equal(e?.source.name, "Tripadvisor");
  });
});

describe("failures", () => {
  test("statuses are reasons", () => {
    assert.equal(classify(401), "auth");
    assert.equal(classify(403), "auth");
    assert.equal(classify(404), "no-match");
    assert.equal(classify(429), "rate-limited");
    assert.equal(classify(500), "upstream");
  });
});

const place = {
  name: "Fabrika",
  nameKa: null,
  lonLat: [44.8076, 41.7167] as [number, number],
  category: "hotel",
};

describe("the calls", () => {
  test("without a key nothing is sent", async () => {
    const { fetch, calls } = fake({});
    const provider = tripadvisor({ key: undefined, fetch });
    assert.equal(provider.configured, false);
    assert.deepEqual(await provider.search(place), {
      ok: false,
      reason: "not-configured",
    });
    assert.equal(calls.length, 0);
  });

  test("a search asks for few results, in the right category, and sends the key in a header", async () => {
    const { fetch, calls } = fake({ "/catalog/locations/search": search });
    const result = await tripadvisor({ key: "secret", fetch }).search(place);
    assert.equal(result.ok, true);
    const { url, init } = calls[0];
    assert.equal(url.searchParams.get("size"), "5");
    assert.equal(url.searchParams.get("category"), "HOTEL");
    assert.equal(url.searchParams.get("country_code"), "GE");
    assert.equal(url.searchParams.get("query"), "Fabrika");
    assert.equal(
      (init.headers as Record<string, string>)["X-API-Key"],
      "secret",
    );
    // Never in the address, where a log would keep it.
    assert.ok(!url.href.includes("secret"));
    assert.equal(init.cache, "no-store");
  });

  test("allowing a place appends it as a number", async () => {
    const { fetch, calls } = fake({ "/allowlist": { added: 1 } });
    const result = await tripadvisor({ key: "k", fetch }).allow("12345");
    assert.equal(result.ok, true);
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      operation_type: "APPEND",
      allowlist: [12345],
    });
  });

  test("reading a place gathers the rating, reviews and photos", async () => {
    const { fetch } = fake({
      "/locations": details,
      "/locations/12345/reviews": reviews,
      "/locations/12345/photos": photos,
    });
    const result = await tripadvisor({ key: "k", fetch }).read("12345");
    assert.ok(result.ok);
    assert.equal(result.enrichment.reviews.length, 1);
    assert.equal(result.enrichment.photos.length, 2);
  });

  test("a failed review call does not take the rating with it", async () => {
    const { fetch } = fake({
      "/locations": details,
      "/locations/12345/reviews": 500,
      "/locations/12345/photos": 429,
    });
    const result = await tripadvisor({ key: "k", fetch }).read("12345");
    assert.ok(result.ok);
    assert.equal(result.enrichment.rating?.value, 4.5);
    assert.deepEqual(result.enrichment.reviews, []);
  });

  test("a place that cannot be read says why", async () => {
    const { fetch } = fake({ "/locations": 404 });
    assert.deepEqual(await tripadvisor({ key: "k", fetch }).read("1"), {
      ok: false,
      reason: "no-match",
    });
  });

  test("a rate limit is a rate limit", async () => {
    const { fetch } = fake({ "/catalog/locations/search": 429 });
    assert.deepEqual(await tripadvisor({ key: "k", fetch }).search(place), {
      ok: false,
      reason: "rate-limited",
    });
  });

  test("a reply that is not what the reference says is malformed", async () => {
    const { fetch } = fake({ "/catalog/locations/search": { data: "no" } });
    assert.deepEqual(await tripadvisor({ key: "k", fetch }).search(place), {
      ok: false,
      reason: "malformed",
    });
  });

  test("a slow answer is a timeout", async () => {
    const slow = (async (_: unknown, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      })) as unknown as typeof fetch;
    const result = await tripadvisor({
      key: "k",
      fetch: slow,
      timeoutMs: 10,
    }).search(place);
    assert.deepEqual(result, { ok: false, reason: "timeout" });
  });
});
