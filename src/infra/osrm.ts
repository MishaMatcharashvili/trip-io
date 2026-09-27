import type { LonLat } from "../domain/geo.ts";
import type { RoadRoute, RoadRouter } from "../domain/trip/legs.ts";

// The map's road router: OSRM's car profile, for the lines drawn between a
// trip's stops. The FOSSGIS instance by default — the one the corridor build
// already uses — or OSRM_URL for a self-hosted server with the same paths.
//
// The FOSSGIS policy asks for low volume and an identifying User-Agent. A route
// here is one request per page of stops, and Next's data cache keeps each
// answer for a day, so a traveller opening the same day twice costs nothing.

const DEFAULT_URL = "https://routing.openstreetmap.de";
const USER_AGENT =
  "trip.io/1 (+https://github.com/MishaMatcharashvili/trip-io)";
/** A map without road lines is fine; a page waiting on a router is not. */
const TIMEOUT_MS = 4_000;
const DAY_S = 86_400;

type Response = {
  code: string;
  routes?: {
    geometry: { coordinates: LonLat[] };
    legs: { distance: number }[];
  }[];
};

/** Six decimals is ~10 cm: the same stop always makes the same cached URL. */
const coord = ([lon, lat]: LonLat) => `${lon.toFixed(6)},${lat.toFixed(6)}`;

export const osrm: RoadRouter = {
  async route(points): Promise<RoadRoute | null> {
    if (points.length < 2) return null;
    const base = process.env.OSRM_URL ?? DEFAULT_URL;
    const url = `${base}/routed-car/route/v1/driving/${points.map(coord).join(";")}?overview=full&geometries=geojson&steps=false`;
    // `next` is Next's data-cache option. It is typed here, not through Next's
    // global augmentation, because this file is also compiled for the Expo
    // app's API types, which know nothing of Next; outside Next it is ignored.
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: DAY_S },
    };
    try {
      const res = await fetch(url, init);
      if (!res.ok) return null;
      const body = (await res.json()) as Response;
      const route = body.code === "Ok" ? body.routes?.[0] : undefined;
      if (!route || route.legs.length !== points.length - 1) return null;
      return {
        line: route.geometry.coordinates,
        legsM: route.legs.map((l) => l.distance),
      };
    } catch {
      return null;
    }
  },
};
