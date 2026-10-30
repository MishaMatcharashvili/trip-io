import { saveExternal } from "../dal/place-external.ts";
import {
  findSights as findInCatalogue,
  importSight,
  regionAt,
  type SightHit,
  sourcedIds,
} from "../dal/places.ts";
import { countUse } from "../dal/usage.ts";
import { destination } from "../domain/catalogue/destinations.ts";
import {
  type SightFinder,
  type SightSuggestion,
  sightCategory,
} from "../domain/catalogue/sight-search.ts";
import type { MustSee } from "../domain/trip/generate/constraints.ts";

// "Bodbe" typed on /new: the sights it could mean, the catalogue's first, and
// Google's when the catalogue has too few. Picking one of Google's takes it
// into the catalogue (docs/google-places.md), so that from then on it is a
// place like any other, and the trip pins it by its catalogue id.

export type SightSearchDeps = {
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  find: (q: string, limit: number) => Promise<SightHit[]>;
  sourced: (source: string, ids: readonly string[]) => Promise<Set<string>>;
  regionAt: typeof regionAt;
  take: typeof importSight;
  remember: typeof saveExternal;
};

const defaults = (): SightSearchDeps => ({
  count: countUse,
  now: () => new Date(),
  find: findInCatalogue,
  sourced: sourcedIds,
  regionAt,
  take: importSight,
  remember: saveExternal,
});

/** Shorter than this, a name matches half the catalogue. */
export const SIGHT_QUERY_MIN = 2;
/** The catalogue's own matches shown at most. */
const FROM_CATALOGUE = 6;
/** With this many of its own, the catalogue is not added to. */
const ENOUGH_FROM_CATALOGUE = 5;

/** Typing: a search a keystroke, debounced on the page. Each may be a Google call. */
const SEARCHES_PER_MINUTE = 40;
const SEARCHES_PER_DAY = 400;
/** A pick is a billed Place Details call and a new catalogue row. */
const PICKS_PER_DAY = 30;

export type SightSearch =
  | {
      ok: true;
      /** Already in the catalogue: pinned as they are. */
      sights: MustSee[];
      /** Google's, not in the catalogue yet: taken in when picked. */
      more: SightSuggestion[];
    }
  | { ok: false; reason: "rate-limited" };

const asMustSee = (hit: SightHit): MustSee[] => {
  const place = hit.region ? destination(hit.region) : undefined;
  return place ? [{ id: hit.id, name: hit.name, place: place.slug }] : [];
};

export async function searchSights(
  finder: SightFinder,
  userId: string,
  query: string,
  session: string,
  overrides: Partial<SightSearchDeps> = {},
): Promise<SightSearch> {
  const deps = { ...defaults(), ...overrides };
  const q = query.trim();
  if (q.length < SIGHT_QUERY_MIN) return { ok: true, sights: [], more: [] };
  const now = deps.now();
  if (
    (await deps.count(`sights:user:${userId}:m`, 60, now)) >
      SEARCHES_PER_MINUTE ||
    (await deps.count(`sights:user:${userId}:d`, 86_400, now)) >
      SEARCHES_PER_DAY
  ) {
    return { ok: false, reason: "rate-limited" };
  }

  const sights = (await deps.find(q, FROM_CATALOGUE)).flatMap(asMustSee);
  if (sights.length >= ENOUGH_FROM_CATALOGUE || !finder.configured) {
    return { ok: true, sights, more: [] };
  }
  // Google down or refusing is the catalogue alone, not an error.
  const suggested = await finder.suggest(q, session);
  if (!suggested.ok) return { ok: true, sights, more: [] };
  // One already taken in is in `sights` when its name matched; either way it
  // is never taken in twice.
  const held = await deps.sourced(
    finder.provider,
    suggested.value.map((s) => s.externalId),
  );
  return {
    ok: true,
    sights,
    more: suggested.value.filter((s) => !held.has(s.externalId)),
  };
}

export type SightPick =
  | { ok: true; sight: MustSee }
  | {
      ok: false;
      reason:
        | "rate-limited"
        | "not-found"
        | "not-a-sight"
        | "outside"
        | "unavailable";
    };

/** One of Google's suggestions, picked: taken into the catalogue and returned as a must-see. */
export async function takeSight(
  finder: SightFinder,
  userId: string,
  externalId: string,
  session: string,
  overrides: Partial<SightSearchDeps> = {},
): Promise<SightPick> {
  const deps = { ...defaults(), ...overrides };
  if (
    (await deps.count(`sights:pick:${userId}:d`, 86_400, deps.now())) >
    PICKS_PER_DAY
  ) {
    return { ok: false, reason: "rate-limited" };
  }

  const found = await finder.details(externalId, session);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  const details = found.value;
  if (!details?.name) return { ok: false, reason: "not-found" };
  const category = sightCategory(details.types);
  if (!category) return { ok: false, reason: "not-a-sight" };
  const region = await deps.regionAt(details.lonLat);
  const place = region ? destination(region) : undefined;
  if (!place) return { ok: false, reason: "outside" };

  const id = await deps.take({
    source: finder.provider,
    sourceId: details.externalId,
    name: details.name,
    category,
    lonLat: details.lonLat,
  });
  // The enrichment panel finds its reviews and photographs by this id, without
  // searching for the place again.
  await deps.remember(id, finder.provider, {
    status: "matched",
    externalId: details.externalId,
    confidence: 1,
  });
  return { ok: true, sight: { id, name: details.name, place: place.slug } };
}
