Concept — proactive AI travel companion
Status: pre-build. Last updated 2026-09-14.

Thesis
An AI travel companion that watches the real world around a live trip and intervenes when something changes.

PLAN → WATCH → UNDERSTAND → ACT → GUIDE
Not "ask AI about your trip". The system holds trip state, monitors conditions that could affect it, filters ruthlessly for what actually matters to this traveller, and proposes a concrete change.

Canonical example:

Heavy rain starts 15:30 in Kazbegi. Your hike is at 16:00. Move it to 11:30 and shift the museum to the afternoon. [Update itinerary]

Why this framing and not "AI trip planner"
Planning is being absorbed by search. Google's AI Mode books hotels and tracks flights inside the search box as of Aug 2026. A standalone planner has no reason to be opened on day three of a trip.
Watching creates a reason to open every morning. Retention becomes a design output, not a hope.
Watching is a proven subscription business: TripIt Pro is $49/yr and every paid feature is monitoring (flight alerts, gate changes, "Go Now", disruption warnings, fare-refund tracking). Free TripIt organises; paid TripIt intervenes.
Nobody has done it for overland leisure travel, which is where the launch market is.
The three hard problems
Signal asymmetry. Roughly a third of the watch list has a machine-readable feed in Georgia. Weather and flights are clean; road closures are scrape-only; marshrutka departures have no feed in any form. See claude/market-constraints.md for the full audit. The company is the machine that turns the unstructured 70% into structure.
Notification budget. Push data: 1–3/week stable, 4–5 churn rising, 6+ sharp churn. A 7-day trip affords 3–5 interventions total. Being muted in a proactive product is permanent, not a dip. → Detection is not the product. Ranking is. Build the filter and the budget enforcer first.
False-positive asymmetry. A wrong intervention costs more than a missed one — the traveller reorganised their day around it. Rules: never auto-apply; always show evidence and source; prefer opportunity framing ("11:30 looks like the better window") over alarm framing.
Two-channel design (the key product decision)
Channel	Cadence	Contains	Cost
Daily briefing	07:30, always	everything non-urgent: weather shape, events, road notes, budget	absorbs the bulk
Interrupt	rare	one test only: does this require action in the next two hours?	draws on the push budget
The briefing is an appointment the user opted into, not an interruption. It is what makes the rest of the watch list affordable.

Business model
Free plans a trip. Paid watches it.

Planning is a one-off cost with a cache behind it, so it can be free. Watching is a recurring per-trip-day cost, which is exactly why TripIt paywalled it. This line matches where the costs actually fall and a user understands it instantly.

Affiliate revenue is a rounding error: €5–9 per converting trip means €30k/mo needs 100,000 planned trips/mo. At €5/mo subscription, €30k needs 6,000 subscribers. The watch reframe doesn't rescue the affiliate model — it makes it unnecessary.

MVP scope
One country (Georgia), English only, mobile web PWA, no bookings, no accounts until save, no achievements, no community.

Three detectors, not twelve:

Weather vs. outdoor activity — Open-Meteo, free, no key. ~60% of real interventions.
Flight status on arrival/departure legs — commercial API from ~$5/mo.
Road & pass status on the 12 curated corridors — a Telegram bot with a form, operated by hand.
On #3: be the detector before building one. It is more accurate than anything automatable this quarter (the automated source does not exist), it exercises the whole pipeline on day one, and every manual event with its accept/dismiss outcomes is labelled training data.

Wizard-of-Oz the detection. Never the delivery.

Build order (10 weeks)
Weeks 1–2 — catalogue (~600 hand-verified places) + corridor table
Weeks 3–4 — trip document + JSON Patch log
Week 5 — the pipeline, weather detector only
Week 6 — the daily briefing (ships before any interrupt exists)
Week 7 — interrupts + manual road-event form; flight status if time
Week 8 — map, checkpoints, offline
Week 9 — instrumentation (every intervention logged with outcome)
Week 10 — 100 real travellers, recruited via Tbilisi hostels + Telegram groups
Kill / continue criteria
Signal	Continue	Stop or rethink
Interventions acted on	≥ 40%	< 15%
Notifications disabled during trip	< 10%	> 25%
Briefing opened per trip-day	≥ 50%	< 20%
Interventions per trip worth sending	4–8	< 2
False-positive rate, hand-audited	< 15%	> 35%
Would pay €5/mo (asked post-trip)	≥ 25%	< 8%
Row 4 is the one people forget: if the system only ever finds 1–2 things worth saying per trip, the watch layer is a feature, not a product.

Explicitly out of v1
Achievements, community contributions, bookings of any kind, auto-applied changes (possibly never), events/strikes/opening-hours/rail detectors, SEO destination pages, a second country, native apps.

Naming
Register shifted: a planner wants route/map words; a companion that watches wants keeping-watch / looking-after words. trip.io, tripio.ai, tripio.io are all registered. wandr.ai is brokered (has a price). roamline.io is the best genuinely-free option. Avoid "pocket" — collides with Pocos/PocketOS and with the read-later app.

Positioning line: "It notices before you do."