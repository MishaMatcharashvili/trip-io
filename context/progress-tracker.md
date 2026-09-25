# Progress tracker

Last updated: 2026-09-21 (Phase 4).

`context/running-the-pipeline.md` is the switch list: what is still switched off, why, and what
turning each one on unblocks.

## Current status: Phase 4 built and exercised on the live database; blocked on a Gemini plan, on Resend, and on the 600

Phases 3 and 4 are built end to end and have run against the real database: sense → match → queue →
drain → brief. The briefing is the first thing this system delivers to anyone, and it ships before
interrupts by design — `INTERRUPT_ELIGIBLE` is still empty, so nothing can wake anyone up.
`npm run smoke:briefing` walks bundle → compose → store → email → opened with the composer and the
mailer stubbed; it wrote real briefings for three synthetic trips, merged four live Tbilisi weather
events into one line, and produced the fallback briefing when a draft dropped five of its six items.

**`GEMINI_API_KEY` is now set — and it is on the free tier, which allows twenty calls a day per
model.** That is below one run of anything here. The briefing composer's first real call came back
`RESOURCE_EXHAUSTED … quotaValue: 20`, so the prompt is wired and has still never produced a draft;
the same quota is what stands between the project and `judge:eval` and the half of the kill-criteria
check that decides Phase 8. Enabling billing on that key is now the single highest-value switch.

The briefing email is written and rendered but not posted: `RESEND_API_KEY` and `BRIEFING_FROM` are
unset, which skips only the send and records why in `briefing.email_error`. The in-app briefing at
`/trips/{id}/briefing` works without them, which is enough for the three travellers this phase asks
for. Trip generation is still blocked on the 600 curated places, and `/curate` still waits on Google
OAuth + `CURATOR_EMAILS`.

| Area | State |
|---|---|
| Repo | Hono mounted at `app/api/[[...route]]/route.ts` (`GET /api/health` proven end-to-end via `hc<AppType>()`), Better Auth wired at `app/api/auth/[...all]/route.ts` (Google OAuth + anonymous sessions — `GOOGLE_CLIENT_ID`/`SECRET` not yet supplied) |
| Catalogue pipeline | `npm run catalogue:extract` (Overture 2026-08-19.0 → gated Parquet, ~2 min cold), `catalogue:corridors` (OSRM → checked-in GeoJSON), `catalogue:load` (→ Postgres, idempotent). `/curate` review queue + add-missing-place form. 60 tests (`npm test`) |
| Dependencies | + `hono`, `@hono/zod-validator`, `zod`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `better-auth`, `@google/genai`, `@trigger.dev/sdk`, `resend`. Phase 1: + `@duckdb/node-api` (dev). Still not installed: MapLibre (Phase 6), Expo (Phase 7) |
| Design system | `src/ui/` — Mist tokens in `app/globals.css` (`@theme`), primitives (button, card, chip, dot, controls, nav, bars, sheet, 28-glyph icon set) and composites in `src/features/`. Reference page at `/design` |
| Screens | 17 screens under `src/app` (see `/design`). Layout and states are final; no MapLibre — maps are the canvas's schematic charts in `src/ui/map/`. All fixture-backed except `/trips/{id}/briefing`, which reads the database for a real trip and the fixtures for the design one |
| Database | Live on Neon (eu-central-1, pooled, PostGIS 3.6). Migrations `0000`–`0006` applied; `0005` adds the `briefing` table (one per trip-day, unique on `(trip_id, day)`), `0006` adds `event_match.delivered_at`. `0003` adds `event_match.route_reason`/`rejections` and makes the event/node pair unique, `0004` adds `queued_at`. `0002` adds patch `seq`, `inverse_ops`, patch `meta`, the intervention-needs-an-accepter CHECK, `plan_cache` and `trip_generation` |
| Detectors | **1 of 7 built**: weather-vs-activity, hourly, thresholds derived here (no Georgian warning feed exists). Open-Meteo on the free tier — commercial key still to buy. No detector has graduated out of briefing-only: `INTERRUPT_ELIGIBLE` is empty, so nothing the system builds can wake anyone up |
| Watch pipeline | `world_event`, `trip_watch`, `event_match`, `job`, `briefing` all live. Cron at `/api/cron/{sense-weather,match,drain,briefing}` behind `CRON_SECRET`. The clock is `src/trigger/watch-pipeline.ts` — `watch-pipeline` hourly, `morning-briefing` at 07:30 Asia/Tbilisi — and there is no Trigger.dev account yet. 269 tests (`npm test`) |
| Judge | Prompt, guards and router written and unit-tested; the four validators enforce evidence, tier, no-empty-helpful and the confidence floor. **The model itself has never been called** |
| Briefing | Built end to end and **run against Gemini** (2026-09-24): bundle (48h lookahead) → compose → guards → store → email → open tracking. Quiet days, refused drafts and an unreachable model are all written without a model call. In-app view reads the database; email renders in HTML and text with evidence beside every claim. **Nothing has been emailed** (`RESEND_API_KEY` unset) |
| Catalogue | **Loaded**: 64 sense regions, 12 corridors, 13,338 places (11,590 `verified`, 1,748 `raw`). Per focus area: Tbilisi core 4,008, Kakheti 830, Kazbegi corridor 730, Svaneti 301. **0 / 600 curated** |
| Recruiting | Not started |

