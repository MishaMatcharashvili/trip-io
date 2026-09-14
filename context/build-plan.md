# Build plan

Status: pre-build, Phase 0. Condensed from `docs/implementation-plan.md` (revision 2) into a
checklist to work against. That document has the full reasoning for every line here — this one is
for tracking "what's next," not for re-litigating decisions.

Solo, full-time. Originally scoped against a 12-week horizon; tracked here as phases since phases
don't slip in lockstep with calendar weeks. Everything in scope except offline (cut).

## Phase 0 — foundations + procurement with latency

- [ ] Neon project with PostGIS extension enabled
- [ ] Drizzle schema, first migration (core tables from `context/architecture.md`)
- [ ] Hono mounted at `app/api/[[...route]]/route.ts`, one typed route proving the RPC client end to end
- [ ] Better Auth wired: anonymous trip in local state → account at save → trip claimed
- [ ] Vercel Pro enabled, preview deploys working, `CRON_SECRET` set
- [ ] Apple Developer enrolment started (APNs key)
- [ ] FCM project created
- [ ] Open-Meteo commercial plan account
- [ ] AeroDataBox account (dark detector, minimum tier)
- [ ] Start recruiting: line up 3–4 Tbilisi hostels for the traveller cohort in Phase 10, keep warm

## Phase 1 — catalogue and corridors

- [ ] Overture Places pulled via DuckDB from S3, filtered to Georgia bbox, written to Parquet, `COPY`'d into PostGIS
- [ ] Programmatic gate implemented: require name, category in ~40-entry allowlist, trigram dedupe within 100m, drop no-website-and-no-phone-and-no-address
- [ ] `place.tier` assignment (`raw` / `verified`) per the gate
- [ ] 600 hand-verified `curated` places: Tbilisi core, Kazbegi corridor, Kakheti, Svaneti — capture `opening_hours` while verifying
- [ ] 12-corridor table as buffered LineStrings with seasonal risk annotations
- [ ] Region decomposition for the sense loop (municipality polygons or corridors + coarse grid)

## Phase 2 — trip document and patch log

- [ ] `trip`, `trip_node`, `trip_patch`, `checkpoint_log` tables + JSON Patch application
- [ ] Append-only patch log, checkpoint every 20 patches
- [ ] Coherent-day validator (test-first): no overlapping nodes, travel time respected, nothing scheduled into darkness, opening hours honoured — re-validates the **whole day** after any patch
- [ ] Trip generation pipeline: constraints → candidate retrieval from `curated` → LLM composition → validator → patch set
- [ ] Warm-start cache on coarse constraint hash
- [ ] Invented-place-id handling: reject → retry once with rejection as feedback → template fallback; never render an unvalidated plan

## Phase 3 — the pipeline, weather only

- [ ] `world_event` table, CAP-shaped, `dedupe_key = source + kind + region + bucketed valid_from`
- [ ] `trip_watch` written on trip save
- [ ] `job` table + drain handler (`SKIP LOCKED`, stop at 240s)
- [ ] Weather sense handler (hourly, per region with a live trip)
- [ ] Match query + GiST/btree indexes
- [ ] Judge with all four validators (evidence non-empty, place_id validated, no empty-helpful verdict, confidence gate)
- [ ] Router as a pure, unit-tested function (`interrupt` / `briefing` / `drop`)
- [ ] No delivery yet — verdicts land in the DB, read manually
- [ ] Eval harness: 30 `(event, node, trip) → expected verdict` fixtures (10 fire / 10 don't / 10 ambiguous)
- [ ] **Kill-criteria check**: run the pipeline against synthetic trips over historical weather, count what the router would send. If 1–2 per trip, detector expansion becomes the whole thesis, not a later nice-to-have.

## Phase 4 — the daily briefing

- [ ] 07:30 Tbilisi cron (03:30 UTC), one model call per live trip-day
- [ ] Bundles everything routed to `briefing` + tomorrow's plan shape
- [ ] Email delivery via Resend
- [ ] In-app briefing view
- [ ] Get it in front of 3 real travellers this phase (people you know travelling in Georgia in October), ahead of the Phase 10 cohort

## Phase 5 — interrupts, budget enforcer, road form

- [ ] Budget ledger: per-trip cap 3–5 for a 7-day trip, quiet hours, two-hour-horizon test
- [ ] Interrupt path + push delivery
- [ ] Telegram bot (grammY) + road-report form against the 12 corridors
- [ ] Intervention UI: coherent-day diff, accept/reject as a unit, evidence/source always visible, opportunity framing
- [ ] `intervention.outcome` write path — same commit as the accept/dismiss button
- [ ] Decide: who may submit road reports (open question #3 in implementation-plan.md)

## Phase 6 — web client

- [ ] MapLibre + PMTiles from blob storage
- [ ] Trip creation and editing UI
- [ ] Itinerary view
- [ ] Checkpoint/undo UI
- [ ] Settings: channels, quiet hours, frequency
- [ ] Subscription paywall: free plans, paid watches
- [ ] Decide: trial length, whether first trip is watched free (open question #4)

## Phase 7 — native shell

- [ ] Expo app against the shared Hono client
- [ ] Auth, trip list, intervention card (accept/dismiss), push registration, settings
- [ ] EAS build, TestFlight + Android internal track (beta distribution — store review off critical path)

## Phase 8 — detector expansion + road-automation spike

- [ ] Detector 3 — events & festivals (local pages + extraction)
- [ ] Detector 4 — protests & safety (news RSS + extraction), **briefing-only, gated**
- [ ] Detector 5 — opening-hours (user reports + catalogue drift)
- [ ] Detector 6 — rail (weekly manual check)
- [ ] Road-automation spike: evaluate news + Roads Department Facebook extraction against Phase 5–7's real manual events; decide on evidence

## Phase 9 — instrumentation and kill-criteria dashboard

- [ ] One-page dashboard: all six kill-criteria metrics, measured not estimated
- [ ] Judge spend, pairs-per-trip-day, rejection-reason mix, radius tuning visible
- [ ] Hand-audit queue/UI for false-positive rate sampling

## Phase 10 — 100 travellers

- [ ] Onboard via Tbilisi hostels + Telegram groups
- [ ] Support loop running
- [ ] Daily dashboard review

## Things that will bite you (carried from the plan, don't relearn these the hard way)

- Judge quality is the product and can't be validated without real trips — the eval harness and the
  Phase 3 synthetic count are the only instruments before Phase 10.
- Detector 4 (protest/safety extraction) will produce a confident, wrong, alarming interrupt if let
  loose before its briefing-only gate is served.
- The 600 hand-verified places take longer than estimated. If it slips, cut coverage regions — never
  lower the verification bar.
- Serverless + Postgres connection exhaustion: use the pooled connection string, Neon's HTTP driver
  for short queries.
- Push credentials (APNs/FCM/TestFlight) have lead time — this is why they're Phase 0, not Phase 7.

See `context/progress-tracker.md` for current status against this plan, and
`docs/implementation-plan.md` for the full reasoning behind every item above (that document uses the
original week numbers this plan maps from).
