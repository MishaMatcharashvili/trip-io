import type { LonLat } from "../geo.ts";

// Sunrise equation (NOAA's simplified form, as on Wikipedia's "Sunrise
// equation"). Good to a minute or two at Georgia's latitudes, which is well
// inside the slack any itinerary rule needs.

/** Sun altitude at civil twilight: below this it's dark enough to matter. */
export const CIVIL = -6;
/** Altitude at sunrise/sunset, allowing for refraction and the sun's disc. */
export const HORIZON = -0.833;

const J2000 = 2_451_545;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2_440_587.5;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const toDate = (jd: number) => new Date((jd - UNIX_EPOCH_JD) * DAY_MS);

export type SunWindow = { rise: Date; set: Date };

/**
 * When the sun crosses `altitude` on a calendar day (YYYY-MM-DD) at a point.
 * The day is the local solar day, so for anywhere east of Greenwich — all of
 * Georgia — it matches the local calendar date. Returns null during polar day
 * or night.
 */
export function sunWindow(
  day: string,
  [lon, lat]: LonLat,
  altitude = CIVIL,
): SunWindow | null {
  const noonUtcJd = Date.parse(`${day}T12:00:00Z`) / DAY_MS + UNIX_EPOCH_JD;
  const n = Math.round(noonUtcJd - J2000 + 0.0008);
  const meanNoon = n - lon / 360;

  const M = (357.5291 + 0.98560028 * meanNoon) % 360;
  const C =
    1.9148 * Math.sin(rad(M)) +
    0.02 * Math.sin(rad(2 * M)) +
    0.0003 * Math.sin(rad(3 * M));
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit =
    J2000 +
    meanNoon +
    0.0053 * Math.sin(rad(M)) -
    0.0069 * Math.sin(rad(2 * lambda));

  const sinDecl = Math.sin(rad(lambda)) * Math.sin(rad(23.4397));
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const cosHour =
    (Math.sin(rad(altitude)) - Math.sin(rad(lat)) * sinDecl) /
    (Math.cos(rad(lat)) * cosDecl);
  if (cosHour < -1 || cosHour > 1) return null;

  const halfDay = deg(Math.acos(cosHour)) / 360;
  return { rise: toDate(transit - halfDay), set: toDate(transit + halfDay) };
}