### Phase 0 procurement checklist (blocks on you, not on code)

- [x] Neon project + PostGIS enabled; migrations applied and the catalogue loaded
- [~] `GEMINI_API_KEY` — **set, but on the free tier: twenty calls a day per model.** Enough for one
      briefing, not for the eval harness's thirty fixtures. The briefing composer has now run on it
      (2026-09-24); `judge:eval` and `kill:count -- --judge` still cannot. Free-tier
      `gemini-3.8-flash` also returns 503 UNAVAILABLE often — two runs in three that evening — which
      the queue now survives but a traveller would feel. Enable billing on that key
- [ ] Google Cloud OAuth app (Credentials → OAuth client ID, web application) → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — also gates `/curate`; set `CURATOR_EMAILS` to your Google address
- [ ] **Trigger.dev account** + `CRON_SECRET` — what makes Phase 3 run on a timer. Vercel cron was
      tried and failed the deployment (Hobby rejects sub-daily schedules), so the clock is
      `src/trigger/watch-pipeline.ts` instead: hourly, free at that cadence, $10/mo for finer against
      $20/mo for Vercel Pro. Written but never executed — there is no account yet
- [ ] Vercel Pro — no longer blocking. Hobby allows 300s functions, which is all the pipeline needs;
      Pro is now only worth buying for the 800s ceiling or if Vercel cron is wanted back
- [ ] Apple Developer enrolment started (APNs key)
- [ ] FCM project created
- [ ] **Resend account + verified sending domain** → `RESEND_API_KEY` and `BRIEFING_FROM`. DNS
      records, so start it a day before you need it. Unset, the briefing is still composed, stored
      and shown in the app; only the email is skipped
- [ ] Open-Meteo commercial plan account — the detector runs on the free tier today, which is
      CC BY 4.0 and non-commercial; `OPEN_METEO_API_KEY` switches endpoint with no code change
- [ ] AeroDataBox account (dark detector, minimum tier)
- [ ] Start recruiting: line up 3–4 Tbilisi hostels for the Phase 10 cohort, keep warm

## Phase status

Checklist items live in `context/build-plan.md`; this table tracks completion at a glance and should
be updated as phases close, not item-by-item.

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundations + procurement | Code done; procurement 1/9, with `GEMINI_API_KEY` set but rate-limited |
| 1 | Catalogue + corridors | Code done; load blocked on Neon; curation 0/600 |
| 2 | Trip document + patch log | Built and running against Neon. Generation is untestable end to end until curated places exist; the Gemini call has never run (free-tier quota) |
| 3 | Pipeline, weather only | Built and exercised on Neon. Judge never called (free-tier quota), so the eval harness and half the kill-criteria check are unrun |
| 4 | Daily briefing | Built, exercised on Neon end to end, and composed once by Gemini. Email never sent (Resend unset); not yet in front of the three travellers — the only item left |
| 5 | Interrupts, budget, road form | Not started |
| 6 | Web client | Screens built against fixtures; nothing wired to the API or to MapLibre |
| 7 | Native shell | Not started |
| 8 | Detector expansion + road spike | Not started |
| 9 | Instrumentation + dashboard | Not started |
| 10 | 100 travellers | Not started |

## Kill-criteria snapshot

No data yet — these are only measurable once the pipeline exists (Phase 3 earliest, for the row that
matters most).

