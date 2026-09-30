import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { haversineM, type LonLat } from "../domain/geo.ts";
import { routeRequest } from "../domain/route/contract.ts";
import {
  buildUrl,
  classify,
  mapboxDirections,
  normalize,
  SNAP_RADIUS_M,
} from "./mapbox-directions.ts";

// MOCKED. Nothing here calls Mapbox: the responses below are built to have
// Mapbox's shape around real coordinates, so these tests check that the
// adapter asks the right question, keeps the stops' order and axis, and
// refuses an answer that does not fit the question. Whether Mapbox answers
// those questions well is what `pnpm smoke:route` is for, against the live API.

const NOW = new Date("2030-05-01T06:00:00Z");

const TBILISI: LonLat = [44.7936, 41.7151];
const RUSTAVI: LonLat = [44.9975, 41.5495];
const MTSKHETA: LonLat = [44.7181, 41.8457];
const GUDAURI: LonLat = [44.4791, 42.4767];
const STEPANTSMINDA: LonLat = [44.6435, 42.6567];

const ask = (stops: LonLat[], extra = {}) =>
  routeRequest.parse({ stops: stops.map((lonLat) => ({ lonLat })), ...extra });

/** A bent line from a to b, so a leg is more than a segment. */
const between = (a: LonLat, b: LonLat): LonLat[] => [
  a,
  [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.4],
  [a[0] + (b[0] - a[0]) * 0.7, a[1] + (b[1] - a[1]) * 0.6],
  b,
];

/** A reply with Mapbox's shape for these stops, asked in this way. */
function reply(stops: LonLat[], over: Record<string, unknown> = {}) {
  const legs = stops.slice(0, -1).map((a, i) => {
    const line = between(a, stops[i + 1]);
    return {
      line,
      // A road is longer than the crow flies, never shorter.
      distance: Math.round(haversineM(a, stops[i + 1]) * 1.3),
      duration: 900 + i * 60,
      duration_typical: 840 + i * 60,
      summary: i === 0 ? "Rustaveli Avenue, E60" : "E117",
      steps: [
        { geometry: { type: "LineString", coordinates: line.slice(0, 2) } },
        { geometry: { type: "LineString", coordinates: line.slice(1) } },
      ],
    };
  });
  const whole: LonLat[] = [];
  for (const l of legs)
    for (const p of l.line) {
      const last = whole.at(-1);
      if (!last || last[0] !== p[0] || last[1] !== p[1]) whole.push(p);
    }
  return {
    code: "Ok",
    routes: [
      {
        geometry: { type: "LineString", coordinates: whole },
        distance: legs.reduce((n, l) => n + l.distance, 0),
        duration: legs.reduce((n, l) => n + l.duration, 0),
        duration_typical: legs.reduce((n, l) => n + l.duration_typical, 0),
        legs: legs.map(({ line, ...leg }) => leg),
      },
    ],
    waypoints: stops.map((location, i) => ({
      location,
      distance: 6 + i,
      name: `Road ${i}`,
    })),
    ...over,
  };
}

const respond = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;

