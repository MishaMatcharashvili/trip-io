// Where in a municipality a news event is. An article says "Rustaveli Avenue,
// Tbilisi", and the event would otherwise be the whole of Tbilisi — every stop
// in the city matched against a street closure and left to the judge to wave
// away. This narrows it where it can be done without inventing anything: the
// street is looked up among the places the catalogue already has, in that
// municipality, and the footprint is where they cluster.
//
// It is deliberately conservative. A footprint that is wrong silently drops a
// stop that should have been told, which is worse than the wide net, so it is
// used only when enough places agree and is otherwise not used at all.

/** Words that make a name a street or a landmark rather than a district. */
const ROAD_WORDS =
  /\b(avenue|ave|street|st|square|sq|bridge|embankment|boulevard|blvd|road|rd|alley|lane|quay|market|bazaar|park|garden|station)\b/i;

/** Suffixes stripped to leave the name itself. */
const STRIP_SUFFIX =
  /\b(avenue|ave|street|st|square|sq|bridge|embankment|boulevard|blvd|road|rd|alley|lane|quay)\b\.?/gi;

/**
 * The searchable name in a place string, or null if it names no street. The
 * municipality is cut off ("Rustaveli Avenue, Tbilisi" → "rustaveli"), and a
 * name of fewer than five letters is refused: "Old" matches half a city.
 */
export function streetName(
  place: string,
  regionNames: readonly string[],
): string | null {
  if (!ROAD_WORDS.test(place)) return null;
  let text = place.toLowerCase();
  for (const name of regionNames) {
    text = text.replace(new RegExp(`\\b${name.toLowerCase()}\\b`, "g"), " ");
  }
  const name = text
    .replace(STRIP_SUFFIX, " ")
    .replace(
      /\b(the|of|in|near|on|at|and|municipality|city|district|old)\b/g,
      " ",
    )
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.length >= 5 ? name : null;
}

/** Places that must agree before a footprint is believed. */
export const MIN_PLACES = 5;
/** A street is at least this long as far as a stop beside it is concerned. */
export const MIN_RADIUS_M = 800;
/** Past this the footprint says too little to be worth the risk of being wrong. */
export const MAX_RADIUS_M = 4_000;

export type Footprint = {
  lon: number;
  lat: number;
  radiusM: number;
  /** How many catalogue places the footprint was drawn from. */
  places: number;
  /** The name that was searched for. */
  street: string;
};

/**
 * From the cluster the data layer found to a footprint, or null if it should
 * not be used: too few places, or so spread out that "the street" is really the
 * name of several.
 */
export function toFootprint(
  street: string,
  cluster: { lon: number; lat: number; spreadM: number; places: number } | null,
): Footprint | null {
  if (!cluster || cluster.places < MIN_PLACES) return null;
  if (cluster.spreadM > MAX_RADIUS_M) return null;
  return {
    lon: cluster.lon,
    lat: cluster.lat,
    radiusM: Math.max(MIN_RADIUS_M, Math.round(cluster.spreadM)),
    places: cluster.places,
    street,
  };
}
