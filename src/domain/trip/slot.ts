import type { LonLat } from "../geo.ts";
import type { TravelEstimator } from "./travel.ts";
import { IMPLICIT_LEG_MAX_MIN, LEG_BUFFER_MIN } from "./validate.ts";

// Where in a day a new stop goes, and for how long, before the traveller has
// said. The add-a-stop panel used to start every stop at 12:00 for an hour,
// wherever the day was and whatever the place: a museum and a coffee the same
// length, both on top of whatever was already at noon. This is the sensible
// first guess — after the last stop, the way there allowed for, for as long as
// that kind of place usually takes — which the traveller then changes. It
// suggests; the validator decides.

const MIN = 60_000;
const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** The morning's opening for a day with nothing in it yet. */
const DAY_OPENS = "10:00";

/**
 * How long people usually spend, by Overture category, in minutes on a five
 * step. A starting point, not a fact: opening hours and the pace of the trip
 * are the validator's to apply.
 */
const TYPICAL: Record<string, number> = {
  // Eating and drinking
  restaurant: 75,
  casual_eatery: 45,
  cafe: 40,
  coffee_shop: 30,
  bar: 60,
  winery: 90,
  brewery: 60,
  distillery: 60,
  farmers_market: 45,
  // Places of worship and heritage: short, unless it is a site
  christian_place_of_worship: 30,
  muslim_place_of_worship: 20,
  jewish_place_of_worship: 20,
  historic_site: 60,
  monument: 20,
  sculpture_statue: 15,
  castle: 75,
  fort: 60,
  cultural_center: 60,
  // Museums and shows
  museum: 90,
  art_gallery: 60,
  theatre_venue: 120,
  music_venue: 120,
  performing_arts_venue: 120,
  zoo: 150,
  amusement_park: 180,
  public_plaza: 30,
  // Outdoors
  national_park: 180,
  nature_reserve: 150,
  park: 60,
  garden: 60,
  recreational_trail_or_path: 150,
  mountain: 180,
  lake: 45,
  waterfall: 45,
  hot_springs: 120,
  beach: 90,
  // Getting about
  airport: 60,
  train_station: 30,
};

/** What nothing is known about: an hour. */
const DEFAULT_MINUTES = 60;

export function typicalMinutes(category: string): number {
  return TYPICAL[category] ?? DEFAULT_MINUTES;
}

export type SlotInput = {
  /** YYYY-MM-DD, Tbilisi. */
  day: string;
  /** The last stop of the day so far: when it ends and where. */
  last: { endsAt: number; at: LonLat | null } | null;
  place: { lonLat: LonLat | null; category: string };
};

export type Slot = {
  startsAt: string;
  durationMin: number;
  /**
   * The place is further from the last stop than an implicit leg allows: it
   * needs a drive of this many minutes between them, which a later start does
   * not provide. The start given allows for it, as a hint, but it is for the
   * traveller to add the drive.
   */
  needsTransferMin?: number;
};

export function suggestSlot(input: SlotInput, travel: TravelEstimator): Slot {
  const { day, last, place } = input;
  const durationMin = typicalMinutes(place.category);

  if (!last) {
    return {
      startsAt: new Date(
        Date.parse(`${day}T${DAY_OPENS}:00+04:00`),
      ).toISOString(),
      durationMin,
    };
  }

  const need =
    last.at && place.lonLat ? travel.minutes(last.at, place.lonLat) : 0;
  const tooFar = need > IMPLICIT_LEG_MAX_MIN;
  // The way and the buffer, as the validator asks for them; a long drive is
  // allowed for in full, so the hint is at least not impossible.
  const gap = need === 0 ? 0 : need + (tooFar ? 0 : LEG_BUFFER_MIN);
  const startsAt = new Date(roundUp5(last.endsAt + gap * MIN)).toISOString();

  return tooFar
    ? { startsAt, durationMin, needsTransferMin: need }
    : { startsAt, durationMin };
}
