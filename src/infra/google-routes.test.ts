import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type RouteRequestInput,
  routeRequest,
} from "../domain/route/contract.ts";
import { encodePolyline } from "../domain/route/polyline.ts";
import {
  buildBody,
  classify,
  fieldMask,
  googleRoutes,
  normalize,
  parseDuration,
} from "./google-routes.ts";

const TBILISI = [44.8271, 41.7151] as [number, number];
const MTSKHETA = [44.7211, 41.8457] as [number, number];
const GUDAURI = [44.4802, 42.4773] as [number, number];
const NOW = new Date("2030-05-01T06:00:00Z");

const request = (input: Partial<RouteRequestInput> = {}) =>
  routeRequest.parse({
    stops: [{ lonLat: TBILISI }, { lonLat: MTSKHETA }],
    ...input,
  });

const road = [TBILISI, [44.79, 41.77], MTSKHETA] as [number, number][];
const rawLeg = (path: [number, number][], extra = {}) => ({
  distanceMeters: 22_400,
  duration: "1310s",
  staticDuration: "1200s",
  polyline: { encodedPolyline: encodePolyline(path) },
  ...extra,
});
const rawRoute = (extra = {}) => ({
  distanceMeters: 22_400,
  duration: "1310s",
  staticDuration: "1200s",
  polyline: { encodedPolyline: encodePolyline(road) },
  legs: [rawLeg(road)],
  description: "Kakheti Hwy",
  routeLabels: ["DEFAULT_ROUTE"],
  warnings: ["This route has tolls."],
  ...extra,
});

describe("buildBody", () => {
  test("driving asks for traffic-aware routing and full-quality polylines", () => {
    const body = buildBody(request());
    assert.equal(body.travelMode, "DRIVE");
    assert.equal(body.routingPreference, "TRAFFIC_AWARE_OPTIMAL");
    assert.equal(body.polylineQuality, "HIGH_QUALITY");
    assert.equal(body.polylineEncoding, "ENCODED_POLYLINE");
    assert.equal(body.units, "METRIC");
    assert.equal(body.optimizeWaypointOrder, false);
  });

  test("leaving now sends no departure time", () => {
    assert.ok(!("departureTime" in buildBody(request())));
  });

  test("a scheduled departure is sent as the UTC instant, not the local clock", () => {
    const body = buildBody(request({ departure: "2030-05-01T08:30:00+04:00" }));
    assert.equal(body.departureTime, "2030-05-01T04:30:00.000Z");
  });

  test("walking carries no driving fields", () => {
    const body = buildBody(request({ mode: "walk" }));
    assert.equal(body.travelMode, "WALK");
    assert.ok(!("routingPreference" in body));
    assert.ok(!("departureTime" in body));
  });

  test("coordinates go to Google latitude first", () => {
    const body = buildBody(request());
    assert.deepEqual(body.origin, {
      location: { latLng: { latitude: 41.7151, longitude: 44.8271 } },
    });
  });

  test("intermediates keep the saved order, and none disappear", () => {
    const stops = [TBILISI, MTSKHETA, GUDAURI, [45.0, 42.0], [45.2, 42.1]] as [
      number,
      number,
    ][];
    const body = buildBody(
      request({ stops: stops.map((lonLat) => ({ lonLat })) }),
    );
    assert.deepEqual(
      body.intermediates?.map(
        (w) =>
          (w as { location: { latLng: { longitude: number } } }).location.latLng
            .longitude,
      ),
      [MTSKHETA[0], GUDAURI[0], 45.0],
    );
    assert.deepEqual(body.destination, {
      location: { latLng: { latitude: 42.1, longitude: 45.2 } },
    });
  });

  test("two stops have no intermediates key", () => {
    assert.ok(!("intermediates" in buildBody(request())));
  });

  test("a Google place id is used for that stop, coordinates for the rest", () => {
    const body = buildBody(
      request({
        stops: [
          { lonLat: TBILISI, googlePlaceId: "ChIJabc" },
          { lonLat: MTSKHETA },
        ],
      }),
    );
    assert.deepEqual(body.origin, { placeId: "ChIJabc" });
    assert.ok("location" in body.destination);
  });

  test("alternatives are requested only when asked for", () => {
    assert.ok(!("computeAlternativeRoutes" in buildBody(request())));
    assert.equal(
      buildBody(request({ alternatives: true })).computeAlternativeRoutes,
      true,
    );
  });
});

