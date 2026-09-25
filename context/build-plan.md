# Build plan

Status: Phases 0–5 built; Phase 6 next. Condensed from `docs/implementation-plan.md` (revision 2) into a
checklist to work against. That document has the full reasoning for every line here — this one is
for tracking "what's next," not for re-litigating decisions.

Solo, full-time. Originally scoped against a 12-week horizon; tracked here as phases since phases
don't slip in lockstep with calendar weeks. Everything in scope except offline (cut).

## Phase 0 — foundations + procurement with latency

- [x] Neon project with PostGIS extension enabled (eu-central-1, PostGIS 3.6)
- [x] Drizzle schema, first migration (core tables from `context/architecture.md`)
- [x] Hono mounted at `app/api/[[...route]]/route.ts`, one typed route proving the RPC client end to end
- [x] Better Auth wired: anonymous trip in local state → account at save → trip claimed
- [ ] Vercel Pro enabled, preview deploys working, `CRON_SECRET` set
- [ ] Apple Developer enrolment started (APNs key)
- [ ] FCM project created
- [ ] Open-Meteo commercial plan account
- [ ] AeroDataBox account (dark detector, minimum tier)
- [ ] Start recruiting: line up 3–4 Tbilisi hostels for the traveller cohort in Phase 10, keep warm

## Phase 1 — catalogue and corridors

- [x] Overture Places pulled via DuckDB from S3, filtered to Georgia bbox, written to Parquet
- [x] …loaded into PostGIS — 64 regions, 12 corridors, 13,338 places (11,590 verified, 1,748 raw)
- [x] Programmatic gate implemented: require name, category in ~40-entry allowlist (45), trigram dedupe within 100m, drop no-website-and-no-phone-and-no-address
- [x] `place.tier` assignment (`raw` / `verified`) per the gate — OSM-counterpart signal not implemented (no OSM extract)
- [ ] 600 hand-verified `curated` places: Tbilisi core, Kazbegi corridor, Kakheti, Svaneti — capture `opening_hours` while verifying (queue built at `/curate`; 0/600)
- [x] 12-corridor table as buffered LineStrings with seasonal risk annotations (seed values — verify before Phase 5 cites them)
- [x] Region decomposition for the sense loop: 64 municipality/city polygons with poll points

## Phase 2 — trip document and patch log

- [x] `trip`, `trip_node`, `trip_patch`, `checkpoint_log` tables + JSON Patch application (migration 0002; restricted path grammar, inverse stored per patch)
- [x] Append-only patch log, checkpoint every 20 patches (and at patch 1). Undo and restore both append
- [x] Coherent-day validator (test-first): no overlapping nodes, travel time respected, nothing scheduled into darkness, opening hours honoured — re-validates the **whole day** after any patch
- [x] Trip generation pipeline: constraints → candidate retrieval from `curated` → LLM composition → validator → patch set. **Cannot produce a trip until the 600 exist** — 0 curated places means candidate retrieval returns nothing
- [x] Warm-start cache on coarse constraint hash (`plan_cache`, untimed plans, re-validated per date)
- [x] Invented-place-id handling: reject → retry once with rejection as feedback → template fallback; never render an unvalidated plan

## Phase 3 — the pipeline, weather only

