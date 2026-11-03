import { z } from "zod";
import type { EnrichFailure } from "../domain/catalogue/enrichment.ts";
import type {
  Listing,
  ListingCollect,
  ListingQuery,
  ListingSource,
  ListingStart,
} from "../domain/catalogue/listings.ts";
import { LIST_PAGE, parseRanking } from "../domain/catalogue/listings.ts";
import type { Ranking } from "../domain/catalogue/ratings.ts";
import { inGeorgiaBbox } from "../domain/geo.ts";

// Tripadvisor's destination lists, read through Apify's Tripadvisor scraper actor
// (maxcopell/tripadvisor), behind the domain's ListingSource port: the only
// file that knows Apify's URLs, the actor's input or its output shape. The
// token rides in a header, never a URL.
//
// A run reads a destination's list best first and takes minutes, so it is started and
// collected separately: `start` returns the run's id at once, `collect` says
// whether it has finished and, when it has, returns the list. The queue checks
// back between the two (src/bll/tripadvisor-listings.ts).
//
// This scrapes Tripadvisor's site, which its terms forbid; the owner chose it on
// 2026-11-03 (docs/tripadvisor-lists.md). It is kept apart from the Terra key: no
// call here uses it.
//
// Parsed against the actor's documented output. A reply that does not fit is
// `malformed`; an item that does not fit is dropped, not guessed at.

const ORIGIN = "https://api.apify.com/v2";
const ACTOR = "maxcopell~tripadvisor";
const TIMEOUT_MS = 30_000;

const runResponse = z.object({
  data: z.object({
    id: z.string(),
    status: z.string(),
    defaultDatasetId: z.string(),
  }),
});

const DONE = "SUCCEEDED";
const RUNNING = new Set(["READY", "RUNNING"]);

const count = z
  .union([z.number(), z.string()])
  .transform((v) =>
    typeof v === "number" ? v : Number(v.replace(/[^\d.]/g, "")),
  );

const item = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string().optional(),
  name: z.string().min(1),
  latitude: count.nullish(),
  longitude: count.nullish(),
  rating: count.nullish(),
  numberOfReviews: count.nullish(),
  rankingPosition: count.nullish(),
  rankingDenominator: count.nullish(),
  rankingString: z.string().nullish(),
  webUrl: z.string().nullish(),
});

/**
 * "#18 of 11,484 places to eat" is what the site shows; the actor's own
 * denominator has been seen to disagree with it, so the sentence wins.
 */
function rankingOf(i: z.infer<typeof item>): Ranking | null {
  const said = parseRanking(i.rankingString);
  if (said) return said;
  const [rank, of] = [i.rankingPosition, i.rankingDenominator];
  return rank && of && rank >= 1 && of >= rank ? { rank, of } : null;
}

/** The items of a finished run, as listings: placed in Georgia, of the kind asked for. */
export function toListings(body: unknown, query: ListingQuery): Listing[] {
  const items = z.array(z.unknown()).parse(body);
  return items.flatMap((raw) => {
    const parsed = item.safeParse(raw);
    if (!parsed.success) return [];
    const i = parsed.data;
    if (i.type && i.type.toLowerCase() !== query.kind) return [];
    if (!i.latitude || !i.longitude) return [];
    const lonLat: [number, number] = [i.longitude, i.latitude];
    // A name can match a place elsewhere; only Georgia's are kept.
    if (!inGeorgiaBbox(lonLat)) return [];
    return [
      {
        id: i.id,
        kind: query.kind,
        destination: query.destination,
        name: i.name,
        lonLat,
        rating: i.rating ?? null,
        count: i.numberOfReviews ?? 0,
        ranking: rankingOf(i),
        url: i.webUrl?.startsWith("https://") ? i.webUrl : null,
      },
    ];
  });
}

