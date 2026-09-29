import { z } from "zod";
import type { LonLat } from "../geo.ts";

// What a route request and a route answer look like, in the app's own terms.
// Nothing here names a provider: the adapter in src/infra turns a
// RouteRequest into whatever its service wants, and turns the reply back into
// a RouteOutcome. The AI and the itinerary logic can ask for a route, and read
// one, without knowing who calculated it.

/** Intermediate waypoints the provider takes; origin and destination come on top. */
export const MAX_INTERMEDIATES = 25;
export const MAX_STOPS = MAX_INTERMEDIATES + 2;

/** The modes a route can be asked for. Anything else is refused, never turned into driving. */
export const routeModes = ["drive", "walk"] as const;
export type RouteMode = (typeof routeModes)[number];

/**
 * Where a route may be asked for: Georgia and the borders a trip crosses. A
 * malformed pair, or one from another continent, is refused before anything
 * billable happens.
 */
const REGION = { west: 38, south: 39.5, east: 48.5, north: 44 };

const inRegion = ([lon, lat]: LonLat) =>
  lon >= REGION.west &&
  lon <= REGION.east &&
  lat >= REGION.south &&
  lat <= REGION.north;

const lonLat = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine(inRegion, { message: "outside the region trips are planned in" });

export const routeStop = z.object({
  lonLat,
  /**
   * Google's own identifier for the place, when the app holds one: it lets the
   * provider pick the right entrance. Not the app's place id.
   */
  googlePlaceId: z.string().min(1).max(300).optional(),
});
export type RouteStop = z.infer<typeof routeStop>;

export const routeRequest = z
  .object({
    mode: z.enum(routeModes).default("drive"),
    /** In visiting order. The order is the traveller's and is never changed. */
    stops: z.array(routeStop).min(2).max(MAX_STOPS),
    /** "now" is the moment the request is made; otherwise a future instant. */
    departure: z
      .union([z.literal("now"), z.iso.datetime({ offset: true })])
      .default("now"),
    /** Only meaningful between two stops: a provider offers none past a waypoint. */
    alternatives: z.boolean().default(false),
  })
  .refine((r) => !r.alternatives || r.stops.length === 2, {
    message: "alternatives are only offered between two stops",
    path: ["alternatives"],
  })
  .refine((r) => r.departure === "now" || r.mode === "drive", {
    message: "a departure time only applies to driving",
    path: ["departure"],
  });
export type RouteRequest = z.infer<typeof routeRequest>;
export type RouteRequestInput = z.input<typeof routeRequest>;

/** A scheduled departure that has already passed cannot be asked for. */
export function departureInPast(request: RouteRequest, now: Date): boolean {
  return request.departure !== "now" && new Date(request.departure) <= now;
}

/** One stretch between two consecutive stops. */
export type RouteLeg = {
  distanceM: number;
  /** With traffic, for a driving route asked at its departure time. */
  durationS: number;
  /** The road's own length of time, without traffic. Absent for walking. */
  staticDurationS: number | null;
  /** The road itself, as returned. Never a line drawn between the stops. */
  path: LonLat[];
};

export type RouteAlternative = {
  distanceM: number;
  durationS: number;
  staticDurationS: number | null;
  /** The whole route's outline, for drawing and framing. */
  path: LonLat[];
  legs: RouteLeg[];
  /** How the provider names this route ("via E60"), when it does. */
  description: string | null;
  labels: string[];
  /** The provider's own cautions, verbatim: toll roads, restricted areas, etc. */
  warnings: string[];
};

export type RouteAnswer = {
  /** The provider's preferred route first. */
  routes: RouteAlternative[];
  mode: RouteMode;
  /**
   * Whether the durations reflect traffic. A route asked for a departure time
   * later than now is a prediction, not live traffic.
   */
  traffic: "live" | "predicted" | "none";
  /** When the request was made, so a stale estimate can say how stale. */
  computedAt: string;
  /**
   * Set when the provider could not use the routing it was asked for and fell
   * back to another — its durations are then less reliable.
   */
  fallback: { mode: string; reason: string } | null;
};

/** Why no route came back, in words the screen can act on. */
export const routeFailures = [
  "invalid",
  "not-configured",
  "rate-limited",
  "no-route",
  "quota",
  "auth",
  "timeout",
  "upstream",
  "malformed",
] as const;
export type RouteFailure = (typeof routeFailures)[number];

export type RouteOutcome =
  | { ok: true; answer: RouteAnswer }
  | { ok: false; reason: RouteFailure };

/** The port a routing provider implements (src/infra/google-routes.ts). */
export type RoutesProvider = {
  /** Whether a credential is present; without one no request is attempted. */
  readonly configured: boolean;
  compute(request: RouteRequest, now: Date): Promise<RouteOutcome>;
};
