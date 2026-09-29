import type { LonLat } from "../domain/geo.ts";
import type {
  RouteAlternative,
  RouteAnswer,
  RouteFailure,
  RouteLeg,
  RouteOutcome,
  RouteRequest,
  RouteStop,
  RoutesProvider,
} from "../domain/route/contract.ts";
import { decodePolyline } from "../domain/route/polyline.ts";

// Google's Routes API, behind the domain's RoutesProvider port: the only file
// that knows its request shape, its field mask, its duration strings or its
// error codes. The request is built here from validated app values; nothing a
// browser sent is forwarded.
//
// Billing, so it can be found: a driving request with TRAFFIC_AWARE_OPTIMAL is
// a Compute Routes *Pro* event, whichever traffic-aware value is used; a
// walking request has no routing preference and is Essentials. Alternatives,
// waypoint counts and polyline quality do not change the tier. Nothing here
// asks for traffic on the polyline, route matrices or optimised waypoint
// order, which would.

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
/** A route the page is waiting on: a slow answer is a failure, not a spinner. */
const TIMEOUT_MS = 8_000;

const waypoint = (stop: RouteStop) =>
  stop.googlePlaceId
    ? { placeId: stop.googlePlaceId }
    : {
        location: {
          // Google's order is latitude first; the app's is longitude first.
          latLng: { latitude: stop.lonLat[1], longitude: stop.lonLat[0] },
        },
      };

/** The JSON body for one request. Mode-specific: driving fields never reach walking. */
export function buildBody(request: RouteRequest) {
  const { stops, mode } = request;
  const drive = mode === "drive";
  return {
    origin: waypoint(stops[0]),
    destination: waypoint(stops[stops.length - 1]),
    // Left off, not empty, when there are none.
    ...(stops.length > 2 && {
      intermediates: stops.slice(1, -1).map(waypoint),
    }),
    travelMode: drive ? "DRIVE" : "WALK",
    // Routing preferences exist for vehicles only; a walking request that
    // carried one would be refused.
    ...(drive && { routingPreference: "TRAFFIC_AWARE_OPTIMAL" }),
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "ENCODED_POLYLINE",
    units: "METRIC",
    // The itinerary's order is the traveller's. Never rearranged here.
    optimizeWaypointOrder: false,
    ...(request.alternatives && { computeAlternativeRoutes: true }),
    // Omitted for "leave now", so Google uses the moment it receives the
    // request. Sent as UTC: the offset the client wrote has been resolved.
    ...(drive &&
      request.departure !== "now" && {
        departureTime: new Date(request.departure).toISOString(),
      }),
  };
}

/**
 * Only what the app reads. Per-leg polylines are asked for when there is more
 * than one leg, because the map styles a leg you have driven differently from
 * one ahead; with a single leg the route's own polyline is that leg.
 */
export function fieldMask(request: RouteRequest): string {
  return [
    "routes.distanceMeters",
    "routes.duration",
    "routes.staticDuration",
    "routes.polyline.encodedPolyline",
    "routes.legs.distanceMeters",
    "routes.legs.duration",
    "routes.legs.staticDuration",
    ...(request.stops.length > 2
      ? ["routes.legs.polyline.encodedPolyline"]
      : []),
    "routes.description",
    "routes.routeLabels",
    "routes.warnings",
    "fallbackInfo",
  ].join(",");
}

/** "3844s" or "12.5s" to seconds. Anything else is a broken answer. */
export function parseDuration(value: unknown): number {
  const match = typeof value === "string" && /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) throw new Error("bad duration");
  return Number(match[1]);
}

type RawLeg = {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  polyline?: { encodedPolyline?: string };
};
type RawRoute = RawLeg & {
  legs?: RawLeg[];
  description?: string;
  routeLabels?: string[];
  warnings?: string[];
};
type RawResponse = {
  routes?: RawRoute[];
  fallbackInfo?: { routingMode?: string; routeCalculationReason?: string };
};

// Protocol buffers leave zero values out of JSON: a route between two points
// on the same spot has no distanceMeters. Absent distance is zero.
const metres = (v: unknown): number => {
  if (v === undefined) return 0;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error("bad distance");
  }
  return v;
};
const staticSeconds = (v: unknown): number | null =>
  v === undefined ? null : parseDuration(v);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

