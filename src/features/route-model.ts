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
      /** "22 min", the selected route's time on the road. */
      time: string;
      distance: string;
      /** What sort of estimate this is, and when it was made. */
      basis: string;
      updating: boolean;
      warnings: string[];
      /** Set when the provider could not use the routing it was asked for. */
      fallback: string | null;
      /** The route's own name ("via Kakheti Hwy"), when it has one. */
      via: string | null;
      /** One per route the provider offered; empty when there is only one. */
      choices: { index: number; label: string; selected: boolean }[];
    }
  | { kind: "failed"; text: string; canRetry: boolean };

const kilometres = (m: number) =>
  m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
const minutes = (s: number) => duration(Math.max(1, Math.round(s / 60)));

function basisOf(answer: RouteAnswer, now: Date): string {
  const age = ago(answer.computedAt, now);
  switch (answer.traffic) {
    case "live":
      // Later legs of a long day are still estimates of the road as it is now.
      return `Estimate with current traffic, ${age}`;
    case "predicted":
      return `Predicted for the departure time, not live traffic, ${age}`;
    case "none":
      return `Walking time, ${age}`;
  }
}

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
  stopCount: number,
  now: Date,
): RouteView {
  switch (route.status) {
    case "off":
      return {
        kind: "empty",
        text:
          stopCount < 2
            ? "Add a second stop to see the road."
            : "The road isn't shown here.",
      };
    case "loading":
      return { kind: "loading", text: "Finding the road…" };
    case "failed":
      return { kind: "failed", ...failures[route.reason] };
    case "ready": {
      const { answer } = route;
      const chosen = answer.routes[selected] ?? answer.routes[0];
      return {
        kind: "ready",
        time: minutes(chosen.durationS),
        distance: kilometres(chosen.distanceM),
        basis: basisOf(answer, now),
        updating: route.refreshing,
        warnings: chosen.warnings,
        fallback: answer.fallback
          ? "Traffic couldn't be used for this route, so the time may be off."
          : null,
        via: chosen.description ? `via ${chosen.description}` : null,
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
