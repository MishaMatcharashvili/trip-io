import { countUse } from "../dal/usage.ts";
import {
  departureInPast,
  type RouteOutcome,
  type RouteRequest,
  type RoutesProvider,
} from "../domain/route/contract.ts";

// Route a set of stops. The one door to the routing provider: the HTTP handler,
// and anything else that needs a real road (an itinerary check, the AI's tools),
// comes through here, so the rules on spending sit in one place.
//
// What it guards, in the order it guards it: a request that cannot succeed is
// refused before it costs anything; the traveller's own rate; identical
// requests already in flight share one upstream call; and the day's total.

export type RouteLimits = {
  userPerMinute: number;
  userPerDay: number;
  /**
   * Provider calls, everyone together, per minute. Mapbox refuses an account
   * past 300 a minute; this stops well short, so one busy minute cannot lock
   * every traveller out.
   */
  globalPerMinute: number;
  /** Provider calls, everyone together, per UTC day. */
  globalPerDay: number;
};

export const defaultLimits: RouteLimits = {
  userPerMinute: 20,
  userPerDay: 200,
  globalPerMinute: 200,
  globalPerDay: 1_000,
};

/** What is recorded about a call. No coordinates, no itinerary, no response. */
export type RouteLog = {
  category: "routes.compute";
  mode: string;
  waypoints: number;
  result: "ok" | "shared" | RouteOutcomeReason;
  latencyMs: number;
};
type RouteOutcomeReason = Extract<RouteOutcome, { ok: false }>["reason"];

export type RouteDeps = {
  provider: RoutesProvider;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  limits: RouteLimits;
  log: (entry: RouteLog) => void;
};

const inflight = new Map<string, Promise<RouteOutcome>>();

// The provider is the caller's to build: it holds a credential, and reading
// the environment is the server layer's job, not a use case's.
const defaults = (): Omit<RouteDeps, "provider"> => ({
  count: countUse,
  now: () => new Date(),
  limits: defaultLimits,
  log: (entry) => console.info(JSON.stringify(entry)),
});

const MINUTE = 60;
const DAY = 86_400;

export async function computeRoute(
  request: RouteRequest,
  userId: string,
  overrides: Pick<RouteDeps, "provider"> & Partial<RouteDeps>,
): Promise<RouteOutcome> {
  const deps = { ...defaults(), ...overrides };
  const started = Date.now();
  const now = deps.now();
  const finish = (
    outcome: RouteOutcome,
    result: RouteLog["result"] = outcome.ok ? "ok" : outcome.reason,
  ) => {
    deps.log({
      category: "routes.compute",
      mode: request.mode,
      waypoints: request.stops.length,
      result,
      latencyMs: Date.now() - started,
    });
    return outcome;
  };

  if (departureInPast(request, now))
    return finish({ ok: false, reason: "invalid" });
  // Without a credential there is nothing to spend, so nothing is counted.
  if (!deps.provider.configured) {
    return finish({ ok: false, reason: "not-configured" });
  }

  const { limits } = deps;
  if (
    (await deps.count(`routes:user:${userId}:m`, MINUTE, now)) >
      limits.userPerMinute ||
    (await deps.count(`routes:user:${userId}:d`, DAY, now)) > limits.userPerDay
  ) {
    return finish({ ok: false, reason: "rate-limited" });
  }

  // The same stops asked for twice at once are one question. Not a cache: the
  // entry goes as soon as the answer is back.
  const key = JSON.stringify(request);
  const shared = inflight.get(key);
  if (shared) return finish(await shared, "shared");

  const call = (async (): Promise<RouteOutcome> => {
    // Counted when a call is actually made, so a shared answer costs nothing.
    if (
      (await deps.count("routes:all:m", MINUTE, now)) >
        limits.globalPerMinute ||
      (await deps.count("routes:all", DAY, now)) > limits.globalPerDay
    ) {
      return { ok: false, reason: "quota" };
    }
    return deps.provider.compute(request, now);
  })();
  inflight.set(key, call);
  try {
    return finish(await call);
  } finally {
    inflight.delete(key);
  }
}
