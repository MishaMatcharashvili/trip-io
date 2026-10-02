import { findExternal, saveExternal } from "../dal/place-external.ts";
import { placeCards } from "../dal/places.ts";
import { countUse } from "../dal/usage.ts";
import {
  chooseMatch,
  type EnrichOutcome,
  type PlaceEnricher,
  type PlaceIdentity,
} from "../domain/catalogue/enrichment.ts";

// A place's rating, reviews and photos from the provider. The one door to it:
// the HTTP handler comes through here, so the rules on spending, and on what
// may be remembered, sit in one place.
//
// What may be remembered is the provider's identifier for the place and
// nothing else — its caching policy forbids keeping the content — so there is
// no cache here. Two travellers opening the same place at the same moment
// share one call, which is a queue and not a store: the entry is gone as soon
// as the answer is back. Everything shown is read again each time, which is
// why the limits below matter.
//
// What it guards, in order: a request that cannot succeed is refused before it
// costs anything; the traveller's own rate; identical requests already in
// flight; finding the place (rare, and rate-limited by the provider harder
// than anything else); and the day's total.

export type EnrichLimits = {
  userPerMinute: number;
  /** Places one traveller may open in a day. Each is about three billable calls. */
  userPerDay: number;
  /** Looking a place up, everyone together: the provider allows one a second. */
  searchPerMinute: number;
  /** Places opened, everyone together, per UTC day. */
  globalPerDay: number;
};

export const defaultLimits: EnrichLimits = {
  userPerMinute: 10,
  userPerDay: 60,
  searchPerMinute: 40,
  globalPerDay: 500,
};

/** When a place nobody matched is looked for again: the provider may have it by now. */
const RECHECK_MS = 30 * 86_400_000;

export type EnrichLog = {
  category: "places.enrich";
  result:
    | "ok"
    | "shared"
    | "searched"
    | Extract<EnrichOutcome, { ok: false }>["reason"];
  latencyMs: number;
};

export type EnrichDeps = {
  provider: PlaceEnricher;
  identity: (placeId: string) => Promise<PlaceIdentity | null>;
  find: typeof findExternal;
  save: typeof saveExternal;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  limits: EnrichLimits;
  log: (entry: EnrichLog) => void;
};

const inflight = new Map<string, Promise<EnrichOutcome>>();

const defaults = (): Omit<EnrichDeps, "provider"> => ({
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
  find: findExternal,
  save: saveExternal,
  count: countUse,
  now: () => new Date(),
  limits: defaultLimits,
  log: (entry) => console.info(JSON.stringify(entry)),
});

const MINUTE = 60;
const DAY = 86_400;

export async function enrichPlace(
  placeId: string,
  userId: string,
  overrides: Pick<EnrichDeps, "provider"> & Partial<EnrichDeps>,
): Promise<EnrichOutcome> {
  const deps = { ...defaults(), ...overrides };
  const started = Date.now();
  const now = deps.now();
  const finish = (
    outcome: EnrichOutcome,
    result: EnrichLog["result"] = outcome.ok ? "ok" : outcome.reason,
  ) => {
    deps.log({
      category: "places.enrich",
      result,
      latencyMs: Date.now() - started,
    });
    return outcome;
  };

  // Without a credential there is nothing to spend, so nothing is counted.
  if (!deps.provider.configured) {
    return finish({ ok: false, reason: "not-configured" });
  }

  const { limits } = deps;
  if (
    (await deps.count(`enrich:user:${userId}:m`, MINUTE, now)) >
      limits.userPerMinute ||
    (await deps.count(`enrich:user:${userId}:d`, DAY, now)) > limits.userPerDay
  ) {
    return finish({ ok: false, reason: "rate-limited" });
  }

  const shared = inflight.get(placeId);
  if (shared) return finish(await shared, "shared");

  const call = resolveAndRead(placeId, deps, now);
  inflight.set(placeId, call);
  try {
    return finish(await call);
  } finally {
    inflight.delete(placeId);
  }
}

async function resolveAndRead(
  placeId: string,
  deps: EnrichDeps,
  now: Date,
): Promise<EnrichOutcome> {
  const { provider, limits } = deps;

  const known = await deps.find(placeId, provider.provider);
  let externalId: string;

  if (known?.status === "matched") {
    externalId = known.externalId;
  } else if (known && now.getTime() - known.checkedAt.getTime() < RECHECK_MS) {
    return { ok: false, reason: "no-match" };
  } else {
    const place = await deps.identity(placeId);
    if (!place) return { ok: false, reason: "no-match" };

    // Looking a place up is the provider's most tightly limited call.
    if (
      (await deps.count("enrich:search:m", MINUTE, now)) >
      limits.searchPerMinute
    ) {
      return { ok: false, reason: "rate-limited" };
    }
    const found = await provider.search(place);
    if (!found.ok) return found;

    const match = chooseMatch(place, found.candidates);
    if (!match) {
      await deps.save(placeId, provider.provider, { status: "none" });
      return { ok: false, reason: "no-match" };
    }
    // Remembered only once it can be read: an id that was found but not
    // allowed would otherwise be trusted and fail on every visit after.
    const allowed = await provider.allow(match.id);
    if (!allowed.ok) return allowed;
    await deps.save(placeId, provider.provider, {
      status: "matched",
      externalId: match.id,
      confidence: match.confidence,
    });
    externalId = match.id;
  }

  // Counted when the provider is actually about to be asked, so a shared
  // answer, a remembered absence and a refusal cost nothing.
  if ((await deps.count("enrich:all:d", DAY, now)) > limits.globalPerDay) {
    return { ok: false, reason: "quota" };
  }
  return provider.read(externalId);
}