/** What the actor is asked: one destination, one kind of place, best first. */
/**
 * The pages of a town's restaurant list, as the site addresses them: the first,
 * then "-oa30-", "-oa60-"… A search by name reads one page, whatever the depth
 * asked for (checked live, 2026-11-03: 33 of 150), so a known town is paged.
 */
export function listPages(query: ListingQuery): string[] | null {
  if (!query.geo || query.kind !== "restaurant") return null;
  const { id, slug } = query.geo;
  const pages = Math.ceil(query.max / LIST_PAGE);
  return Array.from({ length: pages }, (_, i) =>
    i === 0
      ? `https://www.tripadvisor.com/Restaurants-g${id}-${slug}.html`
      : `https://www.tripadvisor.com/Restaurants-g${id}-oa${i * LIST_PAGE}-${slug}.html`,
  );
}

export function actorInput(query: ListingQuery) {
  const pages = listPages(query);
  return {
    ...(pages
      ? {
          startUrls: pages.map((url) => ({ url })),
          // Per page: a little over a page, so a long one is not cut short.
          maxItemsPerQuery: LIST_PAGE + 10,
        }
      : { query: `${query.name}, Georgia`, maxItemsPerQuery: query.max }),
    includeRestaurants: query.kind === "restaurant",
    includeAttractions: query.kind === "attraction",
    includeHotels: query.kind === "hotel",
    includeTags: false,
    includeNearbyResults: false,
    includeAiReviewsSummary: false,
    // Each photo and each business lead is a charge of its own (a lead is $0.10
    // on the free plan): none are wanted, so none are left to the defaults.
    maxPhotosPerPlace: 0,
    maximumLeadsEnrichmentRecords: 0,
    language: "en",
    currency: "USD",
  };
}

export function classify(status: number): EnrichFailure {
  if (status === 401 || status === 403) return "auth";
  // Apify's answer when the account's credit or plan is used up.
  if (status === 402) return "quota";
  if (status === 404) return "no-match";
  if (status === 429) return "rate-limited";
  return "upstream";
}

type Reply = { ok: true; body: unknown } | { ok: false; reason: EnrichFailure };

export function apifyTripadvisor(options: {
  token: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): ListingSource {
  const { token, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  async function call(
    path: string,
    params: Record<string, string | number> = {},
    body?: unknown,
  ): Promise<Reply> {
    if (!token) return { ok: false, reason: "not-configured" };
    const url = new URL(`${ORIGIN}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    let res: Response;
    try {
      res = await send(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return { ok: false, reason: timedOut ? "timeout" : "upstream" };
    }
    if (!res.ok) return { ok: false, reason: classify(res.status) };
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return { ok: false, reason: "malformed" };
    }
  }

  return {
    configured: Boolean(token),

    async start(query): Promise<ListingStart> {
      const reply = await call(`/acts/${ACTOR}/runs`, {}, actorInput(query));
      if (!reply.ok) return reply;
      const parsed = runResponse.safeParse(reply.body);
      return parsed.success
        ? { ok: true, runId: parsed.data.data.id }
        : { ok: false, reason: "malformed" };
    },

    async collect(runId, query): Promise<ListingCollect> {
      const run = await call(`/actor-runs/${encodeURIComponent(runId)}`);
      if (!run.ok) return run;
      const parsed = runResponse.safeParse(run.body);
      if (!parsed.success) return { ok: false, reason: "malformed" };
      const { status, defaultDatasetId } = parsed.data.data;
      if (RUNNING.has(status)) return { ok: true, state: "running" };
      // Failed, aborted or timed out: nothing to read, and asking again won't help.
      if (status !== DONE) return { ok: false, reason: "upstream" };

      const items = await call(
        `/datasets/${encodeURIComponent(defaultDatasetId)}/items`,
        { clean: "true", format: "json", limit: query.max + 100 },
      );
      if (!items.ok) return items;
      try {
        return {
          ok: true,
          state: "done",
          listings: toListings(items.body, query),
        };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
