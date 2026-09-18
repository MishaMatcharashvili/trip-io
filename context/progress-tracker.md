# Progress tracker

Last updated: 2026-09-16.

## Current status: Phase 1 code done; blocked on Neon for the load, on you for the 600

Phase 0's code is merged; its procurement items are still outstanding (checklist below). Phase 1's
pipeline is built and has run against real Overture data locally. Nothing is in Postgres yet: the load
waits on Neon, and the curation queue at `/curate` waits on Neon + Google OAuth + `CURATOR_EMAILS`.

| Area | State |
|---|---|
| Repo | Hono mounted at `app/api/[[...route]]/route.ts` (`GET /api/health` proven end-to-end via `hc<AppType>()`), Better Auth wired at `app/api/auth/[...all]/route.ts` (Google OAuth + anonymous sessions — `GOOGLE_CLIENT_ID`/`SECRET` not yet supplied) |
| Catalogue pipeline | `npm run catalogue:extract` (Overture 2026-08-19.0 → gated Parquet, ~2 min cold), `catalogue:corridors` (OSRM → checked-in GeoJSON), `catalogue:load` (→ Postgres, idempotent). `/curate` review queue + add-missing-place form. 60 tests (`npm test`) |
| Dependencies | + `hono`, `@hono/zod-validator`, `zod`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `better-auth`. Phase 1: + `@duckdb/node-api` (dev). Still not installed: MapLibre (Phase 6), Resend (Phase 4), Expo (Phase 7) |
| Design system | `src/ui/` — Mist tokens in `app/globals.css` (`@theme`), primitives (button, card, chip, dot, controls, nav, bars, sheet, 28-glyph icon set) and composites in `src/features/`. Reference page at `/design` |
| Screens | 17 fixture-backed screens under `src/app` (see `/design`). Layout and states are final; no API, no MapLibre — maps are the canvas's schematic charts in `src/ui/map/` |
| Database | 11 domain tables + Better Auth's in `src/db/schema/`, plus Phase 1's `region` and `place_review` (migration `0001`). `npm run db:migrate` creates PostGIS, then applies both. **Not yet applied** — no live Neon project; `.env` holds a placeholder `DATABASE_URL` |
| Detectors | None built |
| Catalogue | Extracted, not loaded: 64 sense regions; 65,705 Overture places in bbox → 13,337 kept (11,590 `verified`, 1,747 `raw`; 103 merged as duplicates). 12 corridors routed. **0 / 600 curated** |
| Recruiting | Not started |

### Phase 0 procurement checklist (blocks on you, not on code)

- [ ] Neon project + PostGIS enabled → give me the pooled `DATABASE_URL`, I'll run the migration and `catalogue:load`
- [ ] Google Cloud OAuth app (Credentials → OAuth client ID, web application) → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — also gates `/curate`; set `CURATOR_EMAILS` to your Google address
- [ ] Vercel Pro enabled, preview deploys working, `CRON_SECRET` set
- [ ] Apple Developer enrolment started (APNs key)
- [ ] FCM project created
- [ ] Open-Meteo commercial plan account
- [ ] AeroDataBox account (dark detector, minimum tier)
- [ ] Start recruiting: line up 3–4 Tbilisi hostels for the Phase 10 cohort, keep warm

## Phase status

Checklist items live in `context/build-plan.md`; this table tracks completion at a glance and should
be updated as phases close, not item-by-item.

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundations + procurement | Code done; procurement 0/8 |
| 1 | Catalogue + corridors | Code done; load blocked on Neon; curation 0/600 |
| 2 | Trip document + patch log | Not started |
| 3 | Pipeline, weather only | Not started |
| 4 | Daily briefing | Not started |
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
| Briefing opened per trip-day | ≥ 50% | < 20% | — |
| Interventions per trip worth sending | 4–8 | < 2 | — |
| False-positive rate, hand-audited | < 15% | > 35% | — |
| Would pay €5/mo (post-trip survey) | ≥ 25% | < 8% | — |

**Earliest and most important read**: run the Phase 3 synthetic-trip count (weather detector only,
against historical weather) before building anything past Phase 3. If it comes back at 1–2
interventions per trip, detector expansion (Phase 8) becomes urgent, not optional.

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