describe("buildUrl: the question asked", () => {
  test("Tbilisi–Rustavi: driving with traffic, longitude first, full GeoJSON", () => {
    const url = buildUrl(ask([TBILISI, RUSTAVI]));
    assert.equal(url.origin, "https://api.mapbox.com");
    assert.equal(
      url.pathname,
      "/directions/v5/mapbox/driving-traffic/44.793600,41.715100;44.997500,41.549500",
    );
    assert.equal(url.searchParams.get("geometries"), "geojson");
    assert.equal(url.searchParams.get("overview"), "full");
    // "Leave now" sends no departure: Mapbox reads that as live traffic.
    assert.equal(url.searchParams.get("depart_at"), null);
    assert.equal(url.searchParams.get("alternatives"), null);
    assert.equal(url.searchParams.get("continue_straight"), "false");
  });

  test("Tbilisi–Gudauri–Stepantsminda: the stops go in the order given, none dropped or moved", () => {
    const path = buildUrl(ask([TBILISI, GUDAURI, STEPANTSMINDA])).pathname;
    assert.ok(
      path.endsWith(
        "44.793600,41.715100;44.479100,42.476700;44.643500,42.656700",
      ),
    );
    // Not reordered to be shorter, and not sorted.
    const reversed = buildUrl(ask([STEPANTSMINDA, GUDAURI, TBILISI])).pathname;
    assert.ok(reversed.includes("44.643500,42.656700;44.479100"));
  });

  test("walking is its own profile and carries no driving parameters", () => {
    const url = buildUrl(ask([TBILISI, MTSKHETA], { mode: "walk" }));
    assert.ok(url.pathname.includes("/mapbox/walking/"));
    assert.equal(url.searchParams.get("continue_straight"), null);
    assert.equal(url.searchParams.get("depart_at"), null);
  });

  test("a scheduled departure is sent as the UTC instant", () => {
    const url = buildUrl(
      ask([TBILISI, RUSTAVI], { departure: "2030-05-02T08:30:00+04:00" }),
    );
    assert.equal(url.searchParams.get("depart_at"), "2030-05-02T04:30:00.000Z");
  });

  test("alternatives are asked for only when the request says so", () => {
    assert.equal(
      buildUrl(
        ask([TBILISI, RUSTAVI], { alternatives: true }),
      ).searchParams.get("alternatives"),
      "true",
    );
  });

  test("every stop is given a snapping radius, so none lands on a far-off road", () => {
    const url = buildUrl(ask([TBILISI, GUDAURI, STEPANTSMINDA]));
    assert.equal(
      url.searchParams.get("radiuses"),
      [SNAP_RADIUS_M, SNAP_RADIUS_M, SNAP_RADIUS_M].join(";"),
    );
  });

  test("the road-access point is what is routed to; the place is not sent as well", () => {
    const access: LonLat = [44.8, 41.72];
    const url = buildUrl(
      routeRequest.parse({
        stops: [{ lonLat: TBILISI, access }, { lonLat: RUSTAVI }],
      }),
    );
    assert.ok(url.pathname.includes("/44.800000,41.720000;44.997500"));
    assert.ok(!url.pathname.includes("44.793600"));
  });

  test("a full trip's URL stays well under the length a GET can carry", () => {
    const stops = Array.from(
      { length: 25 },
      (_, i): LonLat => [44 + i * 0.01234567, 41.5 + i * 0.01234567],
    );
    assert.ok(buildUrl(ask(stops)).href.length < 2_000);
  });
});

