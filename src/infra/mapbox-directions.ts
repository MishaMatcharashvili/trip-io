import { haversineM, type LonLat } from "../domain/geo.ts";
import type {
  RouteAlternative,
  RouteAnswer,
  RouteFailure,
  RouteLeg,
  RouteOutcome,
  RouteRequest,
  RoutesProvider,
  StopSnap,
} from "../domain/route/contract.ts";

// Mapbox's Directions API, behind the domain's RoutesProvider port: the only
// file that knows its URL, its parameters, its response shape or its error
// codes. The request is built here from validated app values; nothing a
// browser sent is forwarded.
//
// What is asked for, and why:
//   * `mapbox/driving-traffic` for driving, `mapbox/walking` for walking. The
//     profile is chosen from the mode and never falls back to another.
//   * `geometries=geojson`, `overview=full`: the road as coordinates,
//     longitude first, at full detail. There is no encoded polyline to decode
//     and no latitude/longitude swap to get wrong.
//   * `steps=true`: Mapbox gives no per-leg geometry without it. A leg's road
//     is the concatenation of its steps' own geometry, which is what the
//     provider drew, not the overview cut at a guessed place. (The steps'
//     instructions are read by nothing.)
//   * `radiuses`: a stop is moved to the road at most this far. Left at the
//     default (unlimited) a mountain viewpoint would quietly become a road in
//     the next valley; a stop with no road near it is a failure that names
//     the stop.
//   * `continue_straight=false` for driving: a stop is somewhere you park, so a
//     U-turn at it is allowed. The default would send the route on to the next
//     junction and back.
//   * No `depart_at` for "leave now", which Mapbox reads as live traffic. A
//     scheduled departure is sent as UTC.
// Not used: waypoint_targets, approaches, exclude, annotations, the
// Optimization API, the Matrix API, and `alternatives` past two stops.
//
// The token rides in the query string, as Mapbox requires. The URL is never
// logged, and errors are reduced to a code before they leave this file.

const ORIGIN = "https://api.mapbox.com/directions/v5";
/** A route the page is waiting on: a slow answer is a failure, not a spinner. */
const TIMEOUT_MS = 10_000;
/** How far a stop may be moved onto the road network, in metres. */
export const SNAP_RADIUS_M = 3_000;
/** How closely the road must begin and end where the snapped stops are. */
const ENDPOINT_TOLERANCE_M = 25;

const profileOf = (mode: RouteRequest["mode"]) =>
  mode === "drive" ? "mapbox/driving-traffic" : "mapbox/walking";

/** Where a stop is sent to the router: the road-access point if there is one. */
const coordinateOf = (stop: RouteRequest["stops"][number]): LonLat =>
  stop.access ?? stop.lonLat;

// Longitude first, six decimals (about ten centimetres).
const pair = ([lon, lat]: LonLat) => `${lon.toFixed(6)},${lat.toFixed(6)}`;

/** The request as a URL, minus the token: for the call and for tests. */
export function buildUrl(request: RouteRequest): URL {
  const { stops, mode } = request;
  const drive = mode === "drive";
  const url = new URL(
    `${ORIGIN}/${profileOf(mode)}/${stops.map((s) => pair(coordinateOf(s))).join(";")}`,
  );
  const q = url.searchParams;
  q.set("geometries", "geojson");
  q.set("overview", "full");
  q.set("steps", "true");
  q.set("radiuses", stops.map(() => SNAP_RADIUS_M).join(";"));
  // The itinerary's order is the traveller's: this API never reorders, and
  // this is the only place a coordinate list is assembled.
  if (request.alternatives) q.set("alternatives", "true");
  if (drive) {
    q.set("continue_straight", "false");
    if (request.departure !== "now") {
      q.set("depart_at", new Date(request.departure).toISOString());
    }
  }
  return url;
}

