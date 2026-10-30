import type { LonLat } from "../geo.ts";
import type { Category } from "./categories.ts";

// Finding a sight the catalogue does not hold yet, by name, as the traveller
// types it: "Bodbe" on /new, when the catalogue has only Bodbe Hotel. The
// provider lives in src/infra; this is the port it implements and the one rule
// that decides what may become a catalogue place — what kind of place it is.

/** One line of the provider's list, before anything is fetched about it. */
export type SightSuggestion = {
  externalId: string;
  name: string;
  /** Where it is, in the provider's words ("Sighnaghi, Georgia"). */
  where: string;
};

/** What the catalogue keeps of a sight it takes from the provider. */
export type SightDetails = {
  externalId: string;
  name: string;
  lonLat: LonLat;
  /** The provider's own types, most specific first. */
  types: readonly string[];
};

export type SightLookup<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not-configured" | "unavailable" };

export type SightFinder = {
  provider: string;
  configured: boolean;
  /** Names like the query, in Georgia. `session` ties a search to the pick it ends in. */
  suggest(
    query: string,
    session: string,
  ): Promise<SightLookup<SightSuggestion[]>>;
  details(
    externalId: string,
    session: string,
  ): Promise<SightLookup<SightDetails | null>>;
};

/**
 * Google's place types, most specific first, as the catalogue's categories.
 * Only what a day can be spent at: a hotel, a shop or a petrol station is not
 * a sight, and is not taken.
 */
const GOOGLE_TYPES: readonly [string, Category][] = [
  ["church", "christian_place_of_worship"],
  ["mosque", "muslim_place_of_worship"],
  ["synagogue", "jewish_place_of_worship"],
  ["castle", "castle"],
  ["fortress", "fort"],
  ["monument", "monument"],
  ["sculpture", "sculpture_statue"],
  ["historical_landmark", "historic_site"],
  ["historical_place", "historic_site"],
  ["cultural_landmark", "historic_site"],
  ["museum", "museum"],
  ["art_gallery", "art_gallery"],
  ["performing_arts_theater", "theatre_venue"],
  ["zoo", "zoo"],
  ["amusement_park", "amusement_park"],
  ["plaza", "public_plaza"],
  ["national_park", "national_park"],
  ["botanical_garden", "garden"],
  ["garden", "garden"],
  ["hiking_area", "recreational_trail_or_path"],
  ["beach", "beach"],
  ["park", "park"],
  ["winery", "winery"],
  ["brewery", "brewery"],
  ["market", "farmers_market"],
  ["restaurant", "restaurant"],
  ["cafe", "cafe"],
  ["coffee_shop", "coffee_shop"],
  ["bar", "bar"],
  // Last: a provider's "attraction" or "place of worship" says less than any
  // of the above, but still says it is somewhere to go.
  ["place_of_worship", "christian_place_of_worship"],
  ["tourist_attraction", "historic_site"],
];

const NOT_A_SIGHT = new Set([
  "lodging",
  "hotel",
  "gas_station",
  "store",
  "shopping_mall",
]);

/** The catalogue category for a provider's types, or null when it is not a sight. */
export function sightCategory(types: readonly string[]): Category | null {
  if (types.some((t) => NOT_A_SIGHT.has(t))) return null;
  for (const [type, category] of GOOGLE_TYPES) {
    if (types.includes(type)) return category;
  }
  return null;
}
