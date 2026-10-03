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
  SearchOutcome,
} from "../domain/catalogue/enrichment.ts";

// Google's Places API (New), behind the domain's PlaceEnricher port, beside
// Tripadvisor's: the only file that knows its URL, its parameters or its response
// shape. The key rides in a header and never in a URL, so nothing here puts it in
// a log; errors are reduced to a reason before they leave this file.
//
// What is asked for, and why:
//   * Text Search, biased to the place's own coordinates, to find it. The bias is
//     a preference, not a fence, so the answer is checked against the place's
//     coordinates by the domain (chooseMatch), not trusted. The field mask asks
//     only for what the match needs: Google bills by the fields requested.
//   * Place Details with a field mask of exactly what the panel draws: the rating,
//     its count, the page to link to, a few reviews, and the photographs' names.
//   * One Place Photos call per photograph shown, asking for the address rather
//     than the bytes (`skipHttpRedirect`). The reply is a googleusercontent.com
//     address that carries no key, which is what lets the browser fetch it
//     without the key ever leaving this file. The address may be kept; the picture
//     is not (`unoptimized`): it is not run through next/image, whose cache would
//     hold a copy. A photograph's name is
//     not an address and is useless to the client; the address is resolved here.
//   * Details first, photographs after: a rating with no pictures is worth
//     showing, so a photograph that cannot be resolved is dropped, not fatal.
//
// Google's terms apply to what this returns: attribution is shown with it (the
// source is named "Google Maps", every photograph carries its author, every
// review its author and a link). What is kept, and for how long, is the use case's
// business and the owner's decision. See docs/google-places.md.
//
// Parsed against the shapes in Google's reference, which has been read but not
// run against: `pnpm smoke:google-places` is what checks them against the live
// API. A reply that does not fit is `malformed`, never a guess.

const ORIGIN = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8_000;
const SEARCH_RESULTS = 5;
/** The bias around a place's pin; the match decides what is close enough. */
const BIAS_RADIUS_M = 1_500;
/** Each one is a billed Place Photos call, so few. */
const PHOTOS = 6;
/** Wide enough for a full-screen view; the optimiser sizes it down for the strip. */
const PHOTO_WIDTH_PX = 1_200;

const name = "Google Maps";

/** An address that can only be fetched securely: nothing else is ever shown. */
const secureUrl = z
  .string()
  .refine((u) => u.startsWith("https://"), "not https");

/**
 * A photograph's name is spliced into a path, so it is held to the shape Google
 * gives it: nothing that could point the request anywhere else.
 */
const photoName = z.string().regex(/^places\/[\w-]+\/photos\/[\w-]+$/);

const localised = z.object({ text: z.string() }).optional();

const attribution = z.object({
  displayName: z.string().optional(),
  uri: secureUrl.optional(),
});

const searchResponse = z.object({
  // Absent, not empty, when nothing was found.
  places: z
    .array(
      z.object({
        id: z.string(),
        displayName: localised,
        location: z
          .object({ latitude: z.number(), longitude: z.number() })
          .optional(),
      }),
    )
    .default([]),
});

