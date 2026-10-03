# Tripadvisor (Terra): ratings, reviews and photos on a place

What a traveller sees about a place beyond what the catalogue holds — a rating, a strip of pictures,
a few reviews — comes from Tripadvisor's Terra API. Reference: <https://docs.terra.tripadvisor.com>.
Written 2026-10-02 from that reference; **nothing here has run against the live API yet** (no key).
`pnpm smoke:tripadvisor` is how to find out.

## What the terms say, and where this departs from them

| Term | Where it bites |
|---|---|
| **Caching policy: only the Location ID may be stored.** Everything else — text, images, data — may not be "cached, copied, downloaded, stored or indexed", "except as explicitly provided in your contract". No TTL is given. | **This build keeps the content anyway**, in Redis, for 12 hours, on the owner's decision of 2026-10-02 (see below). The id is kept in Postgres as before. |
| **Review implementation policy:** reviews never appear in page source. | `PlaceVoices` is a client component that fetches `/api/places/:id/enrichment` and draws from state; `robots.ts` disallows `/api/`. Never render a review in a server component. |
| **Every figure links back, with its rating graphic and date.** | The panel uses the provider's own `icon_url`s and links the rating, each long review and "See all" to the place's page. Brand guidelines page was not readable when this was written: check it before launch. |
| **Allowlist.** The reference says a place found in the catalogue 404s on details until its id is on your allowlist. | **Not needed on a Discover key, and not used.** Checked live on 2026-10-02: details and reviews answered 200 for a place that was never allowed, while `POST /allowlist` answered 429 ("Rate Limit was exceeded for provided API Key") to a single append — it is rate-limited separately and the reference says to batch ids rather than send one per request. If a key ever does need it, the answer is a batch job, not a call per place. |

### The caching decision

The reading above was shown to the owner, who chose to cache regardless. It is a known departure
from the policy's letter, with a bounded blast radius:

- **Where:** Redis (Upstash, over REST), keyed by place id, never by traveller. Not in Postgres, not in
  the browser (`Cache-Control: no-store`), not in Next's data cache (`cache: "no-store"` on the fetch).
- **How long:** `TRIPADVISOR_CONTENT_TTL_S`, 12 hours unset. Every `SET` carries an `EX`, so nothing
  outlives it. A failure is kept 30 seconds, so a struggling provider is not hammered.
- **To stop:** set `TRIPADVISOR_CONTENT_TTL_S=0`, or unset the two `UPSTASH_*` variables. Nothing
  else changes; the panel reads the provider each time, as it did first.
- **To make it legitimate:** ask Tripadvisor for a contract term, or a written exception, that
  permits it. Until then, the exposure is theirs to enforce (their terms mention audits and licence
  termination for review policy violations; they say nothing different about caching).
- **Why Redis, not `use cache`:** Next's in-memory `use cache` lives in one serverless instance and
  dies with it, so on Vercel it would hit almost never; `use cache: remote` is shared but ties the
  design to the platform's handler and its fees. A port (`KeptContent`) with a Redis behind it is
  explicit, testable with fakes, and has a TTL we set.

## Photographs come from Wikimedia Commons, not from here

