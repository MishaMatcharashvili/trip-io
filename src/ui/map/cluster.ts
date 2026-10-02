import Supercluster from "supercluster";

// The stops' clustering index, always ready to be asked. Supercluster builds
// its trees in `load`, and asking before that throws ("Cannot read properties
// of undefined (reading 'range')"), so an index with no stops is still loaded —
// a map can be shown before it has any, and Explore can match none.

/** Stops closer than this, in pixels, merge into a count. */
export const CLUSTER_RADIUS_PX = 40;
/** From this Mapbox zoom on every stop carries its name (512 px tiles). */
export const LABEL_ZOOM = 10;
/** Above this Mapbox zoom every stop stands alone. */
export const CLUSTER_MAX_ZOOM = 13;

export type ClusterPoint = { id: string };
export type StopPoint = { id: string; lonLat: readonly [number, number] };

export function clusterIndex(stops: readonly StopPoint[]) {
  const index = new Supercluster<ClusterPoint>({
    radius: CLUSTER_RADIUS_PX,
    maxZoom: CLUSTER_MAX_ZOOM,
  });
  index.load(
    stops.map((s) => ({
      type: "Feature" as const,
      properties: { id: s.id },
      geometry: { type: "Point" as const, coordinates: [...s.lonLat] },
    })),
  );
  return index;
}

export type Weighted = { id: string; weight?: number };

/**
 * Which of a group of stops stands for it. The one that matters most: the
 * heaviest, and the earliest of equals so the same group always picks the same
 * one and its pin does not jump between renders.
 */
export function leader<T extends Weighted>(members: readonly T[]): T {
  let best = members[0];
  for (const member of members) {
    if ((member.weight ?? 0) > (best.weight ?? 0)) best = member;
  }
  return best;
}
