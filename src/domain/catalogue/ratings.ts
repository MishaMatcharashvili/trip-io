import type { LonLat } from "../geo.ts";
import {
  chooseMatch,
  type EnrichFailure,
  FAR_M,
  type Candidate as Listing,
  NEAR_M,
  type PlaceIdentity,
} from "./enrichment.ts";

// What travellers think of the places a trip may be planned from, as a review
// site ranks them: the restaurants, hotels and sights in a town that most
// people rate, and how well. The catalogue says what exists; this says which
// of it is worth the evening. Used to choose among catalogue places, never to
// add one: a place the catalogue does not hold is not planned, however well
// it is rated.

export const ratedKinds = ["restaurant", "hotel", "attraction"] as const;
export type RatedKind = (typeof ratedKinds)[number];

/** Which catalogue groups each kind is matched against. */
export const ratedGroups = {
  restaurant: ["food"],
  hotel: ["lodging"],
  attraction: ["heritage", "culture", "nature"],
} as const satisfies Record<RatedKind, readonly string[]>;

/**
 * How far from the provider's pin a catalogue place is looked for. A
 * restaurant is a door, and two pins for it agree to within a street; a
 * fortress or a park is large, and is pinned wherever the source chose.
 */
export const matchRadiusM: Record<RatedKind, number> = {
  restaurant: NEAR_M,
  hotel: NEAR_M,
  attraction: FAR_M,
};

export type Rating = { value: number; count: number };

/** A place as the provider lists it, with what travellers gave it. */
export type RatedListing = Listing & { rating: Rating };

export type RatedOutcome =
  | { ok: true; places: RatedListing[] }
  | { ok: false; reason: EnrichFailure };

export type RatedQuery = {
  kind: RatedKind;
  /** The town or region, by its name: "Kutaisi". */
  in: string;
  near: LonLat;
};

/** The provider behind the port (src/infra/google-places.ts). */
export type RatingSource = {
  provider: string;
  configured: boolean;
  /** The places of one kind in one town that travellers rate, as the provider ranks them. */
  popular(query: RatedQuery): Promise<RatedOutcome>;
};

/** Somewhere to keep a town's list for a while; like KeptContent, a store that is down costs a miss. */
export type KeptRatings = {
  get(key: string): Promise<RatedOutcome | null>;
  set(key: string, outcome: RatedOutcome, ttlSeconds: number): Promise<void>;
};

/** Fewer reviews than this, and a rating says little about a place. */
export const MIN_REVIEWS = 30;

/** What an unknown place is assumed to be rated, and by how many, before its own reviews count. */
const PRIOR = { value: 4.0, count: 50 };

/**
 * A rating, pulled towards the middle when few have given it: 5.0 from six
 * people is not better than 4.7 from three thousand.
 */
export function ratingScore({ value, count }: Rating): number {
  return (value * count + PRIOR.value * PRIOR.count) / (count + PRIOR.count);
}

/**
 * Which catalogue places the provider's listings are, by the same test the
 * place panel uses (chooseMatch): the name and the pin must agree. A listing
 * matches one place at most, the one whose name agrees best, so a hotel and
 * its restaurant do not both take the hotel's rating.
 */
export function rateCatalogue(
  catalogue: readonly (PlaceIdentity & { id: string })[],
  listings: readonly RatedListing[],
): Map<string, Rating> {
  const byListing = new Map<string, { placeId: string; confidence: number }>();
  for (const place of catalogue) {
    const match = chooseMatch(place, listings);
    if (!match) continue;
    const known = byListing.get(match.id);
    if (!known || match.confidence > known.confidence) {
      byListing.set(match.id, {
        placeId: place.id,
        confidence: match.confidence,
      });
    }
  }
  const ratings = new Map<string, Rating>();
  for (const listing of listings) {
    const matched = byListing.get(listing.id);
    if (matched && listing.rating.count >= MIN_REVIEWS) {
      ratings.set(matched.placeId, listing.rating);
    }
  }
  return ratings;
}
