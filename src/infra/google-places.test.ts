import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classify,
  googlePlaces,
  parseDetails,
  toCandidates,
  toReviews,
} from "./google-places.ts";

// MOCKED. Nothing here calls Google: the bodies below have the shape the Places
// API (New) reference documents, around real-looking values. They check that the
// adapter asks the right questions and refuses what does not fit. Whether Google
// answers as its reference says is what `pnpm smoke:google-places` is for.

const search = {
  places: [
    {
      id: "ChIJfabrika",
      displayName: { text: "Fabrika Tbilisi", languageCode: "en" },
      location: { latitude: 41.7167, longitude: 44.8076 },
    },
    { id: "ChIJnowhere", displayName: { text: "Nowhere" } },
  ],
};

const details = {
  id: "ChIJfabrika",
  rating: 4.4,
  userRatingCount: 9210,
  googleMapsUri: "https://maps.google.com/?cid=1",
  reviews: [
    {
      name: "places/ChIJfabrika/reviews/r1",
      rating: 5,
      text: { text: "Great courtyard", languageCode: "en" },
      originalText: { text: "Schön", languageCode: "de" },
      publishTime: "2030-04-02T10:00:00Z",
      googleMapsUri: "https://maps.google.com/?cid=1&review=r1",
      authorAttribution: {
        displayName: "Mari",
        uri: "https://www.google.com/maps/contrib/1",
      },
    },
    {
      name: "places/ChIJfabrika/reviews/r2",
      rating: 4,
      publishTime: "2030-04-01T10:00:00Z",
    },
  ],
  photos: [
    {
      name: "places/ChIJfabrika/photos/p1",
      widthPx: 4000,
      heightPx: 3000,
      authorAttributions: [
        { displayName: "Gio", uri: "https://www.google.com/maps/contrib/2" },
      ],
    },
    { name: "places/ChIJfabrika/photos/p2", authorAttributions: [] },
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
    const answer = answers[url.pathname.replace("/v1", "")];
    if (typeof answer === "number")
      return new Response("{}", { status: answer });
    return Response.json(answer ?? {}, {
      status: answer === undefined ? 404 : 200,
    });
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

const place = {
  name: "Fabrika",
  nameKa: null,
  lonLat: [44.8076, 41.7167] as [number, number],
  category: "hotel",
};

const reading = {
  "/places/ChIJfabrika": details,
  "/places/ChIJfabrika/photos/p1/media": {
    name: "places/ChIJfabrika/photos/p1/media",
    photoUri: "https://lh3.googleusercontent.com/places/p1=s1200",
  },
  "/places/ChIJfabrika/photos/p2/media": {
    photoUri: "https://lh3.googleusercontent.com/places/p2=s1200",
  },
};

describe("parsing", () => {
  test("candidates carry the name and the coordinates, longitude first", () => {
    const [first, second] = toCandidates(search);
    assert.deepEqual(first.lonLat, [44.8076, 41.7167]);
    assert.deepEqual(first.names, ["Fabrika Tbilisi"]);
    assert.equal(second.lonLat, null);
  });

  test("a search that found nothing has no places key, and no candidates", () => {
    assert.deepEqual(toCandidates({}), []);
  });

  test("a review with no text is not shown, and the translation wins over the original", () => {
    const reviews = toReviews(parseDetails(details));
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].text, "Great courtyard");
    assert.equal(reviews[0].author, "Mari");
    assert.equal(reviews[0].url, "https://maps.google.com/?cid=1&review=r1");
  });

  test("a photograph's name must be the shape Google gives, or the reply is refused", () => {
    assert.throws(() =>
      parseDetails({
        ...details,
        photos: [{ name: "places/x/photos/../../../v1/places" }],
      }),
    );
  });

  test("an address that is not https is a malformed reply", () => {
    assert.throws(() =>
      parseDetails({
        ...details,
        googleMapsUri: "http://maps.google.com/?cid=1",
      }),
    );
  });
});

describe("failures", () => {
  test("statuses are reasons", () => {
    assert.equal(classify(403), "auth");
    assert.equal(classify(404), "no-match");
    assert.equal(classify(429), "rate-limited");
    assert.equal(classify(500), "upstream");
  });
});

