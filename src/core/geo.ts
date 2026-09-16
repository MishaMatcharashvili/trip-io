export type LonLat = [lon: number, lat: number];

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Douglas–Peucker in metres. Projects to a local equirectangular plane first,
 * which is accurate to well under a metre at corridor scale (a few hundred km
 * at Georgia's latitude) — plenty for a line that gets a 1.5–2 km buffer.
 */
export function simplifyLine(points: LonLat[], toleranceM: number): LonLat[] {
  if (points.length <= 2) return points;

  const lat0 = rad(points[0][1]);
  const xy = points.map(([lon, lat]) => [
    rad(lon) * Math.cos(lat0) * EARTH_RADIUS_M,
    rad(lat) * EARTH_RADIUS_M,
  ]);

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const [ax, ay] = xy[start];
    const [bx, by] = xy[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let maxDist = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = xy[i];
      // Distance to the segment, not the infinite line: a route that doubles
      // back (hairpins) has points beyond the segment's endpoints.
      const t =
        lenSq === 0
          ? 0
          : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceM) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Reads the "lat, lon" pair Google Maps copies on right-click ("41.6938, 44.8015").
 * Order is Google's, lat first. Anything outside Georgia's bbox is rejected, which
 * catches most swapped pairs too (a longitude above 43.65 can't be a latitude).
 */
export function parseLatLon(text: string): LonLat | null {
  const match = text
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return inGeorgiaBbox([lon, lat]) ? [lon, lat] : null;
}

export const GEORGIA_BBOX = {
  west: 39.9,
  south: 41.0,
  east: 46.8,
  north: 43.65,
};

export function inGeorgiaBbox([lon, lat]: LonLat): boolean {
  return (
    lon >= GEORGIA_BBOX.west &&
    lon <= GEORGIA_BBOX.east &&
    lat >= GEORGIA_BBOX.south &&
    lat <= GEORGIA_BBOX.north
  );
}
