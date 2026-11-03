import type { LonLat } from "../geo.ts";
import type { Destination } from "./destinations.ts";
import type { EnrichFailure } from "./enrichment.ts";
import type { Ranking, RatedKind, RatedListing } from "./ratings.ts";

// Tripadvisor's lists for a destination: its ranked restaurants and things to
// do, read in depth (a hundred and fifty restaurants, where Google's town
// search returns twenty) and kept in tripadvisor_listing, for trip generation
// to rate the catalogue by (src/bll/ratings.ts). The port is the domain's; the
// scraper that reads the lists is in src/infra, and nothing here names it.

/** One place on a destination's list. */
export type Listing = {
  /** Tripadvisor's location id. */
  id: string;
  kind: RatedKind;
  /** The destination's slug (destinations.ts). */
  destination: string;
  name: string;
  lonLat: LonLat;
  rating: number | null;
  count: number;
  ranking: Ranking | null;
  url: string | null;
};

/** One list to read: a destination, a kind, how deep. */
export type ListingQuery = {
  destination: string;
  /** What the destination is called, to look it up by. */
  name: string;
  kind: RatedKind;
  max: number;
};

/**
 * How far down each list is read: lists come best first, and the tail stops
 * mattering long before the end (a city's 500th restaurant is no one's dinner).
 * Hotels are not read: Google's twenty per town are enough to choose a bed.
 */
export const LISTING_DEPTH: Record<RatedKind, number> = {
  restaurant: 150,
  attraction: 80,
  hotel: 0,
};

/** The lists a destination is read for. */
export function listingQueries(
  d: Pick<Destination, "slug" | "name">,
): ListingQuery[] {
  return (Object.entries(LISTING_DEPTH) as [RatedKind, number][])
    .filter(([, max]) => max > 0)
    .map(([kind, max]) => ({ destination: d.slug, name: d.name, kind, max }));
}

export function parseRanking(text: string | null | undefined): Ranking | null {
  const m = text?.match(/#\s*([\d,]+)\s+of\s+([\d,]+)/i);
  if (!m) return null;
  const [rank, of] = [m[1], m[2]].map((s) => Number(s.replace(/,/g, "")));
  return rank >= 1 && of >= rank ? { rank, of } : null;
}

/**
 * A listing as a rated listing, the shape the catalogue is rated by. One with
 * no rating yet has nothing to say and is left out.
 */
export function asRated(l: Listing): RatedListing | null {
  if (l.rating === null) return null;
  return {
    id: l.id,
    names: [l.name],
    lonLat: l.lonLat,
    rating: {
      value: l.rating,
      count: l.count,
      ...(l.ranking ? { rank: l.ranking } : {}),
    },
  };
}

export type ListingStart =
  | { ok: true; runId: string }
  | { ok: false; reason: EnrichFailure };

export type ListingCollect =
  | { ok: true; state: "running" }
  | { ok: true; state: "done"; listings: Listing[] }
  | { ok: false; reason: EnrichFailure };

/**
 * A source of destination lists. Reading one takes minutes, so it is started
 * and then collected: the queue checks back rather than holding a request open.
 */
export type ListingSource = {
  configured: boolean;
  start(query: ListingQuery): Promise<ListingStart>;
  collect(runId: string, query: ListingQuery): Promise<ListingCollect>;
};
