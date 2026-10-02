import { placeCards } from "../dal/places.ts";
import { countUse } from "../dal/usage.ts";
import type {
  EnrichFailure,
  Photo,
  PhotoSource,
  PlaceIdentity,
} from "../domain/catalogue/enrichment.ts";

// Photographs of a place, from a source that is free and freely licensed. The
// counterpart of place-enrichment.ts for the content that needs no key and has
// no terms against keeping it: so, unlike the reviews, what is found may be held
// for a while, and is — a few minutes, in this instance's memory, so the same
// place opened twice (a popup and then its page) asks Commons once.
//
// A place with no photographs is an answer, not a failure: most hotels and cafés
// have none of their own on Commons, and the screen then shows none.

export type PhotosOutcome =
  | { ok: true; photos: Photo[] }
  | { ok: false; reason: EnrichFailure };

export type PhotosLimits = { userPerMinute: number };
export const defaultLimits: PhotosLimits = { userPerMinute: 30 };

/** How long what Commons said is held. Photographs of a castle do not change by the minute. */
const HOLD_MS = 15 * 60_000;
/** Enough to cover a trip's places and then some; the oldest go first. */
const HOLD_MAX = 300;

export type PhotosDeps = {
  source: PhotoSource;
  identity: (placeId: string) => Promise<PlaceIdentity | null>;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  limits: PhotosLimits;
};

const defaults = (): Omit<PhotosDeps, "source"> => ({
  identity: async (placeId) => {
    const card = (await placeCards([placeId])).get(placeId);
    return card
      ? {
          name: card.name,
          nameKa: card.nameKa,
          lonLat: card.lonLat,
          category: card.category,
        }
      : null;
  },
  count: countUse,
  now: () => new Date(),
  limits: defaultLimits,
});

const held = new Map<string, { at: number; photos: Photo[] }>();
const inflight = new Map<string, Promise<PhotosOutcome>>();

export async function photosForPlace(
  placeId: string,
  userId: string,
  overrides: Pick<PhotosDeps, "source"> & Partial<PhotosDeps>,
): Promise<PhotosOutcome> {
  const deps = { ...defaults(), ...overrides };
  const now = deps.now();

  if (
    (await deps.count(`photos:user:${userId}:m`, 60, now)) >
    deps.limits.userPerMinute
  ) {
    return { ok: false, reason: "rate-limited" };
  }

  const kept = held.get(placeId);
  if (kept && now.getTime() - kept.at < HOLD_MS) {
    return { ok: true, photos: kept.photos };
  }

  // Two travellers opening one place together share one call.
  const shared = inflight.get(placeId);
  if (shared) return shared;

  const call = (async (): Promise<PhotosOutcome> => {
    const place = await deps.identity(placeId);
    if (!place) return { ok: true, photos: [] };
    const found = await deps.source.find(place);
    // Only an answer is held: a failure is not, so the next visit asks again.
    if (found.ok) {
      held.set(placeId, { at: now.getTime(), photos: found.photos });
      if (held.size > HOLD_MAX) {
        const oldest = held.keys().next().value;
        if (oldest !== undefined) held.delete(oldest);
      }
    }
    return found;
  })();
  inflight.set(placeId, call);
  try {
    return await call;
  } finally {
    inflight.delete(placeId);
  }
}

/** For tests: nothing carried from one to the next. */
export function forgetPhotos() {
  held.clear();
  inflight.clear();
}
