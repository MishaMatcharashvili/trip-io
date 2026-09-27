import {
  Bath,
  BedDouble,
  Beer,
  Car,
  Castle,
  Church,
  Coffee,
  Drama,
  FerrisWheel,
  Flower2,
  Footprints,
  Landmark,
  type LucideIcon,
  MapPin,
  Martini,
  Mountain,
  Music,
  Palette,
  PawPrint,
  Plane,
  ShoppingBasket,
  Tent,
  TrainFront,
  Trees,
  Umbrella,
  Utensils,
  Waves,
  Wine,
} from "lucide-react";

// The glyph inside a stop's pin when the place has no logo of its own: what
// kind of place it is, at a glance, in the pin's own colour — the icon never
// adds a colour of its own.

/** Overture categories (src/domain/catalogue/categories.ts), by what they look like. */
const byCategory: Record<string, LucideIcon> = {
  restaurant: Utensils,
  casual_eatery: Utensils,
  cafe: Coffee,
  coffee_shop: Coffee,
  bar: Martini,
  winery: Wine,
  brewery: Beer,
  distillery: Martini,
  farmers_market: ShoppingBasket,

  hotel: BedDouble,
  lodging: BedDouble,
  private_lodging: BedDouble,
  bed_and_breakfast: BedDouble,
  inn: BedDouble,
  resort: BedDouble,
  campground: Tent,

  historic_site: Landmark,
  christian_place_of_worship: Church,
  muslim_place_of_worship: Landmark,
  jewish_place_of_worship: Landmark,
  monument: Landmark,
  castle: Castle,
  fort: Castle,
  sculpture_statue: Landmark,
  cultural_center: Palette,

  museum: Landmark,
  art_gallery: Palette,
  theatre_venue: Drama,
  music_venue: Music,
  performing_arts_venue: Drama,
  zoo: PawPrint,
  amusement_park: FerrisWheel,
  public_plaza: MapPin,

  national_park: Trees,
  nature_reserve: Trees,
  park: Trees,
  garden: Flower2,
  recreational_trail_or_path: Footprints,
  mountain: Mountain,
  lake: Waves,
  waterfall: Waves,
  hot_springs: Bath,
  beach: Umbrella,

  airport: Plane,
  train_station: TrainFront,
};

/** A stop without a catalogue place: what the node itself is. */
const byKind: Record<string, LucideIcon> = {
  meal: Utensils,
  stay: BedDouble,
  transfer: Car,
  visit: MapPin,
};

export function stopIcon(category?: string, kind?: string): LucideIcon {
  return (category && byCategory[category]) || (kind && byKind[kind]) || MapPin;
}
