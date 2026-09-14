# Progress tracker

Last updated: 2026-09-14.

## Current status: Phase 0 in progress

Planning is complete (`docs/concept.md`, `docs/market.md`, `docs/watch-layer.md`,
`docs/implementation-plan.md`), and the architecture decisions are recorded in
`context/architecture.md`. The code-buildable slice of Phase 0 is wired; the procurement items
(external accounts, recruiting) are still outstanding — see the checklist below.

| Area | State |
|---|---|
| Repo | Hono mounted at `app/api/[[...route]]/route.ts` (`GET /api/health` proven end-to-end via `hc<AppType>()`), Better Auth wired at `app/api/auth/[...all]/route.ts` (Google OAuth + anonymous sessions — `GOOGLE_CLIENT_ID`/`SECRET` not yet supplied) |
| Dependencies | + `hono`, `@hono/zod-validator`, `zod`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `better-auth`. Still not installed: MapLibre (Phase 6), Resend (Phase 4), Expo (Phase 7) |
| Database | All 11 domain tables (from `context/architecture.md`) + Better Auth's tables defined in `src/db/schema/`, with GiST indexes on every geography column. First migration generated at `src/db/migrations/0000_brown_invisible_woman.sql`; `npm run db:migrate` creates the PostGIS extension (via `src/db/migrate.ts`) before applying it. **Not yet applied** — no live Neon project; `.env` holds a placeholder `DATABASE_URL` |
| Detectors | None built |
| Catalogue | 0 / 600 curated places verified |
| Recruiting | Not started |

### Phase 0 procurement checklist (blocks on you, not on code)

- [ ] Neon project + PostGIS enabled → give me the pooled `DATABASE_URL`, I'll run the migration
- [ ] Google Cloud OAuth app (Credentials → OAuth client ID, web application) → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
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
| 1 | Catalogue + corridors | Not started |
| 2 | Trip document + patch log | Not started |
| 3 | Pipeline, weather only | Not started |
| 4 | Daily briefing | Not started |
| 5 | Interrupts, budget, road form | Not started |
| 6 | Web client | Not started |
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
