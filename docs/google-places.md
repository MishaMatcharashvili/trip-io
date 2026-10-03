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

As with Tripadvisor, `chooseMatch` (domain) needs the name and the pin to agree before a result is
believed: the search bias is a preference, not a fence.

**Why photographs are resolved on the server.** A photograph is a *name*, not an address, and fetching
it needs the key. Putting the key in an `<img src>` would publish it. Asking for `skipHttpRedirect`
returns a `googleusercontent.com` address that carries no key, which the browser and `next/image` can
fetch freely. Each resolution is a billed call, hence the cap of six; one that fails is dropped.

## Terms, and what this build does about them

As the terms were read when this was written (re-read them: they change):

| Term | Where it bites |
|---|---|
| **Only a place's identifier may be stored.** Other content — reviews, photographs, ratings — may not be cached or stored beyond what serving a request needs. | Google is **never kept**: no Redis, no Postgres, `Cache-Control: no-store`. `place_external` keeps the place id and nothing else. *Unlike Tripadvisor, there is no owner decision to depart from this.* Every open place is billed. |
| **Attribution.** Google-sourced content must show "Google Maps", and reviews and photographs credit their authors. | The source is named "Google Maps" in the section heading and the "See all" link; each review shows its author and links to Google Maps; each photograph is credited `Author · Google Maps` and links to the author's profile. |
| **Place ids can go stale.** | A `404` on a stored id reads as "nothing to show". It is not yet re-resolved; if it starts to show in `places.enrich` logs, clear the `place_external` row for `provider = 'google'` or add a re-search on `no-match` from `read`. |

One residue worth knowing: the `next/image` optimiser keeps resized copies on the server for its
`minimumCacheTTL` (Next's default, 4 hours). That is a cache of Google's pixels. It is shorter than the
12 hours Tripadvisor's content is kept for, but it is not nothing; if Google's terms are read strictly,
serve its photographs with `unoptimized` in `Photos` (`src/features/place-voices.tsx`) at the price of
sending the 1200px original to the strip.

## What it costs

Every open place is one Details call and up to six Photos calls, and nothing is cached, so
**opening a place twice costs twice.** Limits (`src/server/routes/enrichment.ts`), overridable by
`GOOGLE_PLACES_USER_PER_DAY` and `GOOGLE_PLACES_GLOBAL_PER_DAY`: **30 places a day per traveller and
200 a day in all**, deliberately tighter than Tripadvisor's 60 and 500. The per-minute and search
limits are the same as Tripadvisor's, counted separately per provider. Check the current per-SKU
prices and free monthly allowances for the account before raising them; set a budget alert in Google
Cloud as well, because an alert only emails — the limits above are what actually stop spending.

## Not known yet

- Whether Google's replies match the reference's shapes (the parsers fail closed: `malformed`, never a guess).
- The host photographs are served from (`pnpm smoke:google-places` prints it).
- Match rate outside Tbilisi, and for places whose catalogue name is a Georgian romanisation.
