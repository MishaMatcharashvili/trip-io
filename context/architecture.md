# Architecture

Status: Phases 0–5 built (see `context/progress-tracker.md`). Reflects the decisions of record in
`docs/implementation-plan.md`. This file is the living reference for "what we're actually building" —
update it when an architectural decision changes; don't let it drift from the code.

## System shape

```
SENSE → NORMALIZE → MATCH → JUDGE → BUDGET → ACT
```

Detectors poll per **region**, never per trip. A world event is matched against live trip nodes with
one spatiotemporal SQL query. Only matched pairs reach the LLM judge. The judge's verdict is routed by
a pure function into `interrupt`, `briefing`, or `drop`. Nothing is ever auto-applied — every system
proposal is a patch the traveller accepts or rejects as a unit.

See `docs/watch-layer.md` for the full pipeline spec and `docs/implementation-plan.md` §3–8 for the
schema and cron design this section summarizes.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js App Router | already scaffolded |
| API | Hono, mounted at `app/api/[[...route]]/route.ts` | `hono/client` gives a typed RPC client that works in React Native (Server Actions don't); one server definition serves web and Expo |
| Validation | Zod, via `@hono/zod-validator` | same schemas convert to JSON Schema for LLM structured output — one definition, three consumers |
| Database | Neon Postgres + PostGIS | `CREATE EXTENSION postgis`; use the **pooled** connection string |
| ORM | Drizzle + drizzle-kit | raw SQL where PostGIS gets interesting (matching query, corridor geometry) |
| Catalogue ETL | DuckDB (`@duckdb/node-api`, dev-only scripts) | reads Overture's Parquet from S3 with bbox pushdown; the whole programmatic gate runs here, testable without a database |
| Auth | Better Auth | anonymous trip in local state → account created at save → trip claimed; Expo support built in |
| Map | MapLibre GL + PMTiles | one `.pmtiles` file on Vercel Blob or R2, read via HTTP range requests; no tile server |
| Queue | Postgres table + `SELECT ... FOR UPDATE SKIP LOCKED` | no Redis; cron handlers enqueue, a drain handler claims and processes |
| Scheduling | Vercel Cron → route handlers | **Vercel Pro is a hard dependency** — Hobby cron runs once/day only |
| Email | Resend | daily briefing |
| Push | expo-notifications + EAS | APNs + FCM; credential setup starts week 1, latency doesn't compress |
| Telegram | grammY, webhook | manual road-corridor report form (detector #2) |
| Native | Expo in `mobile/`, a pnpm workspace package, sharing the Hono client via `hc<AppType>()` | thin shell — trip list, intervention card, push registration, settings; heavy UI (map, editing) stays on web. It reads `AppType` as declarations built by `tsconfig.api.json`, and imports this package's types only (`src/mobile-boundary.test.ts`) |

## Layers

```
domain  ←  dal  ←  bll  ←  server  ←  app
                    ↑
                  infra
```

Each layer may use the ones to its left and must not know the ones to its right. `src/layers.test.ts`
enforces this with the rest of the test suite; when it fails, the fix is almost never an exception, it
is moving the code one layer further left.

| Directory | What lives there | Rule |
|---|---|---|
| `src/domain` | The trip document, the patch grammar, the coherent-day validator, the generation pipeline, the catalogue model, the watch layer's event model, weather thresholds, judge guards, the router, the briefing document, the interrupt budget's delivery rules and the road-report vocabulary | Plain functions over plain values. No IO, no environment, no runtime dependency but Zod — so all of it is testable without a database or a model |
| `src/dal` | Connection, schema, migrations, and one repository per aggregate: `trips.ts`, `places.ts`, `plans.ts`, `events.ts`, `watches.ts`, `matches.ts`, `jobs.ts`, `briefings.ts`, `interventions.ts`, `devices.ts`, `road-reports.ts` | The only layer that writes SQL or imports Drizzle. Repositories take domain values and return domain objects; they hold no policy |
| `src/bll` | Use cases: `trip-document.ts`, `trip-generation.ts`, `curation.ts`, `sense.ts`, `match.ts`, `judge.ts`, `drain.ts`, `briefing.ts`, `interrupt.ts`, `interventions.ts`, `watch-settings.ts`, `devices.ts`, `road-report.ts` | The order things happen in, and the transaction they happen in. Owns the read models the screens ask for (`tripView`, `previewPatch`, `interventionCard`, `alertsPage`) |
| `src/infra` | Outbound adapters: the Gemini composer, the Gemini judge, the Gemini briefer, Open-Meteo, Resend, Expo push, Better Auth | Implements a port the domain declares. The only files that name an external provider |
| `src/server` | The Hono app, its routers, the session middleware, and the road-report bot behind the Telegram webhook | Validation, status codes, nothing else. Imports use cases, never a repository |
| `src/app`, `src/ui`, `src/features` | Next.js routes, primitives and composites | Presentation. May call a use case; may not reach a repository |

Two consequences worth stating, because they are what the layering buys:

- **The domain is the part worth testing, and it is testable.** The validator, the patch grammar, the
  scheduler and the pipeline are pure; the pipeline takes its model, its cache and its travel estimate
  as injected ports, so every branch — cache hit, model retry, fallback, insufficient coverage — runs
  against fakes in `pipeline.test.ts`.
- **Swapping an implementation is a one-file change.** `Composer`, `PlanCache` and `TravelEstimator`
  are declared in the domain and implemented outside it: moving off Gemini, or replacing
  straight-line travel with an OSRM matrix, touches `src/infra` or `src/dal` and nothing else.

This also means Hono runs unchanged on Bun or Node if the project ever outgrows Vercel — only the
entry file changes.

## Cron topology

```
0 * * * *    /api/cron/sense-weather   poll regions w/ live trips → world_event   built
*/5 * * * *  /api/cron/match           PostGIS join → event_match → enqueue judge  built
* * * * *    /api/cron/drain           claim N jobs SKIP LOCKED, stop at 240s      built
0 3 * * *    /api/cron/briefing        07:30 Tbilisi; one job per live trip-day    built
*/30 * * * * /api/cron/sense-news      RSS + extraction                            Phase 8
POST         /api/telegram/webhook     road reports → world_event                  built
0 6 * * 1    /api/cron/sense-rail      weekly manual-check reminder                Phase 8
0 * * * *    /api/cron/outcomes        mark un-actioned interventions `ignored`     built
```

The five built cron handlers are written and behind `CRON_SECRET`; the Telegram webhook is behind
Telegram's own secret-token header instead. They are **not on Vercel cron**:
Hobby runs once per day and rejects a sub-daily expression at deploy time — a `vercel.json` carrying
these schedules fails the build outright, which is what happened when Phase 3 first tried to ship
one. The clock is Trigger.dev instead (`src/trigger/watch-pipeline.ts`), one hourly task calling the
sense/match/drain/outcomes handlers in order over HTTP: free at that cadence against $20/mo for Vercel
Pro, and hourly is what the design calls for while the finer schedules below are throughput settings
for scale. Trigger.dev is the clock only — the work, the queue and the drain stay here.

A second scheduled task, `morning-briefing`, runs `briefing` then `drain` at 07:30 Asia/Tbilisi. It
is written in Tbilisi's clock rather than as 03:30 UTC — Georgia keeps no daylight saving, so the
two agree today, and naming the zone is what keeps them agreeing if that changes. It ends in a
drain of its own so a briefing posted at 07:30 is sent at 07:30 and not at 08:07.

Should Vercel Pro ever be bought for other reasons, this file is the whole change back:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/sense-weather", "schedule": "0 * * * *" },
    { "path": "/api/cron/match", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/drain", "schedule": "* * * * *" }
  ]
}
```

Until a Trigger.dev account exists the handlers are invoked by hand or by `npm run smoke:watch`;
nothing runs on a timer. `context/running-the-pipeline.md` has the rest of the switch list.

Cron handlers never call the model directly — they enqueue jobs. The drain handler is what makes the
system survive a spike: claim with `SKIP LOCKED LIMIT n`, track elapsed time, stop cleanly at 240s,
let the next minute's invocation continue. Every cron route checks `CRON_SECRET`; these are public
URLs.

## Schema (core tables)

```sql
-- trip document
trip           id, user_id nullable, title, starts_at, ends_at,
               party jsonb, pace, budget, prefs jsonb,
               head_patch_id, created_at

trip_node      id, trip_id, kind, place_id, starts_at, duration_min,
               indoor bool, geom geography, meta jsonb

trip_patch     id, trip_id, parent_id, intent text, ops jsonb,
               author(user|system|intervention), accepted_by nullable,
               applied_at, client_seq

checkpoint_log id, trip_id, patch_id, snapshot jsonb, created_at

-- catalogue
place          id, name, name_ka, category, geom geography,
               tier(curated|verified|raw), source, source_id,
               opening_hours jsonb, attrs jsonb, verified_at, verified_by

corridor       id, slug, name, geom geography(LineString), buffer_m,
               season_risk jsonb          -- the 12 curated corridors

region         id, slug, name, name_ka, kind(municipality|city), iso_region,
               source, source_id, geom geography(MultiPolygon),
               poll_point geography(Point) -- sense-loop polling unit

place_review   id, place_id, decision(curate|reject|skip), reviewer_id,
               note, created_at           -- append-only curation log

-- watch layer
world_event    id, source, kind, severity, confidence, geom geography,
               valid_from, valid_to, observed_at, dedupe_key, payload jsonb

trip_watch     trip_id, active_from, active_to, regions geography,
               channels[], quiet_hours, cap, muted_at
               -- muted_at: the first time push was switched off while the
               -- watch was awake — the settings half of a kill criterion

event_match    id, event_id, trip_id, node_id, matched_at, score,
               queued_at, judged_at, delivered_at, verdict jsonb,
               route(interrupt|briefing|drop), route_reason, rejections jsonb
               -- (event_id, node_id) is unique: the matcher runs every five
               -- minutes and its invocations overlap. The four stamps are the
               -- pipeline: matched, queued, judged, delivered

intervention   id, trip_id, event_id, channel(push|email|briefing),
               sent_at, patch_id, offer jsonb, expires_at,
               outcome(accepted|dismissed|ignored|muted), outcome_at
               -- one row per event per delivery, not per matched pair: the
               -- same rain over two stops is one thing the traveller was told.
               -- (trip_id, event_id) is unique for channel = 'push': one
               -- interrupt per event, ever. sent_at is null while a push is
               -- reserved and not yet sent. offer is a snapshot of what was
               -- shown, because the match it came from cascades with its stop

device         id, user_id, token unique, platform(ios|android),
               created_at, last_seen_at, disabled_at, disabled_reason

road_report    id, corridor_id, condition(closed|restricted|delays|hazard|
               reopened), hazard, valid_from, valid_to, reported_at,
               reporter_id, reporter_name, chat_id,
               status(pending|published|rejected|expired),
               reviewed_by, reviewed_at, event_id
               -- never deleted: each report with its outcome is a label for
               -- Phase 8's road-automation spike

briefing       id, trip_id, day date, day_index, quiet, document jsonb,
               composed_at, email_to, email_sent_at, email_error, opened_at
               -- (trip_id, day) is unique: one briefing per trip-day, so a
               -- cron re-run costs nothing and re-delivers nothing

-- infrastructure
job            id, kind, payload jsonb, run_after, attempts,
               locked_at, locked_by, completed_at, error
```

`place.tier` is what keeps the hand-verified catalogue trustworthy: only `curated` places are
proposable in a generated itinerary; `verified` places can be suggested by the judge; `raw` is
searchable but never proposable. Enforced server-side in the validator, never just in the prompt.

### Catalogue pipeline

```
npm run catalogue:extract   Overture S3 → data/overture/<release>/*.parquet (bbox cache)
                            → regions + gate + tier → data/catalogue/<release>/*.parquet
npm run catalogue:corridors OSRM → src/domain/catalogue/corridors.geo.json (checked in)
npm run catalogue:load      regions, corridors, places → Postgres (idempotent upsert)
/curate                     hand-verification queue → `curated` tier + opening_hours
```

The Overture release is pinned (`scripts/catalogue/extract.ts`). Reloads never demote `curated`
rows or overwrite the curator's name/category/position; non-curated rows missing from a newer release
are demoted to `raw`, never deleted (`trip_node.place_id` would null out). Sense regions are the 64
municipalities and self-governing cities of Georgia, excluding Abkhazia and South Ossetia.

### The watch pipeline, as built

```
sense    src/bll/sense.ts        one forecast per region with a live trip
detect   src/domain/watch/weather.ts   our own thresholds; a spell is one event
store    src/dal/events.ts       dedupe_key collapses the hourly re-forecast
match    src/dal/matches.ts      ST_DWithin x window overlap; radius, freshness
                                 and which stops, all per kind
queue    src/dal/jobs.ts         SKIP LOCKED; cron never calls a model
judge    src/bll/judge.ts        the only model call, on matched pairs only
guard    src/domain/watch/judge.ts     four validators; a refusal is logged
route    src/domain/watch/route.ts     interrupt / briefing / drop, with a reason
brief    src/bll/briefing.ts           one trip-day's bundle, once, at 07:30
deliver  src/infra/resend.ts           email; the in-app copy is already stored
budget   src/bll/interrupt.ts          the router's question asked again at send
                                       time, under a lock; a slot reserved first
push     src/infra/expo-push.ts        APNs and FCM through Expo
answer   src/bll/interventions.ts      accept / dismiss / mute, patch and outcome
                                       in one transaction; `ignored` by the clock
```

The interrupt path is built end to end and nothing uses it: `INTERRUPT_ELIGIBLE` is still empty, so
nothing can wake anyone up. A detector graduates by being added to that set after a week of
hand-audited briefing-only verdicts, and the judge has not produced one yet. The briefing remains the
one channel that delivers, by design: it costs the traveller nothing to receive, so the system gets
watched before it is allowed to interrupt.

`npm run smoke:watch` exercises stages 1–5 against the real database with the judge stubbed;
`npm run smoke:briefing` does the same for stage 6 with the composer and the mailer stubbed;
`npm run smoke:interrupt` walks the interrupt path, the card's answers and the sweep, with the judge
and the push service stubbed; `npm run smoke:road` and `npm run smoke:telegram` do the same for road
reports, the second through the bot's real handlers with Telegram's API captured;
`npm run kill:count` runs the matcher over synthetic trips and archived weather; `npm run judge:eval`
scores the model against the thirty fixtures.

### The briefing, as built

One model call per trip-day **with something to say**. A quiet day is a template, not a call: at 0.8
matched pairs per trip-day most mornings are quiet, and pointing a model at an empty bundle and
asking it to be interesting is how invented reassurance gets written.

The composer is given a numbered bundle and may only reorder it, merge items into one line, headline
them, and nominate at most one change the judge already proposed. Evidence, source, timestamp and
the proposed ops are attached from the verdict afterwards — so a bad answer can only be a poor
sentence about a real event, never a fabricated one. `src/domain/watch/briefing.ts` holds the guards
and the two briefings written without a model: the quiet one and the fallback.

The bundle looks 48 hours ahead rather than only at today. Rain on Thursday is worth knowing on
Tuesday, when the traveller can still move something; beyond two days the forecast churns, so the
item stays undelivered and is offered again as its day approaches.

`intervention.outcome` is the product's only defensibility claim — a record of which world-changes
actually moved a traveller's plan. The write path shipped in the same commit as the accept/dismiss
button; `ignored` is produced by a cron sweep, not left to the client.

### Interrupts and outcomes, as built

A verdict the router sends to `interrupt` is posted as an `interrupt` job, at the epoch so it sorts
ahead of an unjudged backlog. `deliverInterrupt` then asks the router's question again, because by
send time the answer can have changed: `checkDelivery` in `src/domain/watch/interrupt.ts` drops an
event that is over or a stop that has ended, marks a pair `covered` if the same event already
interrupted this trip over another stop, and sends anything the budget, quiet hours, a switched-off
push, a missing phone or an incoherent proposal turns away to the briefing, where it is free. A stop
in progress can still be interrupted — a road closing forty minutes into a drive is what the channel
is for.

The budget is spent by a reservation, not a send. Under `SELECT … FOR UPDATE` on the trip's watch the
ledger — reserved plus sent pushes — is counted and a slot reserved in one step; only after that
commits is Expo called, and only an accepted push is stamped `sent_at`. A push service that is down
throws for the queue's backoff; on the last attempt the slot is given back and the verdict goes to
the briefing.

Every intervention stores its `offer`: the sentence, the evidence, and the moves as absolute ops
computed against the day when it was offered, so accepting later cannot move a stop twice. The card
at `/trips/{id}/alerts/{interventionId}` shows Changed, Affects and I suggest, then every stop the
change moves, previewed against the trip as it is now. Accept appends the ops as an `intervention`
patch accepted by the traveller and records `accepted` with the patch id in one transaction, under
locks on the intervention and the trip; mute records `muted` and switches push off for the trip. A
briefing's nominated change is an offer on the same card. `ignored` is written hourly for anything
unanswered past `expires_at` — a push's horizon, a briefing item's stop — and a late answer from the
traveller overrules it.

### Road reports, as built

Detector #2 is a form in Telegram (`src/server/telegram`), stateless: every button carries the
answers so far. Anyone may report; a report from `TELEGRAM_OPERATOR_IDS` is published at once, and
anyone else's waits as `pending` for an operator to approve or reject from Telegram, with at most
three waiting per reporter. Publishing ends every road event still open on the corridor — the newest
report about a road is the truth about it — and writes a new one over the corridor's buffered line,
unless the report is a reopening, which writes none. Approved after its window closed, a report is
`expired`, not published. The matcher runs as soon as a report is published.

Road events match transfers only, by distance or by a transfer's `meta.corridorSlug`, and stay
matchable for their window rather than the six hours a forecast gets. An operator's report is
trusted at 0.9 and an approved stranger's at 0.8. The corridors' seasonal-risk notes are not cited
anywhere yet: they are seed knowledge, still to be verified.

## Hard invariants (validator rules, not guidelines)

An invariant is only real where it is enforced in code and held by a test. Each one below says where
that is, or says plainly that it is not built yet — an aspiration listed as a guarantee is worse than
no list.

- **Never auto-apply.** `trip_patch.author = 'intervention'` requires a non-null `accepted_by`.
  *Enforced twice:* the `trip_patch_intervention_accepted` CHECK constraint (migration `0002`) and a
  guard at the top of `appendPatch`, before the transaction opens. *Tested:*
  `src/bll/trip-document.test.ts`; the one path that writes such a patch, accepting an intervention,
  is exercised by `npm run smoke:interrupt`.
- **No hallucinated places.** Every `place_id` a patch introduces is checked against the tiers its
  author may use — `system` composes only from `curated`, `intervention` may also use `verified`.
  *Enforced:* `allowedTiers` in `src/domain/trip/validate.ts`, run over every affected day on every
  write; candidate retrieval filters to `curated` again in `src/dal/places.ts`. *Tested:*
  `src/domain/trip/validate.test.ts`.
- **Always show evidence and source.** A verdict with empty `evidence`, evidence missing a timestamp,
  or evidence that does not name the event's source is rejected before it can be routed.
  *Enforced:* `checkVerdict` in `src/domain/watch/judge.ts`. *Tested:* `judge.test.ts`.
- **No empty-helpful verdicts.** `relevant: true` + `impact: "none"` is rejected by the validator,
  and dropped again by the router if it somehow arrives there. *Enforced:* `checkVerdict` and
  `route`. *Tested:* `judge.test.ts`, `route.test.ts`.
- **The judge may only name places it was given.** Every place id a proposal introduces is looked up
  in the catalogue — not in the list handed to the model, which would miss an id lifted from
  elsewhere in its own input — and must be `curated` or `verified`. *Enforced:* `checkVerdict` plus
  the lookup in `src/bll/judge.ts`. *Tested:* `judge.test.ts`.
- **Nothing interrupts below the confidence floor.** The gate reads
  `min(verdict.confidence, event.confidence)`, so a model that sounds certain about a forecast two
  days out cannot talk past its own lead time. *Enforced:* `route`. *Tested:* as an invariant over
  the input space in `route.test.ts`.
- **A briefing may not quietly lose an item.** A composer may merge two items into one line; it may
  not omit one. A briefing that drops the thing that mattered is worse than none, because the
  traveller has been told they are covered. *Enforced:* `checkDraft` in
  `src/domain/watch/briefing.ts`, which falls back to a briefing written from the verdicts rather
  than sending a refused draft. *Tested:* `briefing.test.ts`.
- **A recommended change has something to apply.** "1 change recommended" citing an item that
  proposes no moves is the briefing's own empty-helpful verdict — a button that does nothing.
  *Enforced:* `checkDraft`. *Tested:* `briefing.test.ts`.
- **New detectors enter briefing-only.** A detector may not route to `interrupt` until it has run one
  week on briefing-only and been hand-audited. *Enforced:* `INTERRUPT_ELIGIBLE` in
  `src/domain/watch/route.ts`, which is empty — the interrupt path is built and nothing can reach it.
  Road reports entered on the same terms. A detector graduates by being added to that set,
  deliberately. *Tested:* `route.test.ts`.
- **The interrupt budget cannot be raced.** The ledger counts reserved pushes as well as sent ones,
  and is counted and spent under a row lock on the watch. *Enforced:* `deliverInterrupt` in
  `src/bll/interrupt.ts`; `checkDelivery` never delivers at or over the cap. *Tested:* as an
  invariant in `interrupt.test.ts`; two concurrent deliveries for one slot in `smoke:interrupt`.
- **One event is one interrupt.** However many of a trip's stops an event touches, it wakes the
  traveller once. *Enforced:* a partial unique index on `intervention (trip_id, event_id)` for
  `channel = 'push'` (migration `0007`), and `covered` in `checkDelivery`. *Tested:*
  `interrupt.test.ts`, `smoke:interrupt`.
- **An interrupt carries a working action or none.** A proposal that would break the day, or names a
  stop the trip no longer has, is never pushed. *Enforced:* `checkDelivery` and `makeOffer`.
  *Tested:* `interrupt.test.ts`.
- **An accepted intervention is its patch.** The outcome and the patch it applied are written in one
  transaction, or neither is. *Enforced:* `answerIntervention` via `appendPatchIn`. *Tested:*
  `smoke:interrupt` (needs a database).
- **Silence is an outcome.** An intervention nobody answered becomes `ignored` at its expiry, written
  by the hourly sweep; only the traveller's own answer may overwrite it. *Enforced:* `sweepIgnored`
  and `mayRecord`. *Tested:* `interrupt.test.ts`, `smoke:interrupt`.
- **A stranger's road report is reviewed before anyone sees it.** *Enforced:* `submitRoadReport`
  publishes only an operator's report; `moderateReport` locks the report and decides it once.
  *Tested:* `smoke:road`, `smoke:telegram`.

### Structural invariants

- **The dependency rule.** No layer imports one to its right; only `src/dal` writes SQL; the domain
  imports no runtime dependency but Zod. *Enforced and tested:* `src/layers.test.ts`, which fails on
  a deliberate violation.
- **Node ids are minted once and never reused.** A JSON Patch path into an array would point at a
  different stop as soon as anything were inserted before it, so nodes are keyed by id and order
  comes from `startsAt`. *Enforced:* the path grammar in `src/domain/trip/patch.ts`, where `add`
  refuses to overwrite. *Tested:* `src/domain/trip/patch.test.ts`.
- **The node projection never drifts from the log.** `trip_node` rows are the document at head; the
  patch, the nodes it touched and the new head are written in one transaction under a row lock.
  *Enforced:* `appendPatch`. *Not covered by an automated test* — it needs a database; the write path
  is exercised by `npm run smoke:trip`.

## Known constraints that shaped the above

- Open-Meteo's free tier is non-commercial (CC BY 4.0); a paid product needs the commercial API
  Standard tier (~15 calls/hour for Georgia, well inside the 1M/month allowance).
- Vercel Hobby cron is once-per-day, enforced at deploy time — Pro ($20/mo) is required for the
  hourly sense loop, not an later optimization.
- There is no scrapeable Georgian road-conditions source (`georoad.ge` now redirects to a
  non-machine-readable news feed). Detector #2 (road-corridor) is a manual Telegram form through at
  least week 10, when an automation spike is evaluated against real collected events.

## Detector registry

| # | Detector | Source | Cadence | Build phase | Confidence |
|---|---|---|---|---|---|
| 1 | weather-vs-activity | Open-Meteo, commercial tier | hourly | 3 — **built** | high |
| 2 | road-corridor | Telegram form, anyone, moderated | on submit | 5 — **built** | 0.9 operator / 0.8 approved |
| 3 | events & festivals | local pages + extraction | 6h | 8 | medium |
| 4 | protests & safety | Georgian news RSS + extraction | 30 min | 8 | low → gated |
| 5 | opening-hours | user reports + catalogue drift | on submit | 8 | medium |
| 6 | rail | Georgian Railway, weekly manual | weekly | 8 | high |
| 7 | flight-status | AeroDataBox | 15 min | dark (no v1 input) | high |

Full rationale for the stack, the cost model, and each decision's alternative is in
`docs/implementation-plan.md`. This file should stay a summary that's safe to skim before touching
code — when the two disagree, treat `docs/implementation-plan.md` as historical record and this file
as current, and reconcile them.