describe("fieldMask", () => {
  test("names fields; never * and never traffic on the polyline", () => {
    const mask = fieldMask(request());
    assert.ok(!mask.includes("*"));
    assert.ok(mask.includes("routes.polyline.encodedPolyline"));
    assert.ok(mask.includes("fallbackInfo"));
    assert.ok(!mask.includes("travelAdvisory"));
  });

  test("per-leg polylines are asked for only with several legs", () => {
    assert.ok(!fieldMask(request()).includes("routes.legs.polyline"));
    const three = request({
      stops: [TBILISI, MTSKHETA, GUDAURI].map((lonLat) => ({ lonLat })),
    });
    assert.ok(
      fieldMask(three).includes("routes.legs.polyline.encodedPolyline"),
    );
  });
});

describe("parseDuration", () => {
  test("reads whole and fractional seconds", () => {
    assert.equal(parseDuration("3844s"), 3844);
    assert.equal(parseDuration("12.5s"), 12.5);
    assert.equal(parseDuration("0s"), 0);
  });
  test("refuses what is not a duration", () => {
    for (const bad of ["12", "1h", "-3s", "s", "", undefined, 12]) {
      assert.throws(() => parseDuration(bad));
    }
  });
});

describe("normalize", () => {
  test("keeps the returned road, durations, warnings and labels", () => {
    const answer = normalize({ routes: [rawRoute()] }, request(), NOW);
    assert.ok(answer !== "no-route");
    const [route] = answer.routes;
    assert.deepEqual(route.path, road);
    assert.equal(route.path.length, 3, "geometry is not reduced to its stops");
    assert.equal(route.durationS, 1310);
    assert.equal(route.staticDurationS, 1200);
    assert.equal(route.distanceM, 22_400);
    assert.deepEqual(route.warnings, ["This route has tolls."]);
    assert.equal(route.description, "Kakheti Hwy");
    assert.equal(answer.traffic, "live");
    assert.equal(answer.computedAt, NOW.toISOString());
    assert.equal(answer.fallback, null);
  });

  test("a scheduled departure is a prediction, walking has no traffic", () => {
    const later = request({ departure: "2030-05-02T08:30:00+04:00" });
    assert.equal(
      (normalize({ routes: [rawRoute()] }, later, NOW) as { traffic: string })
        .traffic,
      "predicted",
    );
    const walk = request({ mode: "walk" });
    assert.equal(
      (normalize({ routes: [rawRoute()] }, walk, NOW) as { traffic: string })
        .traffic,
      "none",
    );
  });

  test("an omitted distance is zero, not an error", () => {
    const { distanceMeters: _r, ...noDistance } = rawRoute();
    const { distanceMeters: _l, ...leg } = rawLeg(road);
    const answer = normalize(
      { routes: [{ ...noDistance, legs: [leg] }] },
      request(),
      NOW,
    );
    assert.ok(answer !== "no-route");
    assert.equal(answer.routes[0].distanceM, 0);
  });

  test("passes the provider's fallback through", () => {
    const answer = normalize(
      {
        routes: [rawRoute()],
        fallbackInfo: {
          routingMode: "FALLBACK_TRAFFIC_UNAWARE",
          routeCalculationReason: "SERVER_ERROR",
        },
      },
      request(),
      NOW,
    );
    assert.ok(answer !== "no-route");
    assert.deepEqual(answer.fallback, {
      mode: "FALLBACK_TRAFFIC_UNAWARE",
      reason: "SERVER_ERROR",
    });
  });

  test("returns every alternative it is given", () => {
    const answer = normalize(
      { routes: [rawRoute(), rawRoute({ description: "Old road" })] },
      request({ alternatives: true }),
      NOW,
    );
    assert.ok(answer !== "no-route");
    assert.equal(answer.routes.length, 2);
  });

  test("several stops: each leg carries its own geometry, in order", () => {
    const first = [TBILISI, MTSKHETA] as [number, number][];
    const second = [MTSKHETA, [44.6, 42.2], GUDAURI] as [number, number][];
    const three = request({
      stops: [TBILISI, MTSKHETA, GUDAURI].map((lonLat) => ({ lonLat })),
    });
    const answer = normalize(
      {
        routes: [
          rawRoute({
            polyline: {
              encodedPolyline: encodePolyline([...first, ...second.slice(1)]),
            },
            legs: [rawLeg(first), rawLeg(second)],
          }),
        ],
      },
      three,
      NOW,
    );
    assert.ok(answer !== "no-route");
    assert.deepEqual(
      answer.routes[0].legs.map((l) => l.path),
      [first, second],
    );
  });

  test("throws when legs do not match the stops, or a leg has no geometry", () => {
    const three = request({
      stops: [TBILISI, MTSKHETA, GUDAURI].map((lonLat) => ({ lonLat })),
    });
    assert.throws(() => normalize({ routes: [rawRoute()] }, three, NOW));
    const bare = { ...rawLeg(road), polyline: undefined };
    assert.throws(() =>
      normalize({ routes: [rawRoute({ legs: [bare, bare] })] }, three, NOW),
    );
  });

  test("throws on a route without geometry instead of joining the stops", () => {
    assert.throws(() =>
      normalize(
        { routes: [rawRoute({ polyline: undefined })] },
        request(),
        NOW,
      ),
    );
  });

  test("no routes is no route", () => {
    assert.equal(normalize({}, request(), NOW), "no-route");
    assert.equal(normalize({ routes: [] }, request(), NOW), "no-route");
  });
});