const detailsResponse = z.object({
  id: z.string(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  googleMapsUri: secureUrl.optional(),
  reviews: z
    .array(
      z.object({
        name: z.string(),
        rating: z.number().int().min(1).max(5),
        text: localised,
        originalText: localised,
        publishTime: z.string(),
        googleMapsUri: secureUrl.optional(),
        authorAttribution: attribution.optional(),
      }),
    )
    .default([]),
  photos: z
    .array(
      z.object({
        name: photoName,
        widthPx: z.number().optional(),
        heightPx: z.number().optional(),
        authorAttributions: z.array(attribution).default([]),
      }),
    )
    .default([]),
});

const mediaResponse = z.object({ photoUri: secureUrl });

export function toCandidates(body: unknown): Candidate[] {
  return searchResponse.parse(body).places.map((p) => ({
    id: p.id,
    names: p.displayName ? [p.displayName.text] : [],
    lonLat: p.location ? [p.location.longitude, p.location.latitude] : null,
  }));
}

type Details = z.infer<typeof detailsResponse>;

export function parseDetails(body: unknown): Details {
  return detailsResponse.parse(body);
}

export function toReviews(details: Details): Review[] {
  return details.reviews.flatMap((r) => {
    const text = (r.text ?? r.originalText)?.text.trim();
    // A rating with nothing written is not a review to show.
    if (!text) return [];
    return [
      {
        id: r.name,
        rating: r.rating,
        // Google supplies no rating graphic: the panel writes "4/5".
        ratingIcon: null,
        title: null,
        text,
        publishedAt: r.publishTime,
        tripType: null,
        author: r.authorAttribution?.displayName ?? null,
        url: r.googleMapsUri ?? r.authorAttribution?.uri ?? null,
      },
    ];
  });
}

/** A photograph, once its address is known. Its author is its credit. */
export function toPhoto(
  photo: Details["photos"][number],
  uri: string,
  page: string,
): Photo {
  const [author] = photo.authorAttributions;
  return {
    // Prefixed so it cannot meet another source's id in one strip.
    id: `google:${photo.name}`,
    url: uri,
    width: photo.widthPx ?? 4,
    height: photo.heightPx ?? 3,
    caption: null,
    by: null,
    // The address is what is kept; the picture is Google's, fetched from Google
    // by the browser each time and never copied here.
    unoptimized: true,
    credit: {
      text: author?.displayName ? `${author.displayName} · ${name}` : name,
      url: author?.uri ?? page,
    },
  };
}

export function toEnrichment(
  details: Details,
  reviews: Review[],
  photos: Photo[],
): Enrichment | null {
  const url = details.googleMapsUri;
  // Every figure links to the page it came from; without one there is nothing
  // to attribute it to, and nothing is shown.
  if (!url) return null;
  return {
    source: { name, url },
    rating:
      details.rating !== undefined && details.userRatingCount !== undefined
        ? {
            value: details.rating,
            count: details.userRatingCount,
            icon: null,
          }
        : null,
    ranking: null,
    url,
    reviews,
    photos,
  };
}

/** The status a reply carries, as the reason it is. */
export function classify(status: number): EnrichFailure {
  // 403 is a key that is restricted, not enabled for this API, or has no billing.
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "no-match";
  if (status === 429) return "rate-limited";
  return "upstream";
}

type Reply = { ok: true; body: unknown } | { ok: false; reason: EnrichFailure };

export function googlePlaces(options: {
  key: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): PlaceEnricher {
  const { key, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  async function call(
    path: string,
    fields: string | null,
    params: Record<string, string | number | boolean> = {},
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
          "X-Goog-Api-Key": key,
          // Google bills by field: the mask is the whole of what is asked for.
          ...(fields ? { "X-Goog-FieldMask": fields } : {}),
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

  /** The keyless address of a photograph, or nothing: one that fails is dropped. */
  async function addressOf(photo: Details["photos"][number]) {
    const reply = await call(`/${photo.name}/media`, null, {
      maxWidthPx: PHOTO_WIDTH_PX,
      skipHttpRedirect: true,
    });
    if (!reply.ok) return null;
    const parsed = mediaResponse.safeParse(reply.body);
    return parsed.success ? parsed.data.photoUri : null;
  }

  return {
    provider: "google",
    configured: Boolean(key),

    async search(place: PlaceIdentity): Promise<SearchOutcome> {
      const [longitude, latitude] = place.lonLat;
      const reply = await call(
        "/places:searchText",
        "places.id,places.displayName,places.location",
        {},
        {
          textQuery: place.name.slice(0, 300),
          languageCode: "en",
          regionCode: "GE",
          maxResultCount: SEARCH_RESULTS,
          locationBias: {
            circle: { center: { latitude, longitude }, radius: BIAS_RADIUS_M },
          },
        },
      );
      if (!reply.ok) return reply;
      try {
        return { ok: true, candidates: toCandidates(reply.body) };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },

    async read(placeId): Promise<EnrichOutcome> {
      const reply = await call(
        `/places/${encodeURIComponent(placeId)}`,
        "id,rating,userRatingCount,googleMapsUri,reviews,photos",
        { languageCode: "en" },
      );
      // The rating is the heart of it: without it there is nothing to show,
      // and why not is what the caller is told.
      if (!reply.ok) return reply;

      try {
        const details = parseDetails(reply.body);
        const page = details.googleMapsUri;
        if (!page) return { ok: false, reason: "no-match" };

        const wanted = details.photos.slice(0, PHOTOS);
        const addresses = await Promise.all(wanted.map(addressOf));
        const photos = wanted.flatMap((photo, i) => {
          const uri = addresses[i];
          return uri ? [toPhoto(photo, uri, page)] : [];
        });

        const enrichment = toEnrichment(details, toReviews(details), photos);
        return enrichment
          ? { ok: true, enrichment }
          : { ok: false, reason: "no-match" };
      } catch {
        return { ok: false, reason: "malformed" };
      }
    },
  };
}