type RawStep = { geometry?: { type?: string; coordinates?: unknown } };
type RawLeg = {
  distance?: unknown;
  duration?: unknown;
  duration_typical?: unknown;
  summary?: unknown;
  steps?: RawStep[];
};
type RawRoute = {
  geometry?: { type?: string; coordinates?: unknown };
  distance?: unknown;
  duration?: unknown;
  duration_typical?: unknown;
  legs?: RawLeg[];
};
type RawResponse = {
  code?: string;
  message?: string;
  routes?: RawRoute[];
  waypoints?: {
    location?: unknown;
    distance?: unknown;
    name?: unknown;
  }[];
};

const number = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`bad ${what}`);
  }
  return v;
};
const optionalNumber = (v: unknown, what: string): number | null =>
  v === undefined || v === null ? null : number(v, what);

/** One coordinate, checked: two finite numbers that could be a longitude and a latitude. */
function point(value: unknown): LonLat {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    Math.abs(value[0]) > 180 ||
    Math.abs(value[1]) > 90
  ) {
    throw new Error("bad coordinate");
  }
  return [value[0], value[1]];
}

function lineString(
  geometry: { type?: string; coordinates?: unknown } | undefined,
): LonLat[] {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    throw new Error("geometry is not a LineString");
  }
  const path = geometry.coordinates.map(point);
  if (path.length < 2) throw new Error("geometry too short");
  return path;
}

const same = (a: LonLat, b: LonLat) =>
  Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/**
 * A leg's road, from its steps' own geometry laid end to end. Adjacent steps
 * share a vertex, which is kept once.
 */
function legPath(leg: RawLeg): LonLat[] {
  if (!leg.steps?.length) throw new Error("leg has no steps");
  const path: LonLat[] = [];
  for (const step of leg.steps) {
    const coords = Array.isArray(step.geometry?.coordinates)
      ? step.geometry.coordinates.map(point)
      : (() => {
          throw new Error("step has no geometry");
        })();
    for (const c of coords) {
      const last = path.at(-1);
      if (!last || !same(last, c)) path.push(c);
    }
  }
  // Two stops on one spot make a leg that goes nowhere: a point, drawn as two.
  if (path.length === 1) path.push(path[0]);
  return path;
}

/**
 * The provider's answer as the app's. Throws on a shape it does not
 * recognise or a road that does not join the stops it was asked to join; the
 * caller reports that as malformed rather than drawing a guess.
 */
export function normalize(
  body: RawResponse,
  request: RouteRequest,
  now: Date,
): RouteAnswer {
  const stopCount = request.stops.length;
  const expectedLegs = stopCount - 1;

  if (body.waypoints?.length !== stopCount) {
    throw new Error("wrong number of waypoints");
  }
  const stops = body.waypoints.map((w, i): StopSnap => {
    const lonLat = point(w.location);
    const distanceM = number(w.distance, "snap distance");
    // The stop moved further than it was allowed to, or not the way it was sent.
    const sent = coordinateOf(request.stops[i]);
    if (haversineM(sent, lonLat) > SNAP_RADIUS_M + 100) {
      throw new Error("stop snapped outside its radius");
    }
    return {
      lonLat,
      distanceM,
      road: typeof w.name === "string" && w.name ? w.name : null,
    };
  });
  const first = stops[0].lonLat;
  const last = stops[expectedLegs].lonLat;

  if (!body.routes?.length) throw new Error("no routes");
  const routes = body.routes.map((raw): RouteAlternative => {
    if (raw.legs?.length !== expectedLegs) {
      throw new Error("wrong number of legs");
    }
    const outline = lineString(raw.geometry);
    // The road must begin and end at the stops it was asked to join. A line
    // that starts somewhere else is another route, or the wrong axis.
    if (
      haversineM(outline[0], first) > ENDPOINT_TOLERANCE_M ||
      haversineM(outline[outline.length - 1], last) > ENDPOINT_TOLERANCE_M
    ) {
      throw new Error("route does not join its stops");
    }

    const legs = raw.legs.map((leg, i): RouteLeg => {
      const path = expectedLegs === 1 ? outline : legPath(leg);
      const distanceM = number(leg.distance, "leg distance");
      // A road cannot be shorter than the straight line across it.
      if (distanceM < haversineM(stops[i].lonLat, stops[i + 1].lonLat) * 0.98) {
        throw new Error("leg shorter than the straight line");
      }
      return {
        distanceM,
        durationS: number(leg.duration, "leg duration"),
        typicalDurationS: optionalNumber(leg.duration_typical, "typical"),
        path,
      };
    });
    // Consecutive legs must meet where the stop is.
    for (let i = 0; i < legs.length; i++) {
      const legStart = legs[i].path[0];
      const legEnd = legs[i].path[legs[i].path.length - 1];
      if (
        haversineM(legStart, stops[i].lonLat) > ENDPOINT_TOLERANCE_M ||
        haversineM(legEnd, stops[i + 1].lonLat) > ENDPOINT_TOLERANCE_M
      ) {
        throw new Error("leg does not join its stops");
      }
    }

    const distanceM = number(raw.distance, "distance");
    const summary = expectedLegs === 1 ? raw.legs[0].summary : null;
    return {
      distanceM,
      durationS: number(raw.duration, "duration"),
      typicalDurationS: optionalNumber(raw.duration_typical, "typical"),
      path: outline,
      legs,
      description:
        typeof summary === "string" && summary.trim() ? summary.trim() : null,
    };
  });

  return {
    routes,
    stops,
    mode: request.mode,
    traffic:
      request.mode !== "drive"
        ? "none"
        : request.departure === "now"
          ? "live"
          : "predicted",
    computedAt: now.toISOString(),
  };
}