describe("the calls", () => {
  test("without a key nothing is sent", async () => {
    const { fetch, calls } = fake({});
    const provider = googlePlaces({ key: undefined, fetch });
    assert.equal(provider.configured, false);
    assert.deepEqual(await provider.search(place), {
      ok: false,
      reason: "not-configured",
    });
    assert.equal(calls.length, 0);
  });

  test("a search asks for few results, only the fields a match needs, near the pin, with the key in a header", async () => {
    const { fetch, calls } = fake({ "/places:searchText": search });
    const result = await googlePlaces({ key: "secret", fetch }).search(place);
    assert.equal(result.ok, true);
    const { url, init } = calls[0];
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["X-Goog-Api-Key"], "secret");
    assert.equal(
      headers["X-Goog-FieldMask"],
      "places.id,places.displayName,places.location",
    );
    const body = JSON.parse(String(init.body));
    assert.equal(body.textQuery, "Fabrika");
    assert.equal(body.maxResultCount, 5);
    assert.deepEqual(body.locationBias.circle.center, {
      latitude: 41.7167,
      longitude: 44.8076,
    });
    // Never in the address, where a log would keep it.
    assert.ok(!url.href.includes("secret"));
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
  });

  test("reading a place gathers the rating, the reviews and each photograph's keyless address", async () => {
    const { fetch, calls } = fake(reading);
    const result = await googlePlaces({ key: "k", fetch }).read("ChIJfabrika");
    assert.ok(result.ok);
    const { enrichment } = result;
    assert.equal(enrichment.source.name, "Google Maps");
    assert.deepEqual(enrichment.rating, {
      value: 4.4,
      count: 9210,
      icon: null,
    });
    assert.equal(enrichment.reviews.length, 1);
    assert.deepEqual(
      enrichment.photos.map((p) => p.url),
      [
        "https://lh3.googleusercontent.com/places/p1=s1200",
        "https://lh3.googleusercontent.com/places/p2=s1200",
      ],
    );
    // Asked for the address, not the bytes, and sized for full screen.
    const media = calls.find((c) => c.url.pathname.endsWith("p1/media"));
    assert.equal(media?.url.searchParams.get("skipHttpRedirect"), "true");
    assert.equal(media?.url.searchParams.get("maxWidthPx"), "1200");
    // No call carries the key in its address.
    assert.ok(calls.every((c) => !c.url.href.includes("key=")));
  });

  test("a photograph credits its author, or Google Maps when it has none", async () => {
    const { fetch } = fake(reading);
    const result = await googlePlaces({ key: "k", fetch }).read("ChIJfabrika");
    assert.ok(result.ok);
    const [first, second] = result.enrichment.photos;
    assert.deepEqual(first.credit, {
      text: "Gio · Google Maps",
      url: "https://www.google.com/maps/contrib/2",
    });
    assert.deepEqual(second.credit, {
      text: "Google Maps",
      url: "https://maps.google.com/?cid=1",
    });
    assert.notEqual(first.id, second.id);
  });

  test("a photograph that cannot be resolved is dropped, not the place", async () => {
    const { fetch } = fake({
      ...reading,
      "/places/ChIJfabrika/photos/p1/media": 500,
    });
    const result = await googlePlaces({ key: "k", fetch }).read("ChIJfabrika");
    assert.ok(result.ok);
    assert.equal(result.enrichment.photos.length, 1);
    assert.equal(result.enrichment.rating?.value, 4.4);
  });

  test("only a few photographs are resolved, each being a billed call", async () => {
    const many = {
      ...details,
      photos: Array.from({ length: 10 }, (_, i) => ({
        name: `places/ChIJfabrika/photos/p${i}`,
      })),
    };
    const { fetch, calls } = fake({ "/places/ChIJfabrika": many });
    await googlePlaces({ key: "k", fetch }).read("ChIJfabrika");
    assert.equal(calls.length, 1 + 6);
  });

  test("a place with no page to link to has nothing to show", async () => {
    const { fetch } = fake({
      "/places/ChIJfabrika": { ...details, googleMapsUri: undefined },
    });
    assert.deepEqual(
      await googlePlaces({ key: "k", fetch }).read("ChIJfabrika"),
      { ok: false, reason: "no-match" },
    );
  });

  test("a place that cannot be read says why", async () => {
    const { fetch } = fake({ "/places/gone": 404 });
    assert.deepEqual(await googlePlaces({ key: "k", fetch }).read("gone"), {
      ok: false,
      reason: "no-match",
    });
  });

  test("a rate limit is a rate limit", async () => {
    const { fetch } = fake({ "/places:searchText": 429 });
    assert.deepEqual(await googlePlaces({ key: "k", fetch }).search(place), {
      ok: false,
      reason: "rate-limited",
    });
  });

  test("a reply that is not what the reference says is malformed", async () => {
    const { fetch } = fake({ "/places:searchText": { places: "no" } });
    assert.deepEqual(await googlePlaces({ key: "k", fetch }).search(place), {
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
    const result = await googlePlaces({
      key: "k",
      fetch: slow,
      timeoutMs: 10,
    }).search(place);
    assert.deepEqual(result, { ok: false, reason: "timeout" });
  });
});
