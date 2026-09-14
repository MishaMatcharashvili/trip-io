# Architecture

Status: pre-build. Reflects the decisions of record in `docs/implementation-plan.md`. This file is
the living reference for "what we're actually building" — update it when an architectural decision
changes; don't let it drift from the code.

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
| Auth | Better Auth | anonymous trip in local state → account created at save → trip claimed; Expo support built in |
| Map | MapLibre GL + PMTiles | one `.pmtiles` file on Vercel Blob or R2, read via HTTP range requests; no tile server |
| Queue | Postgres table + `SELECT ... FOR UPDATE SKIP LOCKED` | no Redis; cron handlers enqueue, a drain handler claims and processes |
| Scheduling | Vercel Cron → route handlers | **Vercel Pro is a hard dependency** — Hobby cron runs once/day only |
| Email | Resend | daily briefing |
| Push | expo-notifications + EAS | APNs + FCM; credential setup starts week 1, latency doesn't compress |
| Telegram | grammY, webhook | manual road-corridor report form (detector #2) |
| Native | Expo, sharing the Hono client via `hc<AppType>()` | thin shell — trip list, intervention card, push registration, settings; heavy UI (map, editing) stays on web |

Business logic lives in `src/core/*` as plain functions imported by both HTTP route handlers and cron
handlers. Route handlers stay thin. This also means Hono runs unchanged on Bun or Node if the project
ever outgrows Vercel — only the entry file changes.

## Cron topology

```
0 * * * *    /api/cron/sense-weather   poll regions w/ live trips → world_event
*/30 * * * * /api/cron/sense-news      RSS + extraction (week 10)
POST         /api/telegram/webhook     road reports → world_event
0 6 * * 1    /api/cron/sense-rail      weekly manual-check reminder

*/5 * * * *  /api/cron/match           PostGIS join → event_match → enqueue judge
* * * * *    /api/cron/drain           claim N jobs SKIP LOCKED, stop at 240s
0 3 * * *    /api/cron/briefing        07:30 Tbilisi = 03:30 UTC; one call/trip-day
0 * * * *    /api/cron/outcomes        mark un-actioned interventions `ignored`
```

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

corridor       id, name, geom geography(LineString), buffer_m,
               season_risk jsonb          -- the 12 curated corridors

-- watch layer
world_event    id, source, kind, severity, confidence, geom geography,
               valid_from, valid_to, observed_at, dedupe_key, payload jsonb

trip_watch     trip_id, active_from, active_to, regions geography,
               channels[], quiet_hours, cap

event_match    event_id, trip_id, node_id, matched_at,
               verdict jsonb, score, judged_at, route(interrupt|briefing|drop)

intervention   id, trip_id, event_id, channel(push|email|briefing),
               sent_at, patch_id,
               outcome(accepted|dismissed|ignored|muted), outcome_at

-- infrastructure
job            id, kind, payload jsonb, run_after, attempts,
               locked_at, locked_by, completed_at, error
```

`place.tier` is what keeps the hand-verified catalogue trustworthy: only `curated` places are
proposable in a generated itinerary; `verified` places can be suggested by the judge; `raw` is
searchable but never proposable. Enforced server-side in the validator, never just in the prompt.

`intervention.outcome` is the product's only defensibility claim — a record of which world-changes
actually moved a traveller's plan. The write path ships in the same commit as the accept/dismiss
button; `ignored` is produced by a cron sweep, not left to the client.

## Hard invariants (validator rules, not guidelines)

- **Never auto-apply.** `trip_patch.author = 'intervention'` requires a non-null `accepted_by`.
- **Always show evidence and source.** A verdict with empty `evidence`, or evidence missing a
  timestamp, is rejected before rendering.
- **No hallucinated places.** Every `place_id` in a patch's `ops` is validated against
  `curated`/`verified` tiers server-side.
- **No empty-helpful verdicts.** `relevant: true` + `impact: "none"` is rejected by the validator.
- **New detectors enter briefing-only.** A detector may not route to `interrupt` until it has run one
  week on briefing-only and been hand-audited. This applies hardest to LLM-extraction detectors
  (news/protests).

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
| 1 | weather-vs-activity | Open-Meteo, commercial tier | hourly | 3 | high |
| 2 | road-corridor | Telegram form, manual | on submit | 5 | high |
| 3 | events & festivals | local pages + extraction | 6h | 8 | medium |
| 4 | protests & safety | Georgian news RSS + extraction | 30 min | 8 | low → gated |
| 5 | opening-hours | user reports + catalogue drift | on submit | 8 | medium |
| 6 | rail | Georgian Railway, weekly manual | weekly | 8 | high |
| 7 | flight-status | AeroDataBox | 15 min | dark (no v1 input) | high |

Full rationale for the stack, the cost model, and each decision's alternative is in
`docs/implementation-plan.md`. This file should stay a summary that's safe to skim before touching
code — when the two disagree, treat `docs/implementation-plan.md` as historical record and this file
as current, and reconcile them.
