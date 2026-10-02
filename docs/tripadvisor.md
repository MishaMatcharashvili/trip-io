# Tripadvisor (Terra): ratings, reviews and photos on a place

What a traveller sees about a place beyond what the catalogue holds — a rating, a strip of pictures,
a few reviews — comes from Tripadvisor's Terra API. Reference: <https://docs.terra.tripadvisor.com>.
Written 2026-10-02 from that reference; **nothing here has run against the live API yet** (no key).
`pnpm smoke:tripadvisor` is how to find out.

## What the terms allow, and what that decided

| Term | Where it bites |
|---|---|
| **Caching policy: only the Location ID may be stored.** Everything else — text, images, data — may not be cached, copied, downloaded, stored or indexed. | There is no content cache anywhere: not in Postgres, not in a module, not in the browser's storage, not in Next's data cache, not in an HTTP cache (`Cache-Control: no-store`, `cache: "no-store"`). `place_external` holds the id and nothing else. A place opened twice is read twice. |
| **Review implementation policy:** reviews never appear in page source. | `PlaceVoices` is a client component that fetches `/api/places/:id/enrichment` and draws from state; `robots.ts` disallows `/api/`. Never render a review in a server component. |
| **Every figure links back, with its rating graphic and date.** | The panel uses the provider's own `icon_url`s and links the rating, each long review and "See all" to the place's page. Brand guidelines page was not readable when this was written: check it before launch. |
| **Unlicensed ids are invisible.** A place found in the catalogue 404s on details until its id is on your allowlist. | `allow` (an `APPEND`) runs before the first read, and the id is stored only after it succeeded. |

If a contract with Tripadvisor ever permits caching ("except as explicitly provided in your contract"),
the place to add it is `enrichPlace` in `src/bll/place-enrichment.ts`, behind the same port.

## The flow

```
open a place ──▶ PlaceVoices (client): near the screen, then 400 ms settled, abortable
                   │  GET /api/places/:id/enrichment        (session, no-store)
                   ▼
              enrichPlace (bll): not configured? → user limits → share an in-flight call
                   │  place_external known?  matched → id
                   │                          none, < 30 days → nothing to show
                   │                          else search → chooseMatch → allow → store id
                   │  global day limit
                   ▼
              provider.read(id): details ‖ reviews ‖ photos      (rating survives the others failing)
```

`chooseMatch` (domain) needs the name and the location to agree: a wrong match puts someone else's
reviews on a stop. Catalogue search has no radius, so the answer is checked against the place's own
coordinates.

## What it costs

Discover tier: the first 1,000 billable entities per account are free, once. After that $0.015 each
(less at volume). **An entity is one location returned by a successful call**, so:

- a search returns up to five (`size=5`, not the default 20);
- opening a place is three (details, reviews, photos);
- a place that matched nothing costs its search once, then nothing for 30 days.

Limits (`src/bll/place-enrichment.ts`, overridable by `TRIPADVISOR_USER_PER_DAY`,
`TRIPADVISOR_GLOBAL_PER_DAY`): 10 a minute and 60 a day per traveller, 40 lookups a minute and 500
places a day in all — about $22 a day at the ceiling, once the free allowance is gone. Terra's own
limits: 10 requests/s and 10,000/day, but **1 request/s with a burst of 5 for the search endpoints**,
which is why lookups have a limit of their own. A 429 is shown as "busy, try again" and never retried
by itself.

## Setting it up

1. Register at the Tripadvisor developer portal for a Terra (Discover) key.
2. `TRIPADVISOR_API_KEY` in `.env` (and in Vercel).
3. `pnpm db:migrate` — adds `place_external` (migration `0015`).
4. `pnpm smoke:tripadvisor` — reads four known places; ~35 billable entities.
5. Watch the `places.enrich` log lines: `result` is `ok`, `shared`, or the failure.

## Not known yet

- Whether Terra's replies match the reference's shapes (the parsers fail closed: `malformed`, never a guess).
- Coverage and match rate outside Tbilisi. Measure it on a sample of verified places before relying on it.
- Whether a Georgian-script-only name finds anything: the search query is `place.name`, which is
  usually the Latin form; `nameKa` is used only to judge candidates.
