import type { LonLat } from "../../domain/geo.ts";

// What the route line says, apart from where it goes: which stretches are
// behind the traveller, which one they are on, which are still to come, and
// where the whole of it starts and finishes. Pure, so it is tested without a
// map; overlays.ts draws the answer.

/** Covered (green), the one being driven (periwinkle), not yet covered (grey). */
export type LegState = "done" | "current" | "ahead";

/**
 * One state per leg. The first leg not yet covered is the current one, once the
 * trip is underway (something is done or the traveller is at a stop); before
 * that nothing is current and the whole road is still ahead.
 */
export function legStates(
  done: readonly boolean[],
  underway: boolean,
): LegState[] {
  const next = done.indexOf(false);
  return done.map((covered, i) =>
    covered ? "done" : underway && i === next ? "current" : "ahead",
  );
}

export type RouteEnd = {
  kind: "start" | "finish" | "round";
  at: LonLat;
  /** What the map says beside it. */
  label: string;
};

/** Closer than this, the start and the finish are one place: a round trip. */
const SAME_PLACE_M = 150;

const metres = ([lng1, lat1]: LonLat, [lng2, lat2]: LonLat) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  return Math.hypot(dLat, dLng) * 6_371_000;
};

/**
 * The two ends of the road: where its first leg begins and its last ends. A
 * road that comes back to where it began is one "Start · Finish", not two
 * labels on top of each other.
 */
export function routeEnds(legs: readonly (readonly LonLat[])[]): RouteEnd[] {
  const first = legs.find((l) => l.length > 0)?.[0];
  const last = legs.findLast((l) => l.length > 0)?.at(-1);
  if (!first || !last) return [];
  if (metres(first, last) < SAME_PLACE_M) {
    return [{ kind: "round", at: first, label: "Start · Finish" }];
  }
  return [
    { kind: "start", at: first, label: "Start" },
    { kind: "finish", at: last, label: "Finish" },
  ];
}
