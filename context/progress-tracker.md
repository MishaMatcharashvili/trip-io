# Progress tracker

Last updated: 2026-09-26 (Phase 5).

`context/running-the-pipeline.md` is the switch list: what is still switched off, why, and what
turning each one on unblocks.

## Current status: Phase 5 built and rehearsed on the live database; nothing in it is switched on

Phase 5 built the interrupt path, the budget enforced at send time, the intervention card with its
outcomes, and the road-report bot — and switched none of it on, deliberately. `INTERRUPT_ELIGIBLE` is
still empty: its rule is a week of hand-audited briefing-only verdicts, and the judge has only just
met a model (see below) — it has not yet judged a real trip. The bot needs a Telegram token, and
push needs the Phase 7 app to register a phone. Everything between those edges is rehearsed against Neon by
`smoke:interrupt`, `smoke:road` and `smoke:telegram`, which found three real bugs on the way.

Phases 3 and 4 are built end to end and have run against the real database: sense → match → queue →
drain → brief. The briefing is the first thing this system delivers to anyone, and it ships before
interrupts by design — `INTERRUPT_ELIGIBLE` is still empty, so nothing can wake anyone up.
`npm run smoke:briefing` walks bundle → compose → store → email → opened with the composer and the
mailer stubbed; it wrote real briefings for three synthetic trips, merged four live Tbilisi weather
events into one line, and produced the fallback briefing when a draft dropped five of its six items.

