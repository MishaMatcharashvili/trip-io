import { z } from "zod";
import type {
  Candidate,
  EnrichFailure,
  Enrichment,
  EnrichOutcome,
  Photo,
  PlaceEnricher,
  PlaceIdentity,
  Review,
  ReviewTripType,
  SearchOutcome,
} from "../domain/catalogue/enrichment.ts";
import {
  reviewTripTypes,
  searchCategory,
} from "../domain/catalogue/enrichment.ts";

// Tripadvisor's Terra API, behind the domain's PlaceEnricher port: the only
// file that knows its URL, its parameters or its response shape. The key rides
// in a header and never in a URL, so nothing here puts it in a log; errors are
// reduced to a reason before they leave this file.
//
// What is asked for, and why:
//   * Catalogue search, not location search, to find a place: location search
//     only sees places already allowed, which is none the first time. The
//     search has no radius, so the answer is checked against the place's own
//     coordinates by the domain (chooseMatch), not trusted.
//   * `size` as small as will do. A billable unit is one location returned, so
//     a search for one place that asks for twenty is paid for twenty times.
//   * An allowlist append before the first read. Terra answers a read for a
//     place that is not on it with a 404, found or not.
//   * Details, reviews and photos as three calls, and the last two may fail
//     without losing the first: a rating with no pictures is worth showing.
// Not used: the feeds, the recommendations search, multi-get details.
//
// Parsed against the shapes in Terra's reference, which has been read but not
// run against: `pnpm smoke:tripadvisor` is what checks them against the live
// API. A reply that does not fit is `malformed`, never a guess.

const ORIGIN = "https://terra.tripadvisor.com/api";
const TIMEOUT_MS = 8_000;
const SEARCH_RESULTS = 5;
const REVIEWS = 5;
const PHOTOS = 8;

const name = "Tripadvisor";

/** An address that can only be fetched securely: nothing else is ever shown. */
const secureUrl = z
  .string()
  .refine((u) => u.startsWith("https://"), "not https");

const translated = z.array(
  z.object({
    language: z.string().optional(),
    value: z.string(),
    primary: z.boolean().optional(),
  }),
);

/** The English text if there is some, else the provider's own choice. */
function pick(texts: z.infer<typeof translated> | undefined): string | null {
  if (!texts?.length) return null;
  const chosen =
    texts.find((t) => t.language?.toLowerCase().startsWith("en")) ??
    texts.find((t) => t.primary) ??
    texts[0];
  return chosen.value.trim() || null;
}

const id = z.union([z.string(), z.number()]).transform(String);

const coordinates = z.object({ latitude: z.number(), longitude: z.number() });

const searchResponse = z.object({
  data: z.array(
    z.object({
      location: z.object({
        id,
        names: translated.optional(),
        coordinates: coordinates.optional(),
      }),
    }),
  ),
});

const detailsResponse = z.object({
  data: z
    .array(
      z.object({
        id,
        names: translated.optional(),
        traveler_ratings: z
          .object({
            overall: z
              .object({
                rating: z.number(),
                count: z.number(),
                icon_url: secureUrl.optional(),
              })
              .optional(),
          })
          .optional(),
        rankings: z
          .array(z.object({ display_text: z.string().optional() }))
          .optional(),
        urls: z
          .object({ tripadvisor: z.object({ main: secureUrl }).optional() })
          .optional(),
      }),
    )
    .min(1),
});

const reviewsResponse = z.object({
  data: z.array(
    z.object({
      id,
      rating: z.number().int().min(1).max(5),
      title: translated.optional(),
      text: translated.optional(),
      publish_ts: z.string(),
      trip_type: z.string().optional(),
      user: z.object({ username: z.string().optional() }).optional(),
      url: secureUrl.optional(),
      rating_icon_url: z.object({ url: secureUrl }).optional(),
    }),
  ),
});

const photosResponse = z.object({
  data: z.array(
    z.object({
      id,
      photo: z.object({
        original_size_url: secureUrl,
        original_width: z.number().optional(),
        original_height: z.number().optional(),
      }),
      caption: z.string().nullish(),
      source: z.object({ name: z.string().optional() }).optional(),
    }),
  ),
});

const tripType = (raw: string | undefined): ReviewTripType | null => {
  const lower = raw?.toLowerCase();
  return reviewTripTypes.find((t) => t === lower) ?? null;
};