| Signal | Continue | Stop | Current |
|---|---:|---:|---|
| Interventions acted on | ≥ 40% | < 15% | — |
| Notifications disabled during trip | < 10% | > 25% | — |
| Briefing opened per trip-day | ≥ 50% | < 20% | instrument built (`briefing.opened_at`, `openRate`) — no readers yet |
| Interventions per trip worth sending | 4–8 | < 2 | needs the judge |
| False-positive rate, hand-audited | < 15% | > 35% | needs the judge (`npm run judge:eval`) |
| Pairs per trip-day (cost input, not a kill line) | ≤ 12 | — | **0.8** measured; 3.4 worst case |
| Would pay €5/mo (post-trip survey) | ≥ 25% | < 8% | — |

**Earliest and most important read**: the Phase 3 synthetic-trip count. Half of it is now measured.
`npm run kill:count` builds 24 synthetic trips across the four focus areas, lays six real weeks of
archived weather over them (two in-season years plus January, April, July and October), and runs the
real match query: **0.8 matched pairs per trip-day**, worst case 3.4 in Svaneti in January. That is
comfortably inside the dozen-per-trip-day budget, so the match radius is not the problem.

The other half — how many of those pairs the router would actually send — needs the judge and so
needs `GEMINI_API_KEY`. Run `npm run kill:count -- --judge` the day it is set, before building
anything past Phase 4. If it comes back at 1–2 interventions per trip, detector expansion (Phase 8)
becomes urgent rather than optional. The pair counts already hint at the shape of the answer: a
September week in Kazbegi produced no events at all, while January in Svaneti produced 24 pairs.
Whatever the judge says, the weather detector alone is seasonal, and the traveller season is the
quiet one.

## Open decisions still blocking downstream work


From `docs/implementation-plan.md` §13:

1. **Domain** — parked. `roamline.io` is the best free option found; `wandr.ai` is brokered. Confirm
   at a registrar + trademark search before any design spend.
2. **Road automation** — decided in Phase 8 on evidence from real manual events; no action needed yet.
3. **Who may submit road reports** (self only / trusted locals / any user) — needed by Phase 5, affects
   `world_event.confidence` and moderation design.
4. **Subscription mechanics** (trial length, first trip watched free?) — needed by Phase 6.

## Log

Add a dated entry here whenever a phase closes, a kill-criteria signal is measured, or a decision
above gets resolved. Keep entries short — this is a log, not a report.

- **2026-09-14** — Planning complete. Architecture, build plan, and this tracker created in
  `context/`. No code written yet.
- **2026-09-14** — Phase 0 code-buildable slice wired: Drizzle schema (all 11 domain tables) +
  first migration generated, Hono mounted with a typed `/api/health` route proven via `hc<AppType>()`,
  Better Auth wired (Google OAuth + anonymous). Not yet applied against a live database — waiting on
  the Neon project and Google OAuth app from the procurement checklist above.