**The judge has met the model.** The calls moved from Gemini to OpenAI (`gpt-5.4-mini`), the key is
set, and on 2026-09-26 everything that waited on it ran: `judge:eval` passed 28 of 30 fixtures twice
(false positives 1 then 2 — 10% and 20% — with no false negatives and no alarm framing), the briefing
composer wrote its first OpenAI briefing in `smoke:briefing -- --model`, and `kill:count -- --judge`
measured **2.2 interventions worth sending per 7-day trip** — above the stop line of 2, short of the
4–8 band. The weather detector alone is not enough; Phase 8 is the plan, not an option.

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
| Database | Live on Neon (eu-central-1, pooled, PostGIS 3.6). Migrations `0000`–`0009` applied; `0007` adds `intervention.offer`/`expires_at` and one push per event, `0008` adds `device` and `trip_watch.muted_at`, `0009` adds `road_report`; `0005` adds the `briefing` table (one per trip-day, unique on `(trip_id, day)`), `0006` adds `event_match.delivered_at`. `0003` adds `event_match.route_reason`/`rejections` and makes the event/node pair unique, `0004` adds `queued_at`. `0002` adds patch `seq`, `inverse_ops`, patch `meta`, the intervention-needs-an-accepter CHECK, `plan_cache` and `trip_generation` |
| Detectors | **2 of 7 built**: weather-vs-activity, hourly, thresholds derived here (no Georgian warning feed exists), Open-Meteo on the free tier — commercial key still to buy; and road-corridor, a Telegram form (anyone reports, operators approve), never connected to Telegram. No detector has graduated out of briefing-only: `INTERRUPT_ELIGIBLE` is empty, so nothing the system builds can wake anyone up |
| Watch pipeline | `world_event`, `trip_watch`, `event_match`, `job`, `briefing` all live. Cron at `/api/cron/{sense-weather,match,drain,briefing}` behind `CRON_SECRET`. The clock is `src/trigger/watch-pipeline.ts` — `watch-pipeline` hourly, `morning-briefing` at 07:30 Asia/Tbilisi — and there is no Trigger.dev account yet. 321 tests (`npm test`) |
| Judge | Prompt, guards and router written and unit-tested; the four validators enforce evidence, tier, no-empty-helpful and the confidence floor. On `gpt-5.4-mini`: 28/30 on `judge:eval` in two runs; has not yet judged a real trip |
| Briefing | Built end to end and **run against Gemini** (2026-09-24): bundle (48h lookahead) → compose → guards → store → email → open tracking. Quiet days, refused drafts and an unreachable model are all written without a model call. In-app view reads the database; email renders in HTML and text with evidence beside every claim. **Nothing has been emailed** (`RESEND_API_KEY` unset) |
| Catalogue | **Loaded**: 64 sense regions, 12 corridors, 13,338 places (11,590 `verified`, 1,748 `raw`). Per focus area: Tbilisi core 4,008, Kakheti 830, Kazbegi corridor 730, Svaneti 301. **0 / 600 curated** |
| Interrupts | Built and rehearsed, unreachable: `interrupt` jobs → `deliverInterrupt` (budget, quiet hours, lateness and coherence re-checked under a lock; a slot reserved before Expo is called) → the card at `/trips/{id}/alerts/{interventionId}` → accept / dismiss / mute → `ignored` by the hourly sweep. No detector is eligible and no phone is registered |
| Road reports | Built and rehearsed, not connected: `/api/telegram/webhook` answers 503 until `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are set. 0 reports |
| Recruiting | Not started |

### Phase 0 procurement checklist (blocks on you, not on code)

- [x] Neon project + PostGIS enabled; migrations applied and the catalogue loaded
- [x] `OPENAI_API_KEY` — set 2026-09-26. It gates the judge, the briefing composer and
      trip generation alike (`gpt-5.4-mini`, pinned in `src/infra/openai.ts`). Replaces
      `GEMINI_API_KEY`, whose free tier allowed twenty calls a day — enough for one briefing
      (composed 2026-09-24), not for `judge:eval`'s thirty fixtures — and whose `gemini-3.8-flash`
      returned 503 on two runs in three
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
| 0 | Foundations + procurement | Code done; procurement 2/9 (Neon, `OPENAI_API_KEY`) |
| 1 | Catalogue + corridors | Code done; load blocked on Neon; curation 0/600 |
| 2 | Trip document + patch log | Built and running against Neon. Generation is untestable end to end until curated places exist; the model is now reachable, but generation has nothing curated to choose from |
| 3 | Pipeline, weather only | Built and exercised on Neon. Judge measured on OpenAI: 28/30 on the eval harness, 2.2 interventions per synthetic trip |
| 4 | Daily briefing | Built, exercised on Neon end to end, and composed once by Gemini. Email never sent (Resend unset); not yet in front of the three travellers — the only item left |
| 5 | Interrupts, budget, road form | Built and rehearsed on Neon. Nothing switched on: no detector graduated, no bot token, no phone registered |
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
| Interventions per trip worth sending | 4–8 | < 2 | **2.2** on 24 synthetic weather-only trips — above stop, short of the band |
| False-positive rate, hand-audited | < 15% | > 35% | **10–20%** on the 30-fixture eval (two runs) — a proxy until real verdicts are hand-audited |
| Pairs per trip-day (cost input, not a kill line) | ≤ 12 | — | **0.8** measured; 3.4 worst case |
| Would pay €5/mo (post-trip survey) | ≥ 25% | < 8% | — |

**Earliest and most important read**: the Phase 3 synthetic-trip count, now measured in full.
`npm run kill:count` builds 24 synthetic trips across the four focus areas, lays six real weeks of
archived weather over them (two in-season years plus January, April, July and October), and runs the
real match query: **0.8 matched pairs per trip-day**, worst case 3.4 in Svaneti in January. That is
comfortably inside the dozen-per-trip-day budget, so the match radius is not the problem.

The other half is now measured too (2026-09-26, `kill:count -- --judge`): of 135 pairs, the judge
found 53 worth telling someone about and dropped 82 as not relevant — **2.2 per 7-day trip**. That is
above the stop line of 2 and short of the 4–8 the kill criteria ask for, and it is seasonal in the way
the pair counts predicted: January in Kazbegi gave 12, most in-season weeks gave 0 or 1. The weather
detector alone does not carry the product; detector expansion (Phase 8) is what closes the gap.

The false-positive half of the judge's record is a proxy for now: `judge:eval` is thirty hand-written
fixtures, and it read 10% and 20% on two runs of the same model — the band's edge sits between them,
so one run is not a verdict. Both misses were the same shape: a quiet urban stop (a Rustaveli stroll,
a taxi across Tbilisi) judged worth an interrupt. The real number is the hand audit of live verdicts.

## Open decisions still blocking downstream work


From `docs/implementation-plan.md` §13:

1. **Domain** — parked. `roamline.io` is the best free option found; `wandr.ai` is brokered. Confirm
   at a registrar + trademark search before any design spend.
2. **Road automation** — decided in Phase 8 on evidence from real manual events; no action needed yet.
3. ~~**Who may submit road reports**~~ — **decided 2026-09-25: anyone, moderated.** Operators publish
   at once at confidence 0.9; everyone else's reports wait for an operator's approval and publish at
   0.8.
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

- **2026-09-25** — Model provider switched from Gemini to OpenAI `gpt-5.4-mini`, for all three
  calls (judge, briefing composer, trip composer). Prompts carried over unchanged, so the first
  `judge:eval` measures the model and not a prompt edit. Strict structured outputs via
  `zodTextFormat` keep the decoder held to the domain's schemas; reasoning effort replaces
  temperature (medium for the judge, low for the two composers); `store: false` keeps itineraries
  off OpenAI's side. Needs `OPENAI_API_KEY`.
- **2026-09-25** — Review of Phases 0–4, one commit per fix. Phase 4's three went with the
  composer-outage fix: guests' briefings would have been emailed to Better Auth's placeholder
  addresses; the quiet briefing said "found nothing" while matches were still unjudged; a malformed
  briefing id was a 500. Phases 0–3: escalated forecasts were never re-judged (`reopenMatches` left
  `queued_at` set) nor re-briefed; a model-invented or malformed place id crashed the judge job and
  500'd a patch instead of being refused; a failed judge call re-queued its own pair, multiplying
  jobs during an outage; already-matched pairs could fill `MATCH_LIMIT` and starve new ones; an open
  redirect in `?next=`; a dropped message in the validate dry run; and the stop's own place offered
  to the judge as an alternative. None of it has run against the live pipeline yet — run
  `smoke:watch` and `smoke:briefing` before relying on it.
- **2026-09-26** — Phase 5 built: the budget enforcer, the interrupt path, Expo push, the
  intervention card and its outcomes, the `ignored` sweep, device registration and watch settings,
  and the road-report bot. Decisions made along the way: road reports are open to anyone and
  moderated, with operators publishing directly; the budget is spent by a reservation under a lock
  rather than by a send, so it cannot be raced; one event is one interrupt, held by a unique index;
  an interrupt carries a working action or none, so a proposal that breaks the day goes to the
  briefing; an offer stores its moves as absolute ops so accepting later cannot move a stop twice;
  a late answer overrules the sweep's `ignored`; road events meet transfers only and stay matchable
  for their window; the newest report about a road ends the others. Not done on purpose: no detector
  graduated into `INTERRUPT_ELIGIBLE`, because the judge has never produced the week of audited
  verdicts that requires. The rehearsals found three bugs no unit test could: switched-off quiet
  hours read back as the defaults, a watch's channels arrived as the string `{push,briefing}`, and an
  offer with nothing to apply could not be read back.
- **2026-09-26** — PRs #15 (the Phases 0–3 review fixes) and #16 (Gemini → OpenAI) had been merged
  into branches that were already merged, so neither reached `main`; recovered onto
  `restore-review-fixes`, with the road-report guidance Phase 5 had added to the Gemini judge's
  prompt carried into the OpenAI one. Then the first measurements on a model: `judge:eval` 28/30
  twice (false positives 10% and 20%), a briefing composed by `gpt-5.4-mini`, and **2.2
  interventions worth sending per synthetic 7-day trip** — above stop, short of the 4–8 band.
  `kill:count` had been printing "inside the 4-8 band" for anything from 2 to 8; fixed.
- **2026-09-20** — Neon live; migrations `0000`–`0002` applied and `catalogue:load` run (64 regions,
  12 corridors, 13,338 places). Phase 2 finished in code: patch log with stored inverses, the
  coherent-day validator, generation (candidates → Gemini → schedule → validate → retry → template
  fallback), `plan_cache`, `trip_generation`, and the `/api/trips` routes. `npm run smoke:trip`
  exercises create → patch → stale write → undo → restore → projection against the real database.
  Two things still cannot run: trip generation (needs curated places) and the Gemini call itself
  (needs `GEMINI_API_KEY`).
