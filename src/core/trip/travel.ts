import { haversineM, type LonLat } from "../geo.ts";

// How long it takes to get from one point to another, as the validator sees it.
// An interface so the estimate can improve without the validator changing: v1
// below works from straight-line distance; v2 (once there are enough curated
// places) looks up an OSRM table matrix and falls back to this.

export type TravelEstimator = {
  /** Door-to-door minutes, 0 when the two points are the same place. */
  minutes(from: LonLat, to: LonLat): number;
};

/** Closer than this is the same place: breakfast at the guesthouse you slept in. */
const SAME_PLACE_M = 150;
/** Walking or a taxi across town. */
const LOCAL_KMH = 20;
/** Everything else, averaged over Georgia's roads (including mountain ones). */
const ROAD_KMH = 55;
const LOCAL_LIMIT_M = 5_000;
/** Roads aren't straight. */
const DETOUR = 1.4;
const MIN_LEG = 5;

// Checked against real drives: Tbilisi–Stepantsminda gives ~2h50 (real 2h45–3h);
// Gudauri–Stepantsminda ~37 min (real ~40). It overestimates the flat Kakheti
// highway, which is the safe direction for a validator.
export const straightLineTravel: TravelEstimator = {
  minutes(from, to) {
    const m = haversineM(from, to);
    if (m < SAME_PLACE_M) return 0;
    const kmh = m < LOCAL_LIMIT_M ? LOCAL_KMH : ROAD_KMH;
    return Math.max(MIN_LEG, Math.ceil(((m * DETOUR) / 1000 / kmh) * 60));
  },
};