- **2026-09-18** — Auth screens: `/sign-in`, `/sign-up`, `/account`. Email and password enabled
  alongside Google (no migration — Better Auth's `account.password` already existed); guest sessions
  via the anonymous plugin. No verification or reset emails until Resend (Phase 4). Nothing can
  actually sign in yet: every auth call needs the Neon `DATABASE_URL` from the procurement list.
  Also recovered dark mode + Explore/Saved, which PR #4 had merged into `design-system-screens`
  after #3 had already landed, so they never reached `main`.
- **2026-09-16** — Design system and screens built from the Claude Design canvas ("trip.io Wireframe
  Concepts"). Chosen direction: **Concept A — map-first, in the Mist palette**. Colour does exactly
  three jobs — periwinkle is the agent, coral is a real disruption, green is all clear — and that
  rule is what lets a single dot carry urgency. Dark mode added on top ("Mist at night"): the same
  CSS variables overridden under `data-theme="dark"`, resolved before paint from a stored choice or
  the OS, with a System / Light / Dark switch in the top bar and in watch settings. The map artwork
  reads the same variables. The canvas has no dark boards, so the dark palette is ours; every text
  pairing measures WCAG AA. Every screen runs on `src/data/trip.ts`, whose shapes mirror the
  Drizzle schema (checkpoint = `trip_node`, advisory = `intervention` citing a `world_event`), so
  Phase 2–6 wiring replaces the loader rather than the components. The four states that decide
  whether the watch layer feels trustworthy — advisory, nothing-to-report, change-applied, watch
  paused — are all built, reachable at `?state=`. Explore and Saved are left undesigned in the
  canvas (nav stubs only); they are built here in the same grammar from the real catalogue shape —
  focus areas, category groups, corridor season risk — in `src/data/explore.ts`.
- **2026-09-16** — Phase 1 code-buildable slice done, run against Overture 2026-08-19.0 locally.
  Decisions made along the way: the gate (trigram dedupe included) runs in DuckDB before load, not in
  PostGIS after it, so it's testable without a database; dedupe compares distinctive name tokens at
  similarity 0.6 (measured: whole-name trigrams merged different guesthouses on the same street);
  `verified` = website or phone, which is 87% of kept places since Meta supplies phones for most —
  consider a confidence floor if the judge proposes junk; sense regions are municipalities (not
  corridors + grid), excluding Abkhazia and South Ossetia; corridor geometry is OSRM-routed, with the
  Zagari Pass on the bike profile because the car profile won't cross it; curated places require
  opening hours (skip instead of guessing). Load, and all 600 curated places, still to do.
- **2026-09-18** — Phase 2 pure core built on `phase-2-trip-document`, test-first against the
  Kazbegi day (`context/phase-2-design.md`). Decisions: user edits that break a day are applied
  with warnings, system/intervention patches may not introduce errors; generation uses Gemini 2.0
  Flash behind `compose.ts`; no dev curated seed. Next: migration 0002, transaction client,
  store, routes — waiting on the Neon `DATABASE_URL` in `.env`.
- **2026-09-20** — Phase 2 database layer written: migration `0002_trip_patch_log` (patch `seq`,
  `inverse_ops`, the intervention-needs-an-accepter CHECK, `plan_cache`, `trip_generation`), a
  WebSocket pool client because Neon's HTTP driver can't do transactions, the store (append, undo,
  restore, checkpoints, node projection) and the `/api/trips` routes. Anonymous trips are now
  reassigned on sign-up, so `disableDeleteAnonymousUser` is gone. None of it has touched a live
  database: `.env` still holds the placeholder `DATABASE_URL`.
- **2026-09-21** — Phase 3 built: the CAP-shaped event model, the weather detector (our own
  thresholds — Georgia publishes no warning feed), the match query, the Postgres job queue and its
  drain, the judge's four guards, and the router. Decisions made along the way: a spell of weather is
  one event, not one per hour, and its dedupe key buckets `valid_from` to three hours so the hourly
  re-forecast updates one row — with an escalation reopening the matches it already judged; the
  judge proposes in a four-move vocabulary rather than JSON Pointers, because a model asked for a
  pointer will eventually emit a well-formed one to the wrong stop and no downstream validator can
  catch that; the interrupt confidence gate reads `min(verdict, forecast)`; and the briefing-only
  rule for new detectors is a set in code, empty, rather than a process rule. Measured: 0.8 matched
  pairs per trip-day. Not done: the judge has never been called, so the eval harness is unrun.

- **2026-09-21** — Phase 4 built: the briefing document and its guards, the `briefing` table,
  `event_match.delivered_at`, the bundle query, the Gemini composer, the HTML/text email, the Resend
  adapter, the 07:30 cron and its Trigger.dev schedule, the in-app view on real data, and open
  tracking from both. Decisions made along the way: the briefing composer may only reorder, merge and
  headline a numbered bundle — every fact is attached from the verdict afterwards, so a bad answer
  can only be a poor sentence about a real event; a line may merge two items but may not drop one,
  because a briefing that omits the thing that mattered is worse than none once the traveller has
  been told they are covered; a quiet day is a deterministic briefing rather than a model call, both
  to save the call on most mornings and because pointing a model at an empty bundle and asking it to
  be interesting is how invented reassurance gets written; the bundle looks 48 hours ahead rather
  than only at today, because rain on Thursday is worth knowing on Tuesday while there is still time
  to move something; delivery is marked on the match and not on the intervention, since one event
  over two stops is two pairs to write about but one thing the traveller was told; and the 07:30 cron
  enqueues rather than composing, so the model call sits behind the queue that already has a budget,
  a backoff and a give-up. Measured nothing new — the composer has never produced a draft, because
  `GEMINI_API_KEY` turns out to be a free-tier key capped at twenty calls a day.

- **2026-09-20** — Neon live; migrations `0000`–`0002` applied and `catalogue:load` run (64 regions,
  12 corridors, 13,338 places). Phase 2 finished in code: patch log with stored inverses, the
  coherent-day validator, generation (candidates → Gemini → schedule → validate → retry → template
  fallback), `plan_cache`, `trip_generation`, and the `/api/trips` routes. `npm run smoke:trip`
  exercises create → patch → stale write → undo → restore → projection against the real database.
  Two things still cannot run: trip generation (needs curated places) and the Gemini call itself
  (needs `GEMINI_API_KEY`).
