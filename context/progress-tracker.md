# Progress tracker

Last updated: 2026-09-14.

## Current status: pre-build, Phase 0

Planning is complete (`docs/concept.md`, `docs/market.md`, `docs/watch-layer.md`,
`docs/implementation-plan.md`), and the architecture decisions are recorded in
`context/architecture.md`. The repo is still the unmodified `create-next-app` scaffold — no
application code has been written yet.

| Area | State |
|---|---|
| Repo | `create-next-app` scaffold only (`src/app/page.tsx`, `layout.tsx`, default styling) |
| Dependencies | Next.js 16.3.4, React 19.2.8, Tailwind 4, Biome. None of the app-specific stack (Hono, Drizzle, Neon, Better Auth, MapLibre, Resend, Expo) installed yet |
| Database | Not provisioned |
| Detectors | None built |
| Catalogue | 0 / 600 curated places verified |
| Recruiting | Not started |

## Phase status

Checklist items live in `context/build-plan.md`; this table tracks completion at a glance and should
be updated as phases close, not item-by-item.

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundations + procurement | Not started |
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
