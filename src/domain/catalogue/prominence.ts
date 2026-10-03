// How much a place stands out, as one number from 0 to 100, for deciding which
// of several to show when the map has room for one. Not a rating — nobody has
// said it is good — but how likely a traveller is to be looking for it: a
// castle over a corner cafe, a place somebody checked over one nobody has, one
// the sources agree exists over one they barely mention.
//
// Used where a count would otherwise stand in for the places themselves: a
// cluster of forty pins is shown as the one that matters and "+39", not as "40".

const TIER = { curated: 35, verified: 18, raw: 0 } as const;

// What a visitor travels for, then what they stop at, then what they pass.
const LANDMARK = new Set([
  "castle",
  "fort",
  "historic_site",
  "monument",
  "national_park",
  "nature_reserve",
  "mountain",
  "lake",
  "waterfall",
  "hot_springs",
  "museum",
  "christian_place_of_worship",
  "cultural_center",
]);
const WORTH_A_STOP = new Set([
  "winery",
  "distillery",
  "brewery",
  "park",
  "garden",
  "art_gallery",
  "recreational_trail_or_path",
  "beach",
  "zoo",
  "amusement_park",
  "public_plaza",
  "sculpture_statue",
  "theatre_venue",
  "music_venue",
  "performing_arts_venue",
  "muslim_place_of_worship",
  "jewish_place_of_worship",
  "farmers_market",
]);

const KIND = { landmark: 35, stop: 18, other: 6 } as const;

export type ProminenceInput = {
  category: string;
  tier: keyof typeof TIER;
  /** How sure the source is that it exists, 0 to 1. */
  confidence: number | null;
  /** How many websites of its own are listed. */
  websites: number;
};

export function prominence(p: ProminenceInput): number {
  const kind = LANDMARK.has(p.category)
    ? KIND.landmark
    : WORTH_A_STOP.has(p.category)
      ? KIND.stop
      : KIND.other;
  const sure = Math.max(0, Math.min(1, p.confidence ?? 0.5)) * 20;
  const site = p.websites > 0 ? 10 : 0;
  return Math.max(
    0,
    Math.min(100, Math.round(TIER[p.tier] + kind + sure + site)),
  );
}
