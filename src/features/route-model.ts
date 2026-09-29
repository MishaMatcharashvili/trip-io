import type { RouteAnswer } from "../domain/route/contract.ts";
import type { TripRoute } from "../ui/map/use-trip-route.ts";
import { ago, duration } from "./trip-model.ts";

// What the route panel says, decided apart from how it looks. Every state has
// its own words: a missing road is never dressed up as a slow one, and an
// estimate says what kind of estimate it is and how old.

export type RouteView =
  | { kind: "empty"; text: string }
  | { kind: "loading"; text: string }
  | {
      kind: "ready";
      /** "22 min", the selected route's time on the road, with traffic. */
      time: string;
      distance: string;
      /** "Usually 19 min", when the road's usual time differs from now's. */
      typical: string | null;
      /** What sort of estimate this is, and when it was made. */
      basis: string;
      /** What the time leaves out: the visits are the app's own, not the drive. */
      scope: string;
      updating: boolean;
      /** Stops that had to be moved a long way to reach a road. */
      warnings: string[];
      /** The roads the route takes ("via E60"), when the provider names them. */
      via: string | null;
      /** One per stretch between stops; empty when there is only one. */
      legs: { key: string; label: string; time: string; distance: string }[];
      /** One per route the provider offered; empty when there is only one. */
      choices: { index: number; label: string; selected: boolean }[];
    }
  | {
      kind: "failed";
      text: string;
      canRetry: boolean;
    };

/** A stop this far from any road is worth telling the traveller about. */
const FAR_FROM_ROAD_M = 500;

const kilometres = (m: number) =>
  m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
const minutes = (s: number) => duration(Math.max(1, Math.round(s / 60)));

// Mapbox's traffic covers the roads it has data for, not every road, and a
// later stretch of a long day is still the road as it is now. The wording says
// what was done and when, and does not say what is happening on the road.
function basisOf(answer: RouteAnswer, now: Date): string {
  const age = ago(answer.computedAt, now);
  switch (answer.traffic) {
    case "live":
      return `Calculated ${age} with traffic data where Mapbox has it; not every road is observed`;
    case "predicted":
      return `Calculated ${age} for the departure time from usual traffic, not live conditions`;
    case "none":
      return `Walking time, calculated ${age}`;
  }
}

/** "412 m" or "3.4 km". */
const away = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

const failures: Record<
  Extract<TripRoute, { status: "failed" }>["reason"],
  { text: string; canRetry: boolean }
> = {
  "signed-out": {
    text: "Sign in to see the road between your stops.",
    canRetry: false,
  },
  offline: {
    text: "Couldn't reach the route service. Check your connection.",
    canRetry: true,
  },
  "no-route": { text: "No road found between these stops.", canRetry: false },
  "unroutable-stop": {
    text: "A stop has no road near enough to route to.",
    canRetry: false,
  },
  invalid: { text: "These stops can't be routed.", canRetry: false },
  "rate-limited": {
    text: "Too many route requests. Try again in a minute.",
    canRetry: true,
  },
  quota: {
    text: "Routes are paused for today: the usage limit is reached.",
    canRetry: false,
  },
  "not-configured": {
    text: "Routes aren't set up on this server yet.",
    canRetry: false,
  },
  auth: {
    text: "The route service isn't available right now.",
    canRetry: true,
  },
  timeout: {
    text: "The route service took too long. Try again.",
    canRetry: true,
  },
  upstream: {
    text: "The route service had a problem. Try again.",
    canRetry: true,
  },
  malformed: {
    text: "The route service sent something unreadable. Try again.",
    canRetry: true,
  },
};

export function describeRoute(
  route: TripRoute,
  selected: number,
  stops: readonly { label: string }[],
  now: Date,
): RouteView {
  switch (route.status) {
    case "off":
      return {
        kind: "empty",
        text:
          stops.length < 2
            ? "Add a second stop to see the road."
            : "The road isn't shown here.",
      };
    case "loading":
      return { kind: "loading", text: "Finding the road…" };
    case "failed": {
      const failure = failures[route.reason];
      const named = route.stop !== undefined ? stops[route.stop] : undefined;
      return {
        kind: "failed",
        ...failure,
        // Which stop, when the provider could say: the traveller can move it.
        text:
          route.reason === "unroutable-stop" && named
            ? `${named.label} has no road near enough to route to. Move the stop, or replace it.`
            : failure.text,
      };
    }
    case "ready": {
      const { answer } = route;
      const chosen = answer.routes[selected] ?? answer.routes[0];
      const usual = chosen.typicalDurationS;
      return {
        kind: "ready",
        time: minutes(chosen.durationS),
        distance: kilometres(chosen.distanceM),
        // Only worth saying when it is a different number.
        typical:
          usual !== null && minutes(usual) !== minutes(chosen.durationS)
            ? `Usually ${minutes(usual)}`
            : null,
        basis: basisOf(answer, now),
        scope:
          answer.mode === "walk"
            ? "Walking time only. Time at stops isn't included."
            : "Driving time only. Time at stops isn't included.",
        updating: route.refreshing,
        warnings: answer.stops.flatMap((snap, i) =>
          snap.distanceM > FAR_FROM_ROAD_M
            ? [
                `${stops[i]?.label ?? `Stop ${i + 1}`} is ${away(snap.distanceM)} from the nearest road; the route ends at the road.`,
              ]
            : [],
        ),
        via: chosen.description ? `via ${chosen.description}` : null,
        legs:
          chosen.legs.length > 1
            ? chosen.legs.map((l, i) => ({
                key: `${i}`,
                label: `${stops[i]?.label ?? `Stop ${i + 1}`} to ${stops[i + 1]?.label ?? `stop ${i + 2}`}`,
                time: minutes(l.durationS),
                distance: kilometres(l.distanceM),
              }))
            : [],
        choices:
          answer.routes.length > 1
            ? answer.routes.map((r, index) => ({
                index,
                label: `${r.description ? `via ${r.description}` : `Route ${index + 1}`} · ${minutes(r.durationS)} · ${kilometres(r.distanceM)}`,
                selected: r === chosen,
              }))
            : [],
      };
    }
  }
}
