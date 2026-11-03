import { enqueue } from "../dal/jobs.ts";
import {
  listedDestinations,
  listingsFor,
  saveListings,
} from "../dal/listings.ts";
import { countUse } from "../dal/usage.ts";
import {
  type Destination,
  destination,
} from "../domain/catalogue/destinations.ts";
import type { EnrichFailure } from "../domain/catalogue/enrichment.ts";
import {
  geoOf,
  type Listing,
  type ListingGeo,
  type ListingQuery,
  type ListingSource,
  listingQueries,
} from "../domain/catalogue/listings.ts";
import { type RatedKind, ratedKinds } from "../domain/catalogue/ratings.ts";
import { apifyTripadvisor } from "../infra/apify-tripadvisor.ts";

// Reading Tripadvisor's destination lists into tripadvisor_listing, for rating
// places by (src/bll/ratings.ts, docs/tripadvisor-lists.md).
//
// A destination's lists are read the first time a trip goes there and is
// rated without them, and again each month for every destination that has
// them. A read takes minutes, longer than a drain may hold a job, so each list
// is a job that checks back: the first run of it starts the read and queues
// itself again a few minutes on with the read's id; each later run asks
// whether the read has finished, and either queues itself again or keeps the
// list. The script (`pnpm catalogue:tripadvisor`) does the same in one sitting.
//
// A destination is first found by its name, which reads one page of its
// restaurants (about thirty). When that page is one town's, its links say where
// the town's list lives, and the list is read again page by page to its depth;
// the monthly refresh pages straight away.

export const LISTING_JOB = "tripadvisor-list";

/** How long between asking whether a read has finished. */
const CHECK_EVERY_MS = 2 * 60_000;
/** A read still going after this many checks is given up on. */
const MAX_CHECKS = 30;
/** A destination asked for without lists is read at most once in this window. */
const REQUEST_WINDOW_S = 7 * 86_400;

export type ListingJob = ListingQuery & { runId?: string; checks?: number };

export type ListingDeps = {
  source: ListingSource;
  save: typeof saveListings;
  enqueue: typeof enqueue;
  now: () => Date;
};

export type ListingOutcome =
  | { state: "started" | "running"; runId: string }
  | { state: "saved"; listings: number }
  | { state: "failed"; reason: EnrichFailure | "gave-up" };

export function liveListingDeps(): ListingDeps {
  return {
    source: apifyTripadvisor({ token: process.env.APIFY_TOKEN }),
    save: saveListings,
    enqueue,
    now: () => new Date(),
  };
}

/**
 * Asks for a destination's lists to be read, when a trip found it without
 * them. Once a week at most per destination, however many trips go there,
 * and never when there is nothing to read them with.
 */
export async function requestListings(
  d: Pick<Destination, "slug" | "name">,
  deps: {
    configured: boolean;
    enqueue: typeof enqueue;
    count: typeof countUse;
    now: () => Date;
  },
): Promise<{ queued: number }> {
  if (!deps.configured) return { queued: 0 };
  const asked = await deps.count(
    `tripadvisor-lists:${d.slug}`,
    REQUEST_WINDOW_S,
    deps.now(),
  );
  if (asked > 1) return { queued: 0 };
  const queries = listingQueries(d);
  for (const q of queries) await deps.enqueue(LISTING_JOB, q);
  return { queued: queries.length };
}

/**
 * Tripadvisor's lists as trip generation rates by them (src/bll/ratings.ts):
 * read from what is kept, and asked for when a destination has none.
 */
export function tripadvisorRatings(configured: boolean) {
  return {
    lists: listingsFor,
    request: (d: Pick<Destination, "slug" | "name">) =>
      requestListings(d, {
        configured,
        enqueue,
        count: countUse,
        now: () => new Date(),
      }),
  };
}

