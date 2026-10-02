import { haversineM, type LonLat } from "../geo.ts";
import type { Photo, PlaceIdentity } from "./enrichment.ts";
import { nameKey } from "./enrichment.ts";

// Which of a set of freely licensed photographs are of this place.
//
// A search by location answers "what is near here", not "what is this", and the
// difference is the whole problem: around Narikala's own coordinates the nearest
// photographs are of the mosque beside it. Shown under Narikala they would be
// wrong, and a wrong photograph is worse than none. So a photograph is the
// place's only if it says so — its title or description names it — and, when it
// says where it was taken, that is near. What no photograph names, the place
// has none of.

/** Further than this and a name match is another place of the same name. */
const NEAR_M = 1_500;

/** Not photographs of a place, whatever they are named. */
const NOT_A_PHOTO =
  /\b(map|logo|flag|coat of arms|diagram|scheme|site plan|floor plan|icon|poster)\b/i;

export type PhotoCandidate = {
  photo: Photo;
  /** What the file says it is: its title, its object name, its description. */
  labels: string[];
  /** Where it was taken, when it says. */
  lonLat: LonLat | null;
};

/**
 * Words that appear in the title of half the photographs taken anywhere in the
 * country, and so identify nothing: where it is, and what sort of thing a street
 * or a district is. "Tbilisi" is in "Hilton Garden Inn Tbilisi" and also in every
 * photograph of a staircase in Tbilisi.
 */
const NOT_A_NAME = new Set([
  "tbilisi",
  "tiflis",
  "kutaisi",
  "batumi",
  "georgia",
  "georgian",
  "sakartvelo",
  "street",
  "avenue",
  "district",
  "square",
  "town",
  "city",
  "central",
  "center",
  "centre",
  "road",
  "old",
  "new",
  "national",
]);

/** The parts of a name that identify it: long enough to mean something, and not a place's address. */
function distinctive(name: string): string[] {
  return nameKey(name)
    .split(" ")
    .filter((word) => word.length >= 4 && !NOT_A_NAME.has(word));
}

export function selectPhotos(
  place: PlaceIdentity,
  candidates: readonly PhotoCandidate[],
  limit = 8,
): Photo[] {
  // The English and the Georgian name are two ways to be named, either of which
  // may be what a photographer wrote.
  const names = [place.name, place.nameKa]
    .filter((n): n is string => Boolean(n))
    .map(distinctive)
    .filter((tokens) => tokens.length > 0);
  if (names.length === 0) return [];

  const scored: { photo: Photo; matched: number; metres: number | null }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.photo.id)) continue;
    seen.add(c.photo.id);

    const text = c.labels.join(" ");
    if (NOT_A_PHOTO.test(text)) continue;
    const key = nameKey(text);

    // The best of the names: how many of its words the photograph uses, and
    // whether that is all of them. One shared word is enough for a name of one
    // or two, but a longer name needs half of it: "Hilton Garden Inn Chavchavadze"
    // is not a photograph of Chavchavadze Avenue.
    let matched = 0;
    let whole = false;
    let enough = false;
    for (const tokens of names) {
      const hit = tokens.filter((t) => key.includes(t)).length;
      if (hit > matched) matched = hit;
      if (hit === tokens.length) whole = true;
      if (hit >= Math.ceil(tokens.length / 2)) enough = true;
    }
    if (matched === 0 || !enough) continue;

    const metres = c.lonLat ? haversineM(place.lonLat, c.lonLat) : null;
    // Where it was taken, if it says, is near; if it does not say, the whole
    // name must be there, since a part of one is too easily another place's.
    if (metres !== null ? metres > NEAR_M : !whole) continue;
    scored.push({ photo: c.photo, matched, metres });
  }

  return scored
    .sort(
      (a, b) =>
        b.matched - a.matched ||
        (a.metres ?? Number.POSITIVE_INFINITY) -
          (b.metres ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, limit)
    .map((s) => s.photo);
}