describe("classify", () => {
  test("keeps credentials, quota, bad input and outages apart", () => {
    assert.equal(
      classify(403, { error: { status: "PERMISSION_DENIED" } }),
      "auth",
    );
    assert.equal(
      classify(400, {
        error: {
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      }),
      "auth",
    );
    assert.equal(
      classify(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
      "quota",
    );
    assert.equal(
      classify(400, { error: { status: "INVALID_ARGUMENT" } }),
      "invalid",
    );
    assert.equal(classify(404, { error: { status: "NOT_FOUND" } }), "no-route");
    assert.equal(classify(503, {}), "upstream");
  });
});

describe("googleRoutes", () => {
  const respond = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  test("without a key nothing is sent", async () => {
    let called = false;
    const provider = googleRoutes({
      apiKey: undefined,
      fetch: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.equal(provider.configured, false);
    assert.deepEqual(await provider.compute(request(), NOW), {
      ok: false,
      reason: "not-configured",
    });
    assert.equal(called, false);
  });

  test("sends the key and field mask as headers, not in the URL, and returns the road", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const provider = googleRoutes({
      apiKey: "server-key",
      fetch: async (url, init) => {
        seen = { url: String(url), init: init as RequestInit };
        return new Response(JSON.stringify({ routes: [rawRoute()] }), {
          status: 200,
        });
      },
    });
    const outcome = await provider.compute(request(), NOW);
    assert.ok(outcome.ok);
    assert.equal(
      seen?.url,
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    const headers = seen?.init.headers as Record<string, string>;
    assert.equal(headers["X-Goog-Api-Key"], "server-key");
    assert.ok(headers["X-Goog-FieldMask"].includes("routes.duration"));
    assert.ok(!seen?.url.includes("server-key"));
    assert.equal(seen?.init.cache, "no-store");
  });

  test("maps each kind of failure to an honest reason", async () => {
    const reason = async (status: number, body: unknown) =>
      await googleRoutes({ apiKey: "k", fetch: respond(status, body) }).compute(
        request(),
        NOW,
      );
    assert.deepEqual(
      await reason(403, { error: { status: "PERMISSION_DENIED" } }),
      { ok: false, reason: "auth" },
    );
    assert.deepEqual(
      await reason(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
      { ok: false, reason: "quota" },
    );
    assert.deepEqual(await reason(500, {}), { ok: false, reason: "upstream" });
    assert.deepEqual(await reason(200, {}), { ok: false, reason: "no-route" });
    assert.deepEqual(await reason(200, { routes: [{ duration: "10s" }] }), {
      ok: false,
      reason: "malformed",
    });
  });

  test("a timeout and a dropped connection are different from a bad answer", async () => {
    const timeout = googleRoutes({
      apiKey: "k",
      fetch: async () => {
        throw new DOMException("t", "TimeoutError");
      },
    });
    assert.deepEqual(await timeout.compute(request(), NOW), {
      ok: false,
      reason: "timeout",
    });
    const down = googleRoutes({
      apiKey: "k",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.deepEqual(await down.compute(request(), NOW), {
      ok: false,
      reason: "upstream",
    });
  });
});