describe("normalize: what came back", () => {
  test("keeps the returned geometry as it came, longitude first", () => {
    const stops = [TBILISI, RUSTAVI];
    const body = reply(stops);
    const answer = normalize(body, ask(stops), NOW);
    const [route] = answer.routes;
    assert.deepEqual(route.path, body.routes[0].geometry.coordinates);
    assert.deepEqual(route.path[0], TBILISI);
    // Longitude is the first number, so a Georgian point has it in the 40s.
    for (const [lon, lat] of route.path) {
      assert.ok(lon > 44 && lon < 45.1, `longitude ${lon}`);
      assert.ok(lat > 41 && lat < 42, `latitude ${lat}`);
    }
    assert.equal(route.legs.length, 1);
    assert.deepEqual(route.legs[0].path, route.path);
    assert.equal(answer.computedAt, NOW.toISOString());
  });

  test("carries the traffic time and the typical time apart, in seconds", () => {
    const answer = normalize(
      reply([TBILISI, RUSTAVI]),
      ask([TBILISI, RUSTAVI]),
      NOW,
    );
    assert.equal(answer.routes[0].durationS, 900);
    assert.equal(answer.routes[0].typicalDurationS, 840);
    assert.equal(
      answer.routes[0].distanceM,
      Math.round(haversineM(TBILISI, RUSTAVI) * 1.3),
    );
    assert.equal(answer.traffic, "live");
  });

  test("driving at a scheduled time is a prediction, and walking has no traffic", () => {
    const stops = [TBILISI, MTSKHETA];
    assert.equal(
      normalize(
        reply(stops),
        ask(stops, { departure: "2030-05-02T04:30:00Z" }),
        NOW,
      ).traffic,
      "predicted",
    );
    const walking = reply(stops);
    // Walking has no typical duration in Mapbox's answer.
    delete (walking.routes[0] as { duration_typical?: number })
      .duration_typical;
    delete (walking.routes[0].legs[0] as { duration_typical?: number })
      .duration_typical;
    const answer = normalize(walking, ask(stops, { mode: "walk" }), NOW);
    assert.equal(answer.traffic, "none");
    assert.equal(answer.routes[0].typicalDurationS, null);
    assert.equal(answer.routes[0].legs[0].typicalDurationS, null);
  });

  test("Tbilisi–Gudauri–Stepantsminda: two legs, each the road between its own two stops", () => {
    const stops = [TBILISI, GUDAURI, STEPANTSMINDA];
    const answer = normalize(reply(stops), ask(stops), NOW);
    const [route] = answer.routes;
    assert.equal(route.legs.length, 2);
    assert.deepEqual(route.legs[0].path[0], TBILISI);
    assert.deepEqual(route.legs[0].path.at(-1), GUDAURI);
    assert.deepEqual(route.legs[1].path[0], GUDAURI);
    assert.deepEqual(route.legs[1].path.at(-1), STEPANTSMINDA);
    assert.deepEqual(
      answer.stops.map((s) => s.lonLat),
      stops,
    );
    // A leg's time is its own; visit time is not in it.
    assert.equal(route.legs[1].durationS, 960);
    assert.equal(route.description, null);
  });

  test("a single leg is named by the roads it takes", () => {
    const stops = [TBILISI, RUSTAVI];
    const answer = normalize(reply(stops), ask(stops), NOW);
    assert.equal(answer.routes[0].description, "Rustaveli Avenue, E60");
  });

  test("says how far each stop had to move to reach a road", () => {
    const stops = [TBILISI, MTSKHETA];
    const body = reply(stops);
    body.waypoints[1].distance = 412.5;
    const answer = normalize(body, ask(stops), NOW);
    assert.equal(answer.stops[1].distanceM, 412.5);
    assert.equal(answer.stops[1].road, "Road 1");
  });

  test("returns alternatives as further routes, the preferred one first", () => {
    const stops = [TBILISI, RUSTAVI];
    const body = reply(stops);
    body.routes.push({ ...body.routes[0], duration: 1_500 });
    const answer = normalize(body, ask(stops, { alternatives: true }), NOW);
    assert.equal(answer.routes.length, 2);
    assert.equal(answer.routes[0].durationS, 900);
    assert.equal(answer.routes[1].durationS, 1_500);
  });

  test("two stops on one spot are a leg that goes nowhere, not an error", () => {
    const stops: LonLat[] = [TBILISI, TBILISI];
    const body = reply(stops);
    body.routes[0].geometry.coordinates = [TBILISI, TBILISI];
    body.routes[0].distance = 0;
    body.routes[0].legs[0] = {
      ...body.routes[0].legs[0],
      distance: 0,
      duration: 0,
      duration_typical: 0,
      steps: [
        { geometry: { type: "LineString", coordinates: [TBILISI, TBILISI] } },
      ],
    };
    const answer = normalize(body, ask(stops), NOW);
    assert.equal(answer.routes[0].distanceM, 0);
  });
});

