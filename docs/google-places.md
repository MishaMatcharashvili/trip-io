# Google Places: a second rating, reviews and photos on a place

Beside Tripadvisor's (`docs/tripadvisor.md`), the place panel shows what Google Maps says: a rating,
a few reviews and photographs, under the name **Google Maps**. It is the Places API (New), reference
<https://developers.google.com/maps/documentation/places/web-service>. Written 2026-10-03 from that
reference; **nothing here has run against the live API yet** (the key was not in `.env` when this was
built). `pnpm smoke:google-places` is how to find out.

## Setting it up

1. Google Cloud → APIs & Services: enable **Places API (New)** (not the legacy "Places API") and
   billing on the project.
2. Create an API key and **restrict it to Places API (New)**. It is a server key, sent in a header from
   `src/infra/google-places.ts` and nowhere else; do not restrict it by HTTP referrer, because the
   calls come from the server.
3. `GOOGLE_PLACES_API_KEY` in `.env` (and in Vercel). Unset, the panel shows Tripadvisor's alone.
4. `pnpm smoke:google-places` — four known places, about 32 billed calls. It also prints the host the
   photographs are served from; that must match `images.remotePatterns` in `next.config.ts`
   (`*.googleusercontent.com` is a guess from the reference).

## What is asked for

Google bills by the call and by the **fields requested**, so each call carries a field mask of exactly
what is used.

| Step | Call | Fields |
|---|---|---|
| Find the place (once per place; the id is kept in `place_external`) | Text Search, biased to the place's pin, 5 results | `id`, `displayName`, `location` |
| Open a place | Place Details | `id`, `rating`, `userRatingCount`, `googleMapsUri`, `reviews`, `photos` |
| Each photograph shown (at most 6) | Place Photos with `skipHttpRedirect=true`, 1200px wide | the keyless `photoUri` |
| Plan a trip: a destination's best-rated places (once per destination and kind, kept, see below) | Text Search, "best restaurants in Kutaisi, Georgia" with `includedType` `restaurant`, `lodging` or `tourist_attraction`, biased 20 km around the destination, a page of 20 | `id`, `displayName`, `location`, `rating`, `userRatingCount` |

As with Tripadvisor, `chooseMatch` (domain) needs the name and the pin to agree before a result is
believed: the search bias is a preference, not a fence.

**Why photographs are resolved on the server.** A photograph is a *name*, not an address, and fetching
it needs the key. Putting the key in an `<img src>` would publish it. Asking for `skipHttpRedirect`
returns a `googleusercontent.com` address that carries no key, which the browser and `next/image` can
fetch freely. Each resolution is a billed call, hence the cap of six; one that fails is dropped.

### Ratings for the planner

Trip generation asks, for each destination on the route, which restaurants, hotels and sights
travellers rate best (`src/bll/ratings.ts`, port `RatingSource`, adapter `googleRatings`). Each
listing is matched to a catalogue place by `rateCatalogue` (`src/domain/catalogue/ratings.ts`), the
same name-and-pin test as above, and the composer sees `rating` and `reviews` on the matched
candidates; the template plan prefers them for lunch and the night when they are as near. A place
the catalogue does not hold is never planned, however well rated, and fewer than 30 reviews is no
rating. Without the key, over the day's searches or with Google down, the trip is planned without
ratings, as before.

- **Billed tier.** Asking for `rating` and `userRatingCount` puts these searches in a dearer Text
  Search tier than the place-finding search, which asks for neither. Check the price for the account.
- **Kept** in Redis per provider, destination and kind (`place-ratings:v1:google:kutaisi:restaurant`)
  for `GOOGLE_PLACES_CONTENT_TTL_S`, the same 60 days as the panel's answers and the same departure
  from the terms' letter. Only a list is kept; a failure is asked again by the next trip. Nothing goes
  to Postgres.
- **Ceiling:** 300 searches a UTC day, everyone together (`RATING_SEARCHES_PER_DAY`, counted in
  `usage_window` as `ratings:google`), counted only when a search is made. With Redis, a destination
  costs three searches once per 60 days.

## Terms, and what this build does about them

As the terms were read when this was written (re-read them: they change):

| Term | Where it bites |
|---|---|
| **Only a place's identifier may be stored.** Other content — reviews, photographs, ratings — may not be cached or stored beyond what serving a request needs. | **This build keeps the content anyway**, in Redis, for **60 days**, on the owner's decision of 2026-10-03. The id is kept in Postgres as before. It is a known departure from the letter, as Tripadvisor's 12-hour cache is (`docs/tripadvisor.md`), and a longer one. |
| **Attribution.** Google-sourced content must show "Google Maps", and reviews and photographs credit their authors. | The source is named "Google Maps" in the section heading and the "See all" link; each review shows its author and links to Google Maps; each photograph is credited `Author · Google Maps` and links to the author's profile. |
| **Place ids can go stale.** | A `404` on a stored id reads as "nothing to show". It is not yet re-resolved; if it starts to show in `places.enrich` logs, clear the `place_external` row for `provider = 'google'` or add a re-search on `no-match` from `read`. |

### The caching decision

- **Where:** Redis (Upstash), keyed by provider and place id, never by traveller. Not in Postgres, not in
  the browser (`Cache-Control: no-store`), not in Next's data cache (`cache: "no-store"` on the fetch).
- **How long:** `GOOGLE_PLACES_CONTENT_TTL_S`, 60 days unset. Every `SET` carries an `EX`. A failure is
  kept 30 seconds. Without the `UPSTASH_*` variables nothing is kept.
- **To stop:** set `GOOGLE_PLACES_CONTENT_TTL_S=0`, or unset the Upstash variables.
- **Photographs are resized and kept for 60 days too:** `next/image` keeps its resized copies for
  `images.minimumCacheTTL` (`next.config.ts`), 60 days, again on the owner's decision. Google's photographs
  go through it like the others. To stop that for Google alone, serve its photographs `unoptimized` in
  `PhotoTile` (`src/features/place-voices.tsx`), at the price of sending the 1200px image to the strip.
- **Risk to measure: photograph addresses may expire.** What is kept for a place includes each photograph's
  `googleusercontent.com` address, and the reference does not say how long one lives. A photograph the
  optimiser has already fetched is safe for its 60 days; one not yet fetched (scrolled past, or never
  opened full screen) is not, and a dead address drops out of the strip silently. If, a day or more after
  opening a place, its Google photographs go missing, shorten `GOOGLE_PLACES_CONTENT_TTL_S` to the
  addresses' lifetime. (The smoke script checks that an address loads; it cannot say how long.)

## What it costs

A place opened for the first time is one Details call and up to six Photos calls. **One served from
Redis costs nothing and is not counted against the day's total**; the traveller's own limit still
counts it. Limits (`src/server/routes/enrichment.ts`), overridable by `GOOGLE_PLACES_USER_PER_DAY` and
`GOOGLE_PLACES_GLOBAL_PER_DAY`: **30 places a day per traveller and 200 a day in all** (misses only),
deliberately tighter than Tripadvisor's 60 and 500 because a miss is dearer. The per-minute and search
limits are the same as Tripadvisor's, counted separately per provider. Check the current per-SKU prices
and free monthly allowances for the account before raising them; set a budget alert in Google Cloud as
well, because an alert only emails — the limits above are what actually stop spending.

## Not known yet

- Whether Google's replies match the reference's shapes (the parsers fail closed: `malformed`, never a guess).
- The host photographs are served from (`pnpm smoke:google-places` prints it).
- Match rate outside Tbilisi, and for places whose catalogue name is a Georgian romanisation.
