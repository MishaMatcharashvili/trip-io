import { haversineM, type LonLat } from "../geo.ts";

// The route a day's stops make on the map, as legs: leg i runs from stop i to
// stop i + 1. Legs rather than one line because a leg you have driven and one
// still ahead are drawn differently, and because road geometry arrives per
// request, not per stop.

/** One road-following line through the points, and how long each leg is. */
export type RoadRoute = { line: LonLat[]; legsM: number[] };

/**
 * A router that drives between points. Null when it has no answer — the map
 * falls back to straight legs rather than showing no route at all.
 */
export type RoadRouter = {
  route(points: readonly LonLat[]): Promise<RoadRoute | null>;
};

/** Straight legs between consecutive points: the route before a router answers. */
export function straightLegs(points: readonly LonLat[]): LonLat[][] {
  return points.slice(1).map((to, i) => [points[i], to]);
}

/**
 * Cuts one line into legs of the given lengths. The lengths are the router's
 * and the line is its overview, so their totals differ by a little; each cut
 * lands at the same fraction of the line as it does of the router's total,
 * interpolated between vertices. Measuring along the line, rather than
 * snapping each stop to its nearest vertex, is what keeps an out-and-back
 * drive — up a valley and down it again — from cutting at the wrong pass.
 */
export function splitLine(
  line: readonly LonLat[],
  legsM: readonly number[],
): LonLat[][] {
  if (legsM.length === 0) return [];
  if (line.length < 2) return legsM.map(() => [...line]);

  const along: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    along.push(along[i - 1] + haversineM(line[i - 1], line[i]));
  }
  const length = along[along.length - 1];
  const total = legsM.reduce((s, m) => s + m, 0);
  const scale = total > 0 ? length / total : 0;

  const pointAt = (d: number): [LonLat, number] => {
    let i = 1;
    while (i < line.length - 1 && along[i] < d) i++;
    const span = along[i] - along[i - 1];
    const t =
      span > 0 ? Math.min(1, Math.max(0, (d - along[i - 1]) / span)) : 0;
    const [a, b] = [line[i - 1], line[i]];
    return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i];
  };

  const legs: LonLat[][] = [];
  let start: LonLat = line[0];
  let from = 1;
  let cursor = 0;
  legsM.forEach((m, k) => {
    cursor += m * scale;
    const last = k === legsM.length - 1;
    const [end, to] = last
      ? [line[line.length - 1], line.length]
      : pointAt(cursor);
    const leg = [start, ...line.slice(from, last ? line.length - 1 : to), end];
    legs.push(
      leg.filter(
        (p, j) => j === 0 || p[0] !== leg[j - 1][0] || p[1] !== leg[j - 1][1],
      ),
    );
    start = end;
    from = to;
  });
  return legs;
}

/**
 * Road legs between the points, each tied back to its stops at both ends:
 * a router snaps a stop to the nearest road, and a guesthouse up a lane
 * should still meet its line.
 */
export function roadLegs(
  points: readonly LonLat[],
  route: RoadRoute,
): LonLat[][] {
  return splitLine(route.line, route.legsM).map((leg, i) => [
    points[i],
    ...leg,
    points[i + 1],
  ]);
}
