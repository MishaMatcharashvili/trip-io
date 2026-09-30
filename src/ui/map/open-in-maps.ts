import type { LonLat } from "../../domain/geo.ts";
import type { RouteMode } from "../../domain/route/contract.ts";

// "Open in Google Maps": hands the stops to the Google Maps app or site for
// turn-by-turn navigation, which TripG does not build itself. Google's link
// format takes at most nine waypoints between the origin and destination.

const MAX_WAYPOINTS = 9;

const point = ([lon, lat]: LonLat) => `${lat},${lon}`;

/**
 * A link that opens these stops, in order, as directions. Null when there are
 * fewer than two, or more than the link can carry — a link with some stops
 * quietly missing would navigate somewhere other than the plan.
 */
export function googleMapsDirectionsUrl(
  stops: readonly LonLat[],
  mode: RouteMode = "drive",
): string | null {
  if (stops.length < 2 || stops.length > MAX_WAYPOINTS + 2) return null;
  const params = new URLSearchParams({
    api: "1",
    origin: point(stops[0]),
    destination: point(stops[stops.length - 1]),
    travelmode: mode === "drive" ? "driving" : "walking",
  });
  if (stops.length > 2) {
    params.set("waypoints", stops.slice(1, -1).map(point).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
