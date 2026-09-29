import type { LonLat } from "../geo.ts";

// Google's encoded polyline format: a path as a run of signed, delta-coded
// integers, five bits to a character. The one place the provider's
// latitude-first order meets the app's longitude-first LonLat, so the swap is
// made once, here, and named.

/**
 * Decodes an encoded polyline into app coordinates (longitude first). Google
 * writes latitude first; this is the only function that reads that order.
 * Throws on anything that is not a well-formed polyline, so a corrupt answer
 * is an error rather than a line drawn through the wrong places.
 */
export function decodePolyline(encoded: string, precision = 5): LonLat[] {
  const factor = 10 ** precision;
  const path: LonLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) {
        throw new Error("polyline ends inside a value");
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63)
        throw new Error("polyline has a bad character");
      result += (byte & 0x1f) * 2 ** shift;
      shift += 5;
    } while (byte >= 0x20);
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  };

  while (index < encoded.length) {
    lat += next();
    if (index >= encoded.length)
      throw new Error("polyline ends after a latitude");
    lon += next();
    path.push([lon / factor, lat / factor]);
  }
  return path;
}

/** The inverse of {@link decodePolyline}: for fixtures and tests. */
export function encodePolyline(path: readonly LonLat[], precision = 5): string {
  const factor = 10 ** precision;
  let out = "";
  let lat = 0;
  let lon = 0;

  const put = (delta: number) => {
    let value = delta < 0 ? -delta * 2 - 1 : delta * 2;
    while (value >= 0x20) {
      out += String.fromCharCode(((value % 0x20) | 0x20) + 63);
      value = Math.floor(value / 0x20);
    }
    out += String.fromCharCode(value + 63);
  };

  for (const [x, y] of path) {
    const nextLat = Math.round(y * factor);
    const nextLon = Math.round(x * factor);
    put(nextLat - lat);
    put(nextLon - lon);
    lat = nextLat;
    lon = nextLon;
  }
  return out;
}