describe("normalize: an answer that does not fit the question is refused", () => {
  const stops = [TBILISI, GUDAURI, STEPANTSMINDA];
  const bad = (change: (body: ReturnType<typeof reply>) => void) => {
    const body = reply(stops);
    change(body);
    assert.throws(() => normalize(body, ask(stops), NOW));
  };

  test("latitude and longitude swapped in the geometry", () => {
    bad((b) => {
      b.routes[0].geometry.coordinates = b.routes[0].geometry.coordinates.map(
        ([lon, lat]) => [lat, lon] as LonLat,
      );
    });
  });

  test("a route that begins or ends somewhere other than the stops", () => {
    bad((b) => {
      b.routes[0].geometry.coordinates[0] = [45.5, 41.9];
    });
    bad((b) => {
      b.routes[0].geometry.coordinates.push([46, 42]);
    });
  });

  test("a leg count that is not the number of stops less one", () => {
    bad((b) => {
      b.routes[0].legs.pop();
    });
  });

  test("a waypoint list of the wrong length", () => {
    bad((b) => {
      b.waypoints.pop();
    });
  });

  test("legs that do not meet at the stop", () => {
    bad((b) => {
      b.routes[0].legs[1].steps[0].geometry.coordinates[0] = [44.6, 42.5];
    });
  });

  test("a stop moved further than it was allowed to be", () => {
    bad((b) => {
      b.waypoints[1].location = [45.4, 42.0];
    });
  });

  test("a leg shorter than the straight line between its stops", () => {
    bad((b) => {
      b.routes[0].legs[1].distance = 1_000;
    });
  });

  test("a geometry that is not a line, or a number that is not a number", () => {
    bad((b) => {
      (b.routes[0].geometry as { type: string }).type = "Point";
    });
    bad((b) => {
      (b.routes[0] as { duration: unknown }).duration = "900";
    });
    bad((b) => {
      (b.routes[0] as { duration: unknown }).duration = -5;
    });
    bad((b) => {
      (b as { routes: unknown }).routes = [];
    });
  });

  test("a leg with no steps to draw it from", () => {
    bad((b) => {
      b.routes[0].legs[0].steps = [];
    });
  });
});

describe("classify: why nothing came back", () => {
  test("Mapbox's own code is read first, because it answers some failures with 200", () => {
    assert.deepEqual(classify(200, { code: "NoRoute" }, 2), {
      reason: "no-route",
    });
    assert.deepEqual(classify(200, { code: "InvalidInput" }, 2), {
      reason: "invalid",
    });
    assert.deepEqual(classify(200, { code: "ProfileNotFound" }, 2), {
      reason: "upstream",
    });
  });

  test("a stop with no road near it names the stop when Mapbox does", () => {
    assert.deepEqual(
      classify(
        200,
        {
          code: "NoSegment",
          message: "Could not find a matching segment for input coordinate 1",
        },
        3,
      ),
      { reason: "unroutable-stop", stop: 1 },
    );
    // The message Mapbox actually sends, checked against the live API, names none.
    assert.deepEqual(
      classify(
        200,
        {
          code: "NoSegment",
          message: "Could not find a matching segment for input coordinates",
        },
        3,
      ),
      { reason: "unroutable-stop" },
    );
    // An index that is not one of the stops is not passed on.
    assert.deepEqual(
      classify(200, { code: "NoSegment", message: "input coordinate 9" }, 3),
      { reason: "unroutable-stop" },
    );
  });

  test("credentials, rate, validation and outage each their own", () => {
    assert.equal(classify(401, {}, 2).reason, "auth");
    assert.equal(classify(403, {}, 2).reason, "auth");
    assert.equal(classify(429, {}, 2).reason, "rate-limited");
    assert.equal(classify(422, {}, 2).reason, "invalid");
    assert.equal(classify(500, {}, 2).reason, "upstream");
    assert.equal(classify(503, {}, 2).reason, "upstream");
  });
});

