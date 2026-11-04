import { pointInArea, regionAt } from "../dal/places.ts";
import {
  destination,
  destinationName,
} from "../domain/catalogue/destinations.ts";
import type { LocalityFinder } from "../domain/catalogue/localities.ts";
import type { Home } from "../domain/trip/generate/constraints.ts";

// The traveller's home, from the name they gave it: "my house in Amaghleba".
// Found by a provider (src/infra/google-places.ts), placed in the destination
// whose municipality it lies in, and, when the route is already said, kept only
// if it is on it: there is an Amaghleba in Guria and another in Imereti, and a
// trip to Guria means the first.

export type HomeDeps = {
  regionAt: typeof regionAt;
  inArea: typeof pointInArea;
};

const defaults = (): HomeDeps => ({ regionAt, inArea: pointInArea });

export type FoundHome = {
  home: Home;
  /** The route's places it lies in: a wider one is where its place stands in. */
  within: string[];
};

/**
 * The home by its name, in the part of Georgia the trip goes to. With no route
 * said yet, the provider's first match in Georgia; with one, the first that
 * lies in a place on it, or none. A provider that is down finds nothing, and
 * the name stays in the planner's notes.
 */
export async function findHome(
  finder: LocalityFinder,
  name: string,
  route: readonly string[],
  overrides: Partial<HomeDeps> = {},
): Promise<FoundHome | null> {
  const deps = { ...defaults(), ...overrides };
  // The route's places, by name, tell namesakes apart; Tbilisi, where most
  // trips start, tells nothing.
  const near = route
    .filter((slug) => slug !== "tbilisi")
    .map(destinationName)
    .join(", ");
  const found = await finder.find(name, near || undefined);
  if (!found.ok) return null;

  for (const locality of found.localities) {
    const region = await deps.regionAt(locality.lonLat);
    const place = region ? destination(region) : undefined;
    if (!place) continue;
    const within: string[] = [];
    for (const slug of route) {
      const d = destination(slug);
      if (d && (await deps.inArea(locality.lonLat, d.match))) within.push(slug);
    }
    if (route.length && !within.length) continue;
    return {
      home: { name: locality.name, lonLat: locality.lonLat, place: place.slug },
      within,
    };
  }
  return null;
}
