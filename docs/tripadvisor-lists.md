# Tripadvisor lists: rating the places a trip is built from

Trip generation prefers places travellers rate well (src/bll/ratings.ts). Google's part of that is one
Text Search per town and kind ("best restaurants in Tbilisi"), which returns **20** places: a whole
city's restaurants, rated, were twenty. Tripadvisor's own lists for a destination run to thousands,
ranked, so the planner now rates by them too, read in depth and kept.

## What a trip sees

For each destination and kind (restaurants, sights; hotels stay on Google's twenty):

- the stored Tripadvisor list (up to **150 restaurants** and **80 things to do**, best ranked first) and
  Google's list are both matched to the catalogue with `rateCatalogue`, the same name-and-pin test the
  place panel uses;
- a place both rate takes **Tripadvisor's rating, review count and rank in its town**; a place only
  Google rates keeps Google's;
- the model sees `rating`, `reviews` and `townRank` ("#12 of 3104"), and is asked to prefer a meal near
  the top of its town's list (src/infra/openai-composer.ts);
- the fallback picks, among well-rated places in walking distance, the one its town ranks higher
  (`standing()` in src/domain/catalogue/ratings.ts: log scale, so #1 and #10 differ far more than
  #1,500 and #1,600).

## How the lists are read

[src/infra/apify-tripadvisor.ts](../src/infra/apify-tripadvisor.ts) runs Apify's Tripadvisor scraper
(`maxcopell/tripadvisor`) for one destination and kind: `query: "<name>, Georgia"`, best first, to the
depth in `LISTING_DEPTH` ([src/domain/catalogue/listings.ts](../src/domain/catalogue/listings.ts)).
Items keep rating, review count, rank (the "#N of M" the site shows wins over the actor's own
denominator) and link; anything unplaced, outside Georgia or of the wrong kind is dropped. Photos and
business leads, each charged separately, are switched off. A destination's list is replaced whole in
`tripadvisor_listing` (`city` holds the destination slug); an empty read changes nothing.

A read takes minutes, so it never happens inside a trip:

- **On demand.** A trip that finds a destination without lists asks for them
  (`requestListings`, at most once a week per destination) and is planned without them; the next
  trip there has them.
- **In the queue.** Each list is a `tripadvisor-list` job: it starts the read and re-queues itself
  two minutes on, then keeps the list when the read has finished, giving up after 30 checks.
- **Monthly.** `/api/cron/tripadvisor-lists` (Trigger.dev, 04:00 Tbilisi on the 1st) reads every
  destination that has lists again.
- **By hand.** `pnpm catalogue:tripadvisor -- --destination tbilisi` (or `--listed`) reads in one
  sitting; `--kind restaurant --max 20` for a cheap look.

## Setting it up

1. An account at apify.com (free); Settings → API & Integrations → copy the API token.
2. `APIFY_TOKEN` in `.env` and in Vercel. Unset, places are rated by Google alone and nothing is asked.
3. `pnpm catalogue:tripadvisor -- --destination tbilisi --kind restaurant --max 20` as a first check.

## What it costs

The actor charges per place read: **$0.005 each on Apify's free plan**, down to $0.00125 on its top
tier (live price list, 2026-11-03; the "$2 per 1,000" on its page is a paid tier's). A destination's
two lists are up to 230 places, **about $1.15** to read and again each month. Twenty destinations in
use is about $23 a month on the free plan. Change the depths in `LISTING_DEPTH` to spend less.

## Terms

This reads Tripadvisor's website through a scraper, which **Tripadvisor's terms forbid**. The owner
chose it on **2026-11-03**, having been told, because Terra's Discover key returns no rankings and
rankings are what make a restaurant list useful. It is kept apart from the Terra key
([tripadvisor.md](tripadvisor.md)): no scraper call uses it. What is stored is the list.

**To stop:** unset `APIFY_TOKEN` (trips rate by Google alone, and ask for nothing), remove the
`tripadvisor-lists` schedule, and `DELETE FROM tripadvisor_listing`.

## Not known yet

- **Whether the actor reads Georgian destinations as documented.** It has not run against the live
  API (no token yet). The first `--destination tbilisi --kind restaurant --max 20` answers it,
  including whether `"<name>, Georgia"` finds the right place for regions such as Kakheti or Guria.
- Match rate against the catalogue, and how many small-town listings fall under `MIN_REVIEWS` (30).