/** The monthly refresh: every destination that has lists is read again. */
export async function scheduleListingRefresh(
  deps: {
    enqueue: typeof enqueue;
    listed: typeof listedDestinations;
    stored: typeof listingsFor;
  } = { enqueue, listed: listedDestinations, stored: listingsFor },
): Promise<{ queued: number }> {
  let queued = 0;
  for (const slug of await deps.listed()) {
    const d = destination(slug);
    if (!d) continue;
    for (const q of listingQueries(d)) {
      // Where the last read found the town's list, it is paged directly.
      const geo =
        q.kind === "restaurant" ? geoOf(await deps.stored(slug, q.kind)) : null;
      await deps.enqueue(LISTING_JOB, geo ? { ...q, geo } : q);
      queued++;
    }
  }
  return { queued };
}

/**
 * Where a list read by name should be read again, page by page: a restaurant
 * list that came back short of its depth, all from one town.
 */
function deeper(query: ListingQuery, listings: Listing[]): ListingGeo | null {
  if (query.kind !== "restaurant" || query.geo) return null;
  if (listings.length >= query.max) return null;
  return geoOf(listings);
}

const isGeo = (g: unknown): g is ListingGeo =>
  typeof g === "object" &&
  g !== null &&
  /^\d+$/.test(String((g as ListingGeo).id)) &&
  /^[\w-]+$/.test(String((g as ListingGeo).slug));

const isKind = (k: unknown): k is RatedKind =>
  (ratedKinds as readonly unknown[]).includes(k);

/** One step of one list: start it, check on it, or keep it. */
export async function listingStep(
  payload: unknown,
  deps: ListingDeps = liveListingDeps(),
): Promise<ListingOutcome> {
  const job = payload as Partial<ListingJob>;
  if (
    typeof job.destination !== "string" ||
    typeof job.name !== "string" ||
    !isKind(job.kind) ||
    !job.max
  ) {
    throw new Error("listing job needs a destination, a kind and a depth");
  }
  const query: ListingQuery = {
    destination: job.destination,
    name: job.name,
    kind: job.kind,
    max: job.max,
    ...(isGeo(job.geo) ? { geo: job.geo } : {}),
  };
  const later = () => new Date(deps.now().getTime() + CHECK_EVERY_MS);

  if (!job.runId) {
    const started = await deps.source.start(query);
    if (!started.ok) return { state: "failed", reason: started.reason };
    await deps.enqueue(
      LISTING_JOB,
      { ...query, runId: started.runId, checks: 0 },
      later(),
    );
    return { state: "started", runId: started.runId };
  }

  const checks = (job.checks ?? 0) + 1;
  const result = await deps.source.collect(job.runId, query);
  if (!result.ok) return { state: "failed", reason: result.reason };
  if (result.state === "running") {
    if (checks >= MAX_CHECKS) return { state: "failed", reason: "gave-up" };
    await deps.enqueue(
      LISTING_JOB,
      { ...query, runId: job.runId, checks },
      later(),
    );
    return { state: "running", runId: job.runId };
  }
  await deps.save(query.destination, query.kind, result.listings, deps.now());
  const geo = deeper(query, result.listings);
  if (geo) await deps.enqueue(LISTING_JOB, { ...query, geo });
  return { state: "saved", listings: result.listings.length };
}

/**
 * Reads one list start to finish, waiting between checks: the script's way, for
 * a first fill or a look at one destination, where nothing has to fit a drain.
 */
export async function readListing(
  query: ListingQuery,
  deps: ListingDeps & { sleep: (ms: number) => Promise<void> },
  checkEveryMs = 15_000,
): Promise<ListingOutcome> {
  const started = await deps.source.start(query);
  if (!started.ok) return { state: "failed", reason: started.reason };
  for (let i = 0; i < (MAX_CHECKS * CHECK_EVERY_MS) / checkEveryMs; i++) {
    await deps.sleep(checkEveryMs);
    const result = await deps.source.collect(started.runId, query);
    if (!result.ok) return { state: "failed", reason: result.reason };
    if (result.state === "running") continue;
    await deps.save(query.destination, query.kind, result.listings, deps.now());
    const geo = deeper(query, result.listings);
    if (geo) {
      const paged = await readListing({ ...query, geo }, deps, checkEveryMs);
      // The first page is kept if paging fails; it is still a list.
      return paged.state === "saved"
        ? paged
        : { state: "saved", listings: result.listings.length };
    }
    return { state: "saved", listings: result.listings.length };
  }
  return { state: "failed", reason: "gave-up" };
}