- [x] `world_event` table, CAP-shaped, `dedupe_key = source + kind + region + bucketed valid_from` (3h bucket, so an hourly re-forecast updates one row)
- [x] `trip_watch` written on trip save — on patch, in the same transaction as the node projection it is derived from
- [x] `job` table + drain handler (`SKIP LOCKED`, stop at 240s, exponential backoff, gives up at 5 attempts)
- [x] Weather sense handler (hourly, per region with a live trip); thresholds are ours, Georgia has no warning feed
- [x] Match query + GiST/btree indexes; `(event_id, node_id)` made unique (migration 0003) and `queued_at` added to claim a pair once (0004)
- [x] Judge with all four validators — the first three in `checkVerdict`, the confidence gate in the router and tested as an invariant
- [x] Router as a pure, unit-tested function (`interrupt` / `briefing` / `drop`), every path returning its reason
- [x] No delivery yet — verdicts land in `event_match` with their route, reason and rejections
- [ ] Cron *scheduled* — the three handlers exist and are secured; the clock is `src/trigger/watch-pipeline.ts` (hourly, Trigger.dev, free at that cadence) rather than Vercel cron, which Hobby rejects at deploy time. Unverified: needs a Trigger.dev account
- [x] Eval harness: 30 `(event, node, trip) → expected verdict` fixtures (10 fire / 10 don't / 10 ambiguous). **Never run against the model** — `GEMINI_API_KEY` is not set
- [~] **Kill-criteria check**: `npm run kill:count`. The match half is measured — **0.8 pairs per trip-day** over 24 synthetic trips (4 areas x 6 weather weeks), worst case 3.4 in Svaneti in January, well inside the dozen-per-trip-day budget. The half that decides Phase 8 — interventions per trip — needs the judge, and so needs `GEMINI_API_KEY`.

## Phase 4 — the daily briefing

- [x] 07:30 Tbilisi cron — `/api/cron/briefing`, on the clock as the `morning-briefing` Trigger.dev schedule (written in Tbilisi's zone, not as 03:30 UTC). It posts one job per live trip-day and calls no model; the drain does, like every other model call
- [x] One model call per trip-day **with something to say**. A quiet day is a deterministic briefing — most mornings are quiet at 0.8 pairs per trip-day, and asking a model to be interesting about an empty bundle is how invented reassurance gets written
- [x] Bundles everything routed to `briefing` plus the day's plan shape, looking 48 hours ahead rather than only at today: rain on Thursday is worth knowing on Tuesday, while the traveller can still move something
- [x] The composer may only reorder, merge and headline a numbered bundle, and nominate one change the judge already proposed. Evidence, source, timestamp and ops are attached from the verdict — a bad answer can be a poor sentence about a real event, never a fabricated one. Guards: no unknown ref, no item written about twice, no item lost, no change without moves; a refused draft falls back to a briefing written from the verdicts
- [x] Email delivery via Resend (`RESEND_API_KEY`, `BRIEFING_FROM`) — HTML and plain text, evidence beside every claim. A failed send is recorded in `briefing.email_error` and never costs the briefing, which is stored before the email is attempted
- [x] In-app briefing view — the first screen reading the database rather than the fixtures, with the change rendered as a before-and-after
- [x] `briefing` table (migration 0005) and `event_match.delivered_at` (0006); open tracking from both the email pixel and the app, because "briefing opened per trip-day" is a kill criterion
- [x] `npm run smoke:briefing` — the whole path against the real database, composer and mailer stubbed
- [x] **Run against the real model.** `npm run smoke:briefing -- --model` composed a briefing with Gemini on 2026-09-24: greeting, a headlined line covering its item, and a nominated change, all through the guards. Framing held — *"making the paths slick while the museum stays dry"*, an opportunity rather than an alarm
- [x] Survive a composer outage. `gemini-3.8-flash` returned 503 on two of three runs that evening, which exposed the fallback covering only a refused draft and not an unreachable model. Fixed: the error is thrown on while the queue has retries left, and the last attempt sends the fallback rather than nothing
- [ ] Get it in front of 3 real travellers this phase (people you know travelling in Georgia in October), ahead of the Phase 10 cohort

## Phase 5 — interrupts, budget enforcer, road form

- [x] Budget ledger: per-trip cap 3–5 for a 7-day trip, quiet hours, two-hour-horizon test — the router decides at judging time, and delivery asks again at send time under a row lock on the watch, where reserved pushes count against the cap so two jobs cannot both take the last slot
- [x] Interrupt path + push delivery — `interrupt` jobs, Expo push, one interrupt per event (unique index), a failed push handed to the briefing on its last attempt. **Nothing can reach it**: `INTERRUPT_ELIGIBLE` is empty until a detector has a hand-audited briefing-only week, and no phone can register before Phase 7
- [x] Telegram bot (grammY) + road-report form against the 12 corridors — stateless button form, moderation for non-operators, road events that meet transfers only. **Never met Telegram**: needs `TELEGRAM_BOT_TOKEN`; `npm run smoke:telegram` drives the real handlers with the API captured
- [x] Intervention UI: coherent-day diff, accept/reject as a unit, evidence/source always visible, opportunity framing — `/trips/{id}/alerts/{interventionId}`, also where a briefing's recommended change is reviewed; the trust screen lists everything told and what came of it
- [x] `intervention.outcome` write path — same commit as the accept/dismiss button (`ae72821`): patch and outcome in one transaction, mute switches push off and stamps `muted_at`, `ignored` written hourly by `/api/cron/outcomes`
- [x] Decide: who may submit road reports — **anyone, moderated**. Operators (`TELEGRAM_OPERATOR_IDS`) publish at once; everyone else's reports wait for an operator's approval, three at most per reporter, and are kept whatever happens to them
- [ ] Graduate the weather detector into `INTERRUPT_ELIGIBLE` — after a week of its verdicts audited by hand, which needs a Gemini plan first; road reports follow on the same terms

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