/**
 * Which failure a reply is, read from Mapbox's own `code` first (it answers
 * some failures with 200) and the HTTP status second. Credentials and quota
 * are not retried by the caller.
 */
export function classify(
  status: number,
  body: RawResponse,
  stopCount: number,
): { reason: RouteFailure; stop?: number } {
  switch (body.code) {
    case "NoRoute":
      return { reason: "no-route" };
    case "NoSegment": {
      // Live, Mapbox's message is "Could not find a matching segment for
      // input coordinates" with no index, so the stop usually stays unnamed.
      // An index is used if a reply ever carries one.
      const index = /coordinate\s+(\d+)/i.exec(body.message ?? "")?.[1];
      const stop = index === undefined ? undefined : Number(index);
      return stop !== undefined && stop < stopCount
        ? { reason: "unroutable-stop", stop }
        : { reason: "unroutable-stop" };
    }
    case "InvalidInput":
      return { reason: "invalid" };
    case "ProfileNotFound":
      // Ours, not the traveller's.
      return { reason: "upstream" };
  }
  if (status === 401 || status === 403) return { reason: "auth" };
  if (status === 429) return { reason: "rate-limited" };
  if (status === 422 || status === 400) return { reason: "invalid" };
  return { reason: "upstream" };
}

export function mapboxDirections(options: {
  token: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RoutesProvider {
  const { token, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  return {
    configured: Boolean(token),
    async compute(request, now): Promise<RouteOutcome> {
      if (!token) return { ok: false, reason: "not-configured" };

      const url = buildUrl(request);
      url.searchParams.set("access_token", token);

      let res: Response;
      try {
        res = await send(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          // Route geometry is the provider's content; it is not kept.
          cache: "no-store",
        });
      } catch (error) {
        const timedOut =
          error instanceof Error && error.name === "TimeoutError";
        return { ok: false, reason: timedOut ? "timeout" : "upstream" };
      }

      let body: RawResponse;
      try {
        body = (await res.json()) as RawResponse;
      } catch {
        // An error page, or nothing: only the status can be read.
        return res.ok
          ? { ok: false, reason: "malformed" }
          : { ok: false, ...classify(res.status, {}, request.stops.length) };
      }

      if (!res.ok || body.code !== "Ok") {
        return {
          ok: false,
          ...classify(res.status, body ?? {}, request.stops.length),
        };
      }

      try {
        return { ok: true, answer: normalize(body, request, now) };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
