// The programmatic gate's category allowlist (docs/implementation-plan.md §6):
// Overture `basic_category` values a traveller could put on an itinerary or be
// rerouted to. Everything else — services, offices, most shops, clinics — is
// dropped at extraction, however well-attested.
//
// The group matters twice: duplicates are only merged within a group (a hotel
// and its restaurant share a name and a building but are different nodes), and
// the curation queue filters by it.

export const categoryGroups = {
  food: [
    "restaurant",
    "casual_eatery",
    "cafe",
    "coffee_shop",
    "bar",
    "winery",
    "brewery",
    "distillery",
    "farmers_market",
  ],
  lodging: [
    "hotel",
    "lodging",
    "private_lodging",
    "bed_and_breakfast",
    "inn",
    "resort",
    "campground",
  ],
  heritage: [
    "historic_site",
    "christian_place_of_worship",
    "muslim_place_of_worship",
    "jewish_place_of_worship",
    "monument",
    "castle",
    "fort",
    "sculpture_statue",
    "cultural_center",
  ],
  culture: [
    "museum",
    "art_gallery",
    "theatre_venue",
    "music_venue",
    "performing_arts_venue",
    "zoo",
    "amusement_park",
    "public_plaza",
  ],
  nature: [
    "national_park",
    "nature_reserve",
    "park",
    "garden",
    "recreational_trail_or_path",
    "mountain",
    "lake",
    "waterfall",
    "hot_springs",
    "beach",
  ],
  transport: ["airport", "train_station"],
} as const satisfies Record<string, readonly string[]>;

export type CategoryGroup = keyof typeof categoryGroups;
export type Category = (typeof categoryGroups)[CategoryGroup][number];

export const categoryGroup = Object.fromEntries(
  Object.entries(categoryGroups).flatMap(([group, categories]) =>
    categories.map((category) => [category, group]),
  ),
) as Record<Category, CategoryGroup>;

export const allowedCategories = Object.keys(categoryGroup) as Category[];

export function isAllowedCategory(value: string): value is Category {
  return Object.hasOwn(categoryGroup, value);
}
