"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteAnswer, RouteMode } from "../../domain/route/contract.ts";
import { routeSignature } from "../../domain/route/plan.ts";
import { apiClient } from "../../lib/hono-client.ts";
import {
  type ClientFailure,
  type ClientOutcome,
  createRouteClient,
} from "./route-client.ts";
import type { MapStop } from "./trip-map.tsx";

// The road between a trip's stops, for a screen that draws it. One request when
// the stops (or the mode) change, and when the traveller presses refresh —
// nothing else. Panning, zooming, hover, a panel opening or a parent
// re-rendering with the same stops all leave the key unchanged, so none of
// them can reach the server.

/** Rapid edits (adding, then reordering a stop) become one request. */
const SETTLE_MS = 400;
const REQUEST_TIMEOUT_MS = 20_000;

const client = createRouteClient(async (request): Promise<ClientOutcome> => {
  try {
    const res = await apiClient.api.route.$post(
      { json: request },
      { init: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } },
    );
    // The session check answers before the route handler does.
    if ((res.status as number) === 401)
      return { ok: false, reason: "signed-out" };
    return (await res.json()) as ClientOutcome;
  } catch {
    return { ok: false, reason: "offline" };
  }
});

export type TripRoute =
  /** Nothing is being asked: fewer than two stops, or routing is switched off. */
  | { status: "off" }
  /** Asked for these stops; nothing to show yet, and nothing left over from others. */
  | { status: "loading" }
  | {
      status: "ready";
      answer: RouteAnswer;
      /** Asked again for the same stops: the answer shown is the previous one. */
      refreshing: boolean;
    }
  | {
      status: "failed";
      reason: ClientFailure;
      /** Which stop, when the failure is one stop's. */
      stop?: number;
    };

export type TripRouteOptions = {
  /** False for a picture, or where the traveller cannot ask (signed out). */
  enabled?: boolean;
  mode?: RouteMode;
  /** Ask for other ways between two stops. */
  alternatives?: boolean;
};

export function useTripRoute(
  stops: readonly MapStop[],
  {
    enabled = true,
    mode = "drive",
    alternatives = false,
  }: TripRouteOptions = {},
) {
  const active = enabled && stops.length >= 2;
  const key = routeSignature({
    mode,
    alternatives,
    stops: stops.map((s) => ({ lonLat: s.lonLat })),
  });

  const [result, setResult] = useState<{
    key: string;
    outcome: ClientOutcome;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState<{ of: string; index: number } | null>(null);

  const latest = useRef({ stops, mode, alternatives });
  latest.current = { stops, mode, alternatives };
  const refreshAsked = useRef(false);
  const settled = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the stops; `tick` is the refresh button
  useEffect(() => {
    if (!active) return;
    let live = true;
    const refresh = refreshAsked.current;
    refreshAsked.current = false;
    // The first ask goes at once; edits after it wait for the dust to settle.
    const timer = setTimeout(
      () => {
        settled.current = true;
        const ask = latest.current;
        client
          .route({
            stops: ask.stops.map((s) => ({ lonLat: s.lonLat })),
            mode: ask.mode,
            alternatives: ask.alternatives,
            refresh,
          })
          .then((outcome) => {
            // A newer question has replaced this one: its answer is not wanted.
            if (!live) return;
            setResult({ key, outcome });
            setRefreshing(false);
          });
      },
      settled.current && !refresh ? SETTLE_MS : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, active, tick]);

  let route: TripRoute = { status: "off" };
  if (active) {
    // An answer for other stops is not this trip's route, however recent.
    const current = result?.key === key ? result.outcome : null;
    route = !current
      ? { status: "loading" }
      : current.ok
        ? { status: "ready", answer: current.answer, refreshing }
        : { status: "failed", reason: current.reason, stop: current.stop };
  }

  const computedAt = route.status === "ready" ? route.answer.computedAt : "";
  const identity = `${key}|${computedAt}`;
  const selected = pick?.of === identity ? pick.index : 0;

  return {
    route,
    /** Which of the answer's routes is chosen; the first unless picked. */
    selected,
    select: (index: number) => setPick({ of: identity, index }),
    /** Ask again for the same stops, on the traveller's word. */
    refresh: () => {
      refreshAsked.current = true;
      setRefreshing(true);
      setTick((t) => t + 1);
    },
  };
}