export function toCandidates(body: unknown): Candidate[] {
  return searchResponse.parse(body).data.map(({ location }) => ({
    id: location.id,
    names: (location.names ?? []).map((n) => n.value),
    lonLat: location.coordinates
      ? [location.coordinates.longitude, location.coordinates.latitude]
      : null,
  }));
}

export function toReviews(body: unknown): Review[] {
  return reviewsResponse.parse(body).data.flatMap((r) => {
    const text = pick(r.text);
    // A rating with nothing written is not a review to show.
    if (!text) return [];
    return [
      {
        id: r.id,
        rating: r.rating,
        ratingIcon: r.rating_icon_url?.url ?? null,
        title: pick(r.title),
        text,
        publishedAt: r.publish_ts,
        tripType: tripType(r.trip_type),
        author: r.user?.username ?? null,
        url: r.url ?? null,
      },
    ];
  });
}

export function toPhotos(body: unknown): Photo[] {
  return photosResponse.parse(body).data.map((p) => ({
    id: p.id,
    url: p.photo.original_size_url,
    width: p.photo.original_width ?? 4,
    height: p.photo.original_height ?? 3,
    caption: p.caption?.trim() || null,
    by:
      p.source?.name === "Management"
        ? "venue"
        : p.source?.name === "Traveler"
          ? "traveller"
          : null,
  }));
}

export function toEnrichment(
  details: unknown,
  reviews: Review[],
  photos: Photo[],
): Enrichment | null {
  const [place] = detailsResponse.parse(details).data;
  const url = place.urls?.tripadvisor?.main;
  // Every figure links to the page it came from; without one there is nothing
  // to attribute it to, and nothing is shown.
  if (!url) return null;
  const overall = place.traveler_ratings?.overall;
  return {
    source: { name, url },
    rating: overall
      ? {
          value: overall.rating,
          count: overall.count,
          icon: overall.icon_url ?? null,
        }
      : null,
    ranking: place.rankings?.[0]?.display_text ?? null,
    url,
    reviews,
    photos,
  };
}

/** The status a reply carries, as the reason it is. */
export function classify(status: number): EnrichFailure {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "no-match";
  if (status === 429) return "rate-limited";
  return "upstream";
}

type Reply = { ok: true; body: unknown } | { ok: false; reason: EnrichFailure };

export function tripadvisor(options: {
  key: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): PlaceEnricher {
  const { key, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  async function call(
    path: string,
    params: Record<string, string | number> = {},
    body?: unknown,
  ): Promise<Reply> {
    if (!key) return { ok: false, reason: "not-configured" };
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
          "X-API-Key": key,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        // Next's fetch cache must not keep it: what is kept is kept on purpose,
        // with a lifetime, in the store behind KeptContent.
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
    provider: "tripadvisor",
    configured: Boolean(key),

    async search(place: PlaceIdentity): Promise<SearchOutcome> {
      const reply = await call("/catalog/locations/search", {
        query: place.name.slice(0, 500),
        search_type: "NAME",
        country_code: "GE",
        category: searchCategory(place.category).toUpperCase(),
        size: SEARCH_RESULTS,
      });
      if (!reply.ok) return reply;
      try {
        return { ok: true, candidates: toCandidates(reply.body) };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },

    async allow(placeId) {
      const reply = await call(
        "/allowlist",
        {},
        { operation_type: "APPEND", allowlist: [Number(placeId)] },
      );
      return reply.ok ? { ok: true } : reply;
    },

    async read(placeId): Promise<EnrichOutcome> {
      const path = `/locations/${encodeURIComponent(placeId)}`;
      const [details, reviews, photos] = await Promise.all([
        call("/locations", { id: placeId }),
        call(`${path}/reviews`, { size: REVIEWS, sort_by: "MOST_RECENT" }),
        call(`${path}/photos`, { size: PHOTOS }),
      ]);
      // The rating is the heart of it: without it there is nothing to show,
      // and why not is what the caller is told.
      if (!details.ok) return details;

      // Reviews and pictures may fail without taking the rating with them. A
      // reply that does not fit is dropped, not guessed at.
      const attempt = <T>(reply: Reply, parse: (body: unknown) => T[]): T[] => {
        if (!reply.ok) return [];
        try {
          return parse(reply.body);
        } catch {
          return [];
        }
      };

      try {
        const enrichment = toEnrichment(
          details.body,
          attempt(reviews, toReviews),
          attempt(photos, toPhotos),
        );
        return enrichment
          ? { ok: true, enrichment }
          : { ok: false, reason: "no-match" };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
