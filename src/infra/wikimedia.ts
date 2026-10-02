import { z } from "zod";
import type {
  EnrichFailure,
  Photo,
  PhotoOutcome,
  PhotoSource,
  PlaceIdentity,
} from "../domain/catalogue/enrichment.ts";
import {
  type PhotoCandidate,
  selectPhotos,
} from "../domain/catalogue/photos.ts";

// Wikimedia Commons, behind the domain's PhotoSource port: freely licensed
// photographs, which need no key and cost nothing, and which may be kept (their
// licences ask for credit, not for silence — every photo carries who took it,
// under what, and where it lives).
//
// Two questions are asked and their answers merged:
//   * what is photographed near the place (geosearch), and
//   * what is called by the place's name (full-text search).
// Neither is trusted alone. A search by location returns what is nearby, not what
// is this — around Narikala it is its neighbour the mosque — so the domain
// (selectPhotos) keeps only a photograph that names the place. The first finds
// what is tagged where it was taken; the second what is not tagged at all.
//
// Wikimedia asks for a User-Agent that says who is calling, and for calls to be
// made one at a time. This sends both queries together, which its etiquette
// allows for a call a person triggered; it never loops.

const ORIGIN = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "trip.io/1 (https://github.com/MishaMatcharashvili/trip-io; place photos)";
const TIMEOUT_MS = 6_000;
/** Geosearch's own ceiling is 10 km; a kilometre is further than any one place. */
const RADIUS_M = 1_000;
const THUMB_PX = 640;
const MIN_WIDTH = 600;

const text = z.object({ value: z.string() }).optional();

const pagesResponse = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          pageid: z.number(),
          title: z.string(),
          coordinates: z
            .array(z.object({ lat: z.number(), lon: z.number() }))
            .optional(),
          imageinfo: z
            .array(
              z.object({
                thumburl: z.string().optional(),
                thumbwidth: z.number().optional(),
                thumbheight: z.number().optional(),
                width: z.number().optional(),
                mime: z.string().optional(),
                descriptionurl: z.string().optional(),
                extmetadata: z
                  .object({
                    ImageDescription: text,
                    ObjectName: text,
                    Artist: text,
                    LicenseShortName: text,
                  })
                  .partial()
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

/** Wikimedia's text fields are HTML: a name inside a link, a description with markup. */
export function plain(html: string | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "File:Narikala Fortress, Tbilisi.jpg" as what it is called. */
const nameOf = (title: string) =>
  title
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]{3,4}$/i, "")
    .replace(/_/g, " ");

const KEEP = new Set(["image/jpeg", "image/png"]);

/** The pages of a reply as candidates, minus what is not a photograph worth showing. */
export function toCandidates(body: unknown): PhotoCandidate[] {
  const pages = pagesResponse.parse(body).query?.pages ?? [];
  return pages.flatMap((page): PhotoCandidate[] => {
    const info = page.imageinfo?.[0];
    if (
      !info?.thumburl ||
      !info.descriptionurl ||
      !info.mime ||
      !KEEP.has(info.mime) ||
      (info.width ?? 0) < MIN_WIDTH ||
      !info.thumburl.startsWith("https://")
    ) {
      return [];
    }
    const meta = info.extmetadata;
    const artist = plain(meta?.Artist?.value);
    const licence = plain(meta?.LicenseShortName?.value);
    const objectName = plain(meta?.ObjectName?.value);
    const photo: Photo = {
      id: `wm:${page.pageid}`,
      url: info.thumburl,
      width: info.thumbwidth ?? 4,
      height: info.thumbheight ?? 3,
      caption: objectName || null,
      by: null,
      credit: {
        text:
          [artist, licence].filter(Boolean).join(" · ") || "Wikimedia Commons",
        url: info.descriptionurl,
      },
    };
    const where = page.coordinates?.[0];
    return [
      {
        photo,
        labels: [
          nameOf(page.title),
          objectName,
          plain(meta?.ImageDescription?.value),
        ],
        lonLat: where ? [where.lon, where.lat] : null,
      },
    ];
  });
}

const FIELDS = {
  action: "query",
  format: "json",
  formatversion: "2",
  prop: "imageinfo|coordinates",
  iiprop: "url|mime|size|extmetadata",
  iiurlwidth: String(THUMB_PX),
  iiextmetadatafilter: "ImageDescription|Artist|LicenseShortName|ObjectName",
  colimit: "50",
} as const;

export function wikimediaPhotos(
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): PhotoSource {
  const { timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  async function ask(
    extra: Record<string, string>,
  ): Promise<
    { ok: true; body: unknown } | { ok: false; reason: EnrichFailure }
  > {
    const url = new URL(ORIGIN);
    for (const [k, v] of Object.entries({ ...FIELDS, ...extra })) {
      url.searchParams.set(k, v);
    }
    let res: Response;
    try {
      res = await send(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return { ok: false, reason: timedOut ? "timeout" : "upstream" };
    }
    if (res.status === 429) return { ok: false, reason: "rate-limited" };
    if (!res.ok) return { ok: false, reason: "upstream" };
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return { ok: false, reason: "malformed" };
    }
  }

  return {
    async find(place: PlaceIdentity): Promise<PhotoOutcome> {
      const [lat, lon] = [place.lonLat[1], place.lonLat[0]];
      const [near, named] = await Promise.all([
        ask({
          generator: "geosearch",
          ggscoord: `${lat}|${lon}`,
          ggsradius: String(RADIUS_M),
          ggslimit: "50",
          ggsnamespace: "6",
          ggsprimary: "all",
        }),
        ask({
          generator: "search",
          gsrsearch: `${place.name} filetype:bitmap`,
          gsrnamespace: "6",
          gsrlimit: "20",
        }),
      ]);

      // One of the two failing costs half the photographs; both failing costs
      // all of them, and the reason is the first's.
      if (!near.ok && !named.ok) return near;
      const candidates: PhotoCandidate[] = [];
      for (const reply of [near, named]) {
        if (!reply.ok) continue;
        try {
          candidates.push(...toCandidates(reply.body));
        } catch {
          // A reply that does not fit is dropped, not guessed at.
        }
      }
      return { ok: true, photos: selectPhotos(place, candidates) };
    },
  };
}
