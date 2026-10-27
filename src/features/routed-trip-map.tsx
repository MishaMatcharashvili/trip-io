"use client";

import type { ComponentProps } from "react";
import { type MapStop, TripMap } from "@/ui/map/trip-map";
import { useTripRoute } from "@/ui/map/use-trip-route";

/**
 * A map that draws the road between its stops and nothing more: for a card, a
 * thumbnail or a strip, where there is no room to explain a route that is
 * missing. Where the road matters (the trip's map screen), the screen uses
 * `useTripRoute` itself and says what happened. When the road cannot be had —
 * signed out, unavailable, still coming — the stops are drawn alone, never
 * joined by a line that looks like a road.
 */
export function RoutedTripMap({
  routing,
  road,
  ...props
}: Omit<ComponentProps<typeof TripMap>, "route"> & {
  /** False where asking would be pointless or a waste (an example trip). */
  routing?: { enabled?: boolean };
  /**
   * The places the road runs through, when that is not the pins: a whole
   * trip's road goes between the places its days are spent in, while the pins
   * are every stop. Drawn in full, as the plan.
   */
  road?: readonly MapStop[];
}) {
  const { route } = useTripRoute(road ?? props.stops, {
    enabled: routing?.enabled ?? true,
  });
  return (
    <TripMap
      {...props}
      route={
        route.status === "ready"
          ? {
              legs: route.answer.routes[0].legs.map((l) => l.path),
              done: road
                ? route.answer.routes[0].legs.map(() => true)
                : undefined,
              stale: route.refreshing,
            }
          : null
      }
    />
  );
}
