# Market & data constraints — researched facts

External facts that constrain the build. Verified Sept 2026. Re-check anything here before betting
on it — these move.

## Competitive landscape

- **Google AI Mode (27 Aug 2026)** — flight price tracking across 300+ airlines/travel sites in 180+
  countries; hotel discovery and booking with ~10 partners incl. Booking.com, Expedia, Hilton,
  Marriott; points/miles pricing. Planning is becoming a feature of search.
  https://techcrunch.com/2026/08/27/googles-ai-mode-can-now-track-flight-prices-help-book-hotels-and-more/
- **Expedia acquired Layla (Jul 2026)** — Berlin AI trip planner, had raised ~€5M since 2023, terms
  undisclosed. Skift read: acquired largely for team; openly sceptical that any standalone AI trip
  planner is meaningfully differentiated.
  https://skift.com/2026/07/31/expedia-acquired-ai-trip-planner-layla-exclusive/
- **Mindtrip** — $20M+ raised; investors include Amex Ventures, Capital One Ventures, United Airlines
  Ventures. Planning aggregator, no direct booking of its own.
- **TripIt Pro — the closest real comparable.** $49/yr. Every paid feature is monitoring: real-time
  flight alerts, terminal/gate reminders, "Go Now", alternate flights, fare-refund monitoring,
  disruption alerts. Free tier organises; paid tier intervenes. Decade-long proof that people pay for
  watching — but it watches flights, which have machine-readable status.
  https://www.tripit.com/web/pro/pricing

## Booking & affiliate reality

- **Booking.com Demand API is partner-gated.** Not self-service: signed Managed Affiliate Partner
  contract, account manager, separate "Search, Look & Book" approval for orders. General Partner
  Terms v5 require **prior written approval to use an AI system in performing the agreement**, and
  prohibit using their materials to train or improve AI. Design around this, not into it.
  https://vorplabs.com/agent-tools/booking-demand-api
- **Affiliate rate card (2026):** flights 1–3% · stays via OTA affiliate 2–6% · hotel groups direct
  3–7% · car rental 4–8% · activities (Viator, GetYourGuide) ~8% · travel insurance 10–40% of
  premium. Cookie windows 7–31 days; stays pay only after a completed stay, activities on booking
  confirmation. Commission tracks supplier gross margin almost exactly.
  https://track360.io/blog/best-travel-affiliate-programs-2026-operator-rate-card-benchmark
- **Unit economics, €700 / 7-day Georgia trip:** €5–9 realistic per completed converting trip.
  → €30k/mo needs ~100,000 planned trips/mo at 5% plan→book conversion.
  → €30k/mo needs 6,000 subscribers at €5/mo.
  Most Georgian guesthouse inventory is on no affiliate program at all.

## Place data licensing

- **Google Maps Platform prohibits** pre-fetching, caching, indexing or storing Content, with a
  narrow allowance to hold lat/lng up to 30 days for performance. A persisted canonical `Place`
  record built from Google is exactly what the terms forbid. Places pricing also lost the pooled
  $200 monthly credit in Mar 2025 — per-SKU free allowances only.
- **Overture Places** is the storable source: ~74M features (Aug 2026), CDLA-Permissive 2.0 +
  Apache 2.0, no share-alike, Parquet on S3. Its own docs: contains duplicates, high junk rate, low
  property completeness. For one country that is fine — it makes the hand-curation pass small enough
  to actually do. https://docs.overturemaps.org/guides/places/

## Watch-layer signal audit (Georgia)

| Signal | Source | Machine-readable | Note |
|---|---|---|---|
| Hourly weather | Open-Meteo, free, no key | **Yes** | build on it |
| Official severe-weather warnings | MeteoAlarm, CC BY 4.0 | **No** | covers 33 EUMETNET member countries; Georgia's agency is not one |
| Flight status | commercial APIs from ~$5/mo | **Yes** | e.g. AeroDataBox |
| Rail | Georgian Railway website | **No** | low rate of change; weekly manual check |
| Road & pass closures | georoad.ge conditions page | scrape only | HTML; TLS chain does not validate cleanly |
| Marshrutka departures | nothing, anywhere | **No** | most disruption-prone part of a Georgian trip |
| Events & festivals | PredictHQ (sales-gated, no public pricing), local pages | partial | thin Georgia coverage |
| Opening-hours changes | Google (can't store), Overture | **No** | own curation + user reports |
| Strikes, protests, safety | news, government advisories | text | LLM extraction; low volume, high stakes |

Two clean feeds, two partial, five absent.

## Notification budget

Push frequency vs churn: **1–3/week stable · 4–5/week churn rising · 6+/week sharp churn.**
Clicks can keep rising while unsubscribe rate and 30-day retention worsen — activity is not progress.
A 7-day trip affords 3–5 interventions total.
https://pushpilot.ai/blog/push-notification-frequency-churn-data

## Domains checked (DNS NS lookup, Sept 2026)

- **Likely free:** roamline.io · wanderpin.io · roampin.io · routepin.io · trailpin.io · wayset.ai ·
  guideo.ai
- **Free but name clashes with an existing product:** waypin.ai/.io (waypin.app) · roamkit.ai
  (roamkit.travel, Orange RoamKit)
- **Brokered / parked, probably purchasable:** wandr.ai (Afternic) · tourly.ai · tripora.ai
- **Registered:** trip.io · tripio.ai · tripio.io · roam.ai · voya.ai · sojo.ai · wayfare.ai ·
  vayo.ai · trayl.ai · itinero.ai · kompa.ai · wayfind.ai · tripo.ai · guida.ai · voyara.ai ·
  waypt.ai · waypt.io · wayly.ai · roamly.ai · roamly.io · tripkit.ai · pointo.ai

Method caveat: NXDOMAIN means no delegation — strong but imperfect. Confirm at a registrar, and run
EUIPO / USPTO / Sakpatenti trademark checks before spending on design.