import { haversineM, type LonLat } from "../geo.ts";
import { categoryGroup, isAllowedCategory } from "./categories.ts";
import { romanise } from "./georgian.ts";

// What a traveller is shown about a place that the catalogue does not hold:
// how it is rated, what people wrote, what it looks like. It comes from a
// third party (src/infra) and is never stored — the provider's terms allow an
// identifier to be kept and nothing else — so everything here is a value read
// fresh for one screen. Nothing in this file names a provider.

export const reviewTripTypes = [
  "business",
  "couples",
  "family",
  "friends",
  "solo",
] as const;
export type ReviewTripType = (typeof reviewTripTypes)[number];

export type Review = {
  id: string;
  /** 1 to 5. */
  rating: number;
  /** The provider's own rating graphic: its brand, drawn as it supplies it. */
  ratingIcon: string | null;
  title: string | null;
  text: string;
  publishedAt: string;
  tripType: ReviewTripType | null;
  author: string | null;
  /** The review where it was written, for the link every review carries. */
  url: string | null;
};

export type Photo = {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string | null;
  /** The venue's own picture, or a traveller's. */
  by: "venue" | "traveller" | null;
};

export type Enrichment = {
  /** Who said all this: always shown with it. */
  source: { name: string; url: string };
  rating: { value: number; count: number; icon: string | null } | null;
  /** "#4 of 120 Restaurants in Tbilisi". */
  ranking: string | null;
  /** The place's page at the source; every figure links to it. */
  url: string;
  reviews: Review[];
  photos: Photo[];
};

/** Why there is nothing to show. Each is a different thing to say. */
export type EnrichFailure =
  | "not-configured"
  | "no-match"
  | "rate-limited"
  | "quota"
  | "auth"
  | "timeout"
  | "upstream"
  | "malformed";

export type EnrichOutcome =
  | { ok: true; enrichment: Enrichment }
  | { ok: false; reason: EnrichFailure };

/** What is known of a catalogue place when looking for it elsewhere. */
export type PlaceIdentity = {
  name: string;
  nameKa: string | null;
  lonLat: LonLat;
  category: string;
};

/** A place the provider holds, as a search returns it. */
export type Candidate = {
  id: string;
  /** Every name it goes by, whatever the language. */
  names: string[];
  lonLat: LonLat | null;
};

export type SearchOutcome =
  | { ok: true; candidates: Candidate[] }
  | { ok: false; reason: EnrichFailure };

/**
 * The provider behind the port. The three calls are separate because they are
 * paid for, and limited, separately: finding a place is rare and slow, reading
 * one is the common case, and permission to read it is asked for once.
 */
export type PlaceEnricher = {
  /** What the provider is called in storage: the key its identifiers are kept under. */
  provider: string;
  configured: boolean;
  /** Places that might be this one. Few: each result returned is billed. */
  search(place: PlaceIdentity): Promise<SearchOutcome>;
  /** Make a found place readable. Idempotent. */
  allow(
    id: string,
  ): Promise<{ ok: true } | { ok: false; reason: EnrichFailure }>;
  /** The place as it is now. Never kept by the caller. */
  read(id: string): Promise<EnrichOutcome>;
};

// Matching ------------------------------------------------------------------

/** Words that say what a place is, not which one: "Cafe Leila" and "Leila". */
const KIND_WORDS = new Set([
  "the",
  "restaurant",
  "cafe",
  "bar",
  "hotel",
  "guesthouse",
  "guest",
  "house",
  "hostel",
  "museum",
  "church",
  "monastery",
  "winery",
  "wine",
  "cellar",
]);

/** A name reduced to what identifies it: Latin, lower case, no accents or kinds. */
export function nameKey(name: string): string {
  return romanise(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !KIND_WORDS.has(w))
    .join(" ");
}

const bigrams = (s: string) => {
  const flat = s.replace(/ /g, "");
  const out = new Map<string, number>();
  for (let i = 0; i < flat.length - 1; i++) {
    const pair = flat.slice(i, i + 2);
    out.set(pair, (out.get(pair) ?? 0) + 1);
  }
  return out;
};

/** 0 to 1: how much of two names' spelling they share (Dice over letter pairs). */
export function nameSimilarity(a: string, b: string): number {
  const [ka, kb] = [nameKey(a), nameKey(b)];
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  // "Fabrika" for "Fabrika Tbilisi": one name is the other with words added.
  // Strong, but short of identical, so it cannot excuse a far-off pin.
  const [ta, tb] = [ka.split(" "), kb.split(" ")];
  const [few, many] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (few.every((w) => many.includes(w)) && few.some((w) => w.length >= 4)) {
    return 0.85;
  }
  const [ba, bb] = [bigrams(ka), bigrams(kb)];
  let shared = 0;
  let total = 0;
  for (const [pair, n] of ba) shared += Math.min(n, bb.get(pair) ?? 0);
  for (const n of ba.values()) total += n;
  for (const n of bb.values()) total += n;
  return total === 0 ? 0 : (2 * shared) / total;
}

/** Closer than this and a name only has to be alike. */
const NEAR_M = 250;
/** Further than this is another place, whatever it is called. */
const FAR_M = 1_500;
/** Alike enough when it is right there. */
const NEAR_NAME = 0.6;
/** Alike enough to forgive a mislocated pin: the name must all but agree. */
const FAR_NAME = 0.9;

export type Match = { id: string; confidence: number };

/**
 * Which candidate, if any, is this place. A wrong match is worse than none —
 * it puts someone else's reviews on a stop — so both the name and the location
 * must agree: a name that is alike and a pin that is close, or a name that is
 * all but identical and a pin that is not far off. A candidate without
 * coordinates cannot be placed and is never matched.
 */
export function chooseMatch(
  place: PlaceIdentity,
  candidates: readonly Candidate[],
): Match | null {
  const ours = [place.name, place.nameKa].filter((n): n is string =>
    Boolean(n),
  );
  let best: (Match & { score: number }) | null = null;

  for (const candidate of candidates) {
    if (!candidate.lonLat) continue;
    const metres = haversineM(place.lonLat, candidate.lonLat);
    if (metres > FAR_M) continue;
    const similarity = Math.max(
      0,
      ...ours.flatMap((o) => candidate.names.map((n) => nameSimilarity(o, n))),
    );
    const agrees =
      (metres <= NEAR_M && similarity >= NEAR_NAME) || similarity >= FAR_NAME;
    if (!agrees) continue;
    // Name first; distance only breaks a tie between two alike names.
    const score = similarity - metres / (FAR_M * 100);
    if (!best || score > best.score) {
      best = { id: candidate.id, confidence: similarity, score };
    }
  }
  return best && { id: best.id, confidence: best.confidence };
}

/** How the provider files a catalogue category: what to ask the search for. */
export type SearchCategory = "restaurant" | "attraction" | "hotel";

export function searchCategory(category: string): SearchCategory {
  const group = isAllowedCategory(category) ? categoryGroup[category] : null;
  return group === "food"
    ? "restaurant"
    : group === "lodging"
      ? "hotel"
      : "attraction";
}