Tripadvisor's own photos are shown if it has them, but the panel's photographs
are mostly **Wikimedia Commons**: freely licensed, no key, no cost, and (unlike
Tripadvisor's content) allowed to be kept, so `src/bll/place-photos.ts` holds
what it finds for 15 minutes. It is a separate request (`GET /api/places/:id/photos`),
so a review provider that is down, unconfigured or over its limit does not hide
them. Every photograph carries who took it, its licence and a link to where it
lives, because the licences ask for the credit.

The one thing that needs care is *relevance*. A search by location returns what is
near the place, not what is the place — around Narikala it is the mosque beside
it — so `src/domain/catalogue/photos.ts` keeps only a photograph whose title or
description names the place: every identifying word of a short name, half of a
long one, never the city's name or a street's, and never a map or a logo. What no
photograph names, the place has none of: most hotels and cafés show no photos, which
is the right answer. The catalogue sometimes holds a landmark under its
Georgian-romanised name ("Gergetis Samebis Eklesia"), which no English title
contains; those find nothing. `pnpm smoke:wikimedia` checks the live API.

## How photographs are drawn

Tripadvisor's `original_size_url` is the photographer's original: checked live on 2026-10-03, a
Narikala photo was 5106×3426 and the strip draws it 150px wide. The strip and the full-screen viewer
(`src/features/photo-viewer.tsx`) therefore go through `next/image`, which resizes to the slot as
WebP/AVIF; `images.remotePatterns` in `next.config.ts` lists the hosts allowed (Tripadvisor's is
`dynamic-media.tacdn.com`). The optimiser keeps its resized copies on the server for Next's default
4 hours: a cache of Tripadvisor's pixels, shorter than the 12-hour content cache above and under the same
decision. Setting `unoptimized` on the images turns it off.

The viewer is the tap on any photo in the strip: arrow keys, buttons or a swipe page through them, and
the credit link stays with the picture.

Google Maps now sits beside this in the same panel: `docs/google-places.md`.

## The flow

```
open a place ──▶ PlaceVoices (client): near the screen, then 400 ms settled, abortable
                   │  GET /api/places/:id/enrichment        (session, no-store)
                   ▼
              enrichPlace (bll): not configured? → user limits → share an in-flight call
                   │  Redis hit? ───────────────────────────────────────▶ served, free
                   │  miss:  place_external known?  matched → id
                   │                                none, < 30 days → nothing to show
                   │                                else search → chooseMatch → store id
                   │         global day limit (counted only here)
                   │         provider.read(id): details ‖ reviews ‖ photos
                   │  SET with EX (12 h; 30 s for a failure) — a Redis that is down is a miss
                   ▼
```

`chooseMatch` (domain) needs the name and the location to agree: a wrong match puts someone else's
reviews on a stop. Catalogue search has no radius, so the answer is checked against the place's own
coordinates.

## What it costs

Discover tier: the first 1,000 billable entities per account are free, once. After that $0.015 each
(less at volume). **An entity is one location returned by a successful call**, so:

- a search returns up to five (`size=5`, not the default 20);
- opening a place is three (details, reviews, photos);
- a place that matched nothing costs its search once, then nothing for 30 days;
- **a place served from Redis costs nothing and is not counted against the day's total.** The
  traveller's own limit still counts it, so a script cannot scrape through the cache.

Limits (`src/bll/place-enrichment.ts`, overridable by `TRIPADVISOR_USER_PER_DAY`,
`TRIPADVISOR_GLOBAL_PER_DAY`): 10 a minute and 60 a day per traveller, 40 lookups a minute and 500
places a day in all (misses only) — about $22 a day at the ceiling, once the free allowance is gone. Terra's own
limits: 10 requests/s and 10,000/day, but **1 request/s with a burst of 5 for the search endpoints**,
which is why lookups have a limit of their own. A 429 is shown as "busy, try again" and never retried
by itself.

## Setting it up

1. Register at the Tripadvisor developer portal for a Terra (Discover) key.
2. `TRIPADVISOR_API_KEY` in `.env` (and in Vercel).
3. An Upstash Redis (Vercel's Redis integration creates one and sets `UPSTASH_REDIS_REST_URL` and
   `_TOKEN`). Without one the panel works but every visit spends.
4. `pnpm db:migrate` — adds `place_external` (migration `0015`).
5. `pnpm smoke:tripadvisor` — reads four known places; ~35 billable entities.
6. Watch the `places.enrich` log lines: `result` is `ok`, `shared`, or the failure. A hit is not
   logged separately: a falling `ok` count with steady traffic is the cache working.

## Not known yet

- Whether Terra's replies match the reference's shapes (the parsers fail closed: `malformed`, never a guess).
- Coverage and match rate outside Tbilisi. Measure it on a sample of verified places before relying on it.
- Whether Redis helps as much as hoped: places are visited a few times each, so the hit rate depends
  on how many travellers share places. Measure before trusting the cost ceiling.
- Whether a Georgian-script-only name finds anything: the search query is `place.name`, which is
  usually the Latin form; `nameKa` is used only to judge candidates.
