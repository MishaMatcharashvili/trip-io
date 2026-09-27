import {
  countInArea,
  type PlaceHit,
  placeCards,
  searchPlaces,
} from "../dal/places.ts";
import type { CategoryGroup } from "../domain/catalogue/categories.ts";
import {
  areaBySlug,
  type FocusAreaSlug,
  focusAreas,
} from "../domain/catalogue/focus-areas.ts";
import { ownSite } from "../domain/catalogue/website.ts";
import type { LonLat } from "../domain/geo.ts";
import { type SiteIcon, siteIcon } from "../infra/site-icon.ts";

export type { PlaceHit };

export type CatalogueQuery = {
  q?: string;
  near?: LonLat;
  area?: FocusAreaSlug;
  groups?: CategoryGroup[];
  limit?: number;
};

/** The catalogue as a traveller searches and browses it. */
export function searchCatalogue(query: CatalogueQuery): Promise<PlaceHit[]> {
  return searchPlaces({
    q: query.q,
    near: query.near,
    area: query.area ? areaBySlug(query.area).match : undefined,
    groups: query.groups,
    limit: Math.min(query.limit ?? 20, 50),
  });
}

export type AreaCount = {
  slug: FocusAreaSlug;
  curated: number;
  verified: number;
};

/** What each focus area holds that a plan may use: Explore's region chips. */
export function catalogueByArea(): Promise<AreaCount[]> {
  return Promise.all(
    focusAreas.map(async (a) => ({
      slug: a.slug,
      ...(await countInArea(a.match)),
    })),
  );
}

/**
 * A place's logo from its own website, or null: no such place, no website of
 * its own (a Facebook page is not one), or nothing usable published there.
 */
export async function placeLogo(placeId: string): Promise<SiteIcon | null> {
  const place = (await placeCards([placeId])).get(placeId);
  const site = ownSite(place?.website);
  return site ? siteIcon(site) : null;
}