describe("mapboxDirections: the call", () => {
  const stops = [TBILISI, RUSTAVI];

  test("without a token it says so and makes no call", async () => {
    const provider = mapboxDirections({
      token: undefined,
      fetch: (() => assert.fail("must not call")) as unknown as typeof fetch,
    });
    assert.equal(provider.configured, false);
    assert.deepEqual(await provider.compute(ask(stops), NOW), {
      ok: false,
      reason: "not-configured",
    });
  });

  test("sends the token as Mapbox wants it, and gets an answer back", async () => {
    let seen: URL | undefined;
    let init: RequestInit | undefined;
    const provider = mapboxDirections({
      token: "sk.server",
      fetch: (async (url: URL, i: RequestInit) => {
        seen = url;
        init = i;
        return new Response(JSON.stringify(reply(stops)));
      }) as unknown as typeof fetch,
    });
    const out = await provider.compute(ask(stops), NOW);
    assert.ok(out.ok);
    assert.equal(seen?.searchParams.get("access_token"), "sk.server");
    // Not kept by Next's data cache: route geometry is not stored.
    assert.equal(init?.cache, "no-store");
    // The token is not part of what the app hands on.
    assert.ok(!JSON.stringify(out).includes("sk.server"));
  });

  const failure = async (fetch: typeof globalThis.fetch) =>
    mapboxDirections({ token: "t", fetch }).compute(ask(stops), NOW);

  test("no road between the stops is an answer, not a fault", async () => {
    assert.deepEqual(await failure(respond(200, { code: "NoRoute" })), {
      ok: false,
      reason: "no-route",
    });
    assert.deepEqual(
      await failure(respond(404, { code: "NoRoute", message: "no route" })),
      { ok: false, reason: "no-route" },
    );
  });

  test("an unroutable stop says which", async () => {
    assert.deepEqual(
      await failure(
        respond(200, {
          code: "NoSegment",
          message: "Could not find a matching segment for input coordinate 0",
        }),
      ),
      { ok: false, reason: "unroutable-stop", stop: 0 },
    );
  });

  test("a bad or unauthorised token, and Mapbox's rate limit", async () => {
    assert.equal(
      (
        await failure(
          respond(401, { message: "Not Authorized - Invalid Token" }),
        )
      ).ok,
      false,
    );
    assert.deepEqual(
      await failure(respond(401, { message: "Not Authorized" })),
      { ok: false, reason: "auth" },
    );
    assert.deepEqual(await failure(respond(403, { message: "Forbidden" })), {
      ok: false,
      reason: "auth",
    });
    assert.deepEqual(await failure(respond(429, { message: "Too many" })), {
      ok: false,
      reason: "rate-limited",
    });
  });

  test("a timeout and a dropped connection are different failures", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    assert.deepEqual(
      await failure((async () => {
        throw timeout;
      }) as unknown as typeof fetch),
      { ok: false, reason: "timeout" },
    );
    assert.deepEqual(
      await failure((async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch),
      { ok: false, reason: "upstream" },
    );
  });

  test("a reply that is not JSON is malformed when it claims success, an outage when not", async () => {
    assert.deepEqual(await failure(respond(200, "<html>")), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(await failure(respond(502, "<html>")), {
      ok: false,
      reason: "upstream",
    });
  });

  test("a reply that is Ok but does not fit is malformed, never drawn", async () => {
    const swapped = reply(stops);
    swapped.routes[0].geometry.coordinates =
      swapped.routes[0].geometry.coordinates.map(
        ([lon, lat]) => [lat, lon] as LonLat,
      );
    assert.deepEqual(await failure(respond(200, swapped)), {
      ok: false,
      reason: "malformed",
    });
  });

  test("gives up after its own timeout rather than waiting on the page's", async () => {
    let signal: AbortSignal | null | undefined;
    const provider = mapboxDirections({
      token: "t",
      timeoutMs: 5,
      fetch: ((_url: URL, init: RequestInit) => {
        signal = init.signal;
        return new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        });
      }) as unknown as typeof fetch,
    });
    assert.deepEqual(await provider.compute(ask(stops), NOW), {
      ok: false,
      reason: "timeout",
    });
    assert.ok(signal);
  });
});
