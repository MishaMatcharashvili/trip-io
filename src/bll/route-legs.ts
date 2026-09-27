import { type LonLat, simplifyLine } from "../domain/geo.ts";
import {
  type RoadRouter,
  roadLegs,
  straightLegs,
} from "../domain/trip/legs.ts";
import { osrm } from "../infra/osrm.ts";

// The route a map draws between its stops: road legs where the router
// answers, straight ones where it does not. A whole trip is asked for in
// chunks — public routers cap the waypoints in one request — and each chunk
// falls back on its own, so one bad stop costs one stretch of road, not the
// whole map.

/** Waypoints per request; chunks share their boundary stop. */
const CHUNK = 25;
/** Metres a simplified line may stray from the road: invisible at any zoom a trip is read at. */
const SIMPLIFY_M = 8;

export async function routeLegs(
  points: readonly LonLat[],
  router: RoadRouter = osrm,
): Promise<LonLat[][]> {
  if (points.length < 2) return [];
  const chunks: LonLat[][] = [];
  for (let i = 0; i < points.length - 1; i += CHUNK - 1) {
    chunks.push(points.slice(i, i + CHUNK));
  }
  const routed = await Promise.all(
    chunks.map(async (chunk) => {
      const route = await router.route(chunk);
      return route
        ? roadLegs(chunk, route).map((leg) => simplifyLine(leg, SIMPLIFY_M))
        : straightLegs(chunk);
    }),
  );
  return routed.flat();
}