function path(encoded: string | undefined): LonLat[] {
  if (!encoded) throw new Error("no polyline");
  const decoded = decodePolyline(encoded);
  if (decoded.length < 2) throw new Error("polyline too short");
  return decoded;
}

/**
 * The provider's answer as the app's. Throws on a shape it does not
 * recognise; the caller reports that as malformed rather than drawing a guess.
 */
export function normalize(
  body: RawResponse,
  request: RouteRequest,
  now: Date,
): RouteAnswer | "no-route" {
  if (!body.routes?.length) return "no-route";
  const expectedLegs = request.stops.length - 1;

  const routes = body.routes.map((raw): RouteAlternative => {
    if (raw.legs?.length !== expectedLegs) {
      throw new Error("wrong number of legs");
    }
    const outline = path(raw.polyline?.encodedPolyline);
    const legs = raw.legs.map(
      (leg): RouteLeg => ({
        distanceM: metres(leg.distanceMeters),
        durationS: parseDuration(leg.duration),
        staticDurationS: staticSeconds(leg.staticDuration),
        // One leg is the whole route; several each carry their own geometry.
        path:
          expectedLegs === 1 ? outline : path(leg.polyline?.encodedPolyline),
      }),
    );
    return {
      distanceM: metres(raw.distanceMeters),
      durationS: parseDuration(raw.duration),
      staticDurationS: staticSeconds(raw.staticDuration),
      path: outline,
      legs,
      description: raw.description ?? null,
      labels: strings(raw.routeLabels),
      warnings: strings(raw.warnings),
    };
  });

  const drive = request.mode === "drive";
  return {
    routes,
    mode: request.mode,
    traffic: !drive
      ? "none"
      : request.departure === "now"
        ? "live"
        : "predicted",
    computedAt: now.toISOString(),
    fallback: body.fallbackInfo
      ? {
          mode: body.fallbackInfo.routingMode ?? "unknown",
          reason: body.fallbackInfo.routeCalculationReason ?? "unknown",
        }
      : null,
  };
}

type ErrorBody = {
  error?: { status?: string; details?: { reason?: string }[] };
};

/** Which failure an HTTP error is. Credentials and quota are not retried by the caller. */
export function classify(status: number, body: ErrorBody): RouteFailure {
  const google = body.error?.status;
  const reasons = body.error?.details?.map((d) => d.reason) ?? [];
  if (status === 401 || status === 403 || google === "PERMISSION_DENIED") {
    return "auth";
  }
  if (
    reasons.includes("API_KEY_INVALID") ||
    reasons.includes("API_KEY_SERVICE_BLOCKED")
  ) {
    return "auth";
  }
  if (status === 429 || google === "RESOURCE_EXHAUSTED") return "quota";
  // A waypoint Google cannot place is a question about the trip, not a fault.
  if (status === 404 || google === "NOT_FOUND") return "no-route";
  if (status === 400 || google === "INVALID_ARGUMENT") return "invalid";
  return "upstream";
}

export function googleRoutes(options: {
  apiKey: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RoutesProvider {
  const { apiKey, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  return {
    configured: Boolean(apiKey),
    async compute(request, now): Promise<RouteOutcome> {
      if (!apiKey) return { ok: false, reason: "not-configured" };

      let res: Response;
      try {
        res = await send(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask(request),
          },
          body: JSON.stringify(buildBody(request)),
          signal: AbortSignal.timeout(timeoutMs),
          // Route geometry is Google's content; it is not kept.
          cache: "no-store",
        });
      } catch (error) {
        const timedOut =
          error instanceof Error && error.name === "TimeoutError";
        return { ok: false, reason: timedOut ? "timeout" : "upstream" };
      }

      if (!res.ok) {
        // Only the status and code are read; the body is not logged or passed on.
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        return { ok: false, reason: classify(res.status, body) };
      }

      try {
        const answer = normalize(
          (await res.json()) as RawResponse,
          request,
          now,
        );
        return answer === "no-route"
          ? { ok: false, reason: "no-route" }
          : { ok: true, answer };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
