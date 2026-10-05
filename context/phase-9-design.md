# Phase 9 design — instrumentation and the kill-criteria dashboard

Status: **designed, not built.** Written 2026-10-05 against `phase-8-detectors` at `cfffc90`. The
checklist is in `context/build-plan.md`; the criteria and what each one requires are
`docs/implementation-plan.md` §10. This file says how to build it. Update it when a decision here
changes.

## Why this phase exists

Phase 10 puts a hundred strangers on the product, and its only job is to tell us whether to continue.
That verdict is six numbers. Phase 9 makes them readable on one page, each with the sample size that
makes it believable, before the first stranger arrives — because a number first computed on the day
you need it is a number you will argue with.

## What exists, what does not

Auditing the code before designing anything. Most of the writes the plan asked for in "week 7" landed
in Phases 4–5; three things did not.

| Criterion | Write that exists | Missing |
|---|---|---|
| Interventions acted on | `intervention.outcome` (`accepted/dismissed/muted`), `ignored` by the hourly sweep (`sweepIgnored`) | Nothing in the data. A query. |
| Notifications disabled | `trip_watch.muted_at`, stamped from the settings screen and the card's mute button | Nothing in the data. A query. |
| Briefing opened | `briefing.opened_at`, from the email pixel and the in-app page | A query. Caveat below. |
| Interventions per trip worth sending | `event_match.route` + `route_reason` for every judged pair, `drop` included | A query. |
| False-positive rate, hand-audited | `event_match.verdict` is stored | **No sampling queue, no audit table, no UI.** |
| Would pay $5, post-trip | `watch_pass`, `trip.ends_at` | **No survey, no trigger, no table.** |
| *Judge spend* (cost, not a kill line) | — | **Nothing records tokens.** `generateJson` (`src/infra/openai.ts`) returns the parsed text and drops `response.usage`. `trip_generation`'s comment promises tokens per attempt; the code does not write them. |
| *Radius tuning* | `event_match.score`, the event and node geometries while both live | A query. No new column. |

So Phase 9 is: three small new tables' worth of writes (model calls, audits, survey), one query
module, one page. No change to the pipeline's behaviour.

## Decisions

1. **Operator page at `/ops`, gated by `isCurator`.** The allowlist (`CURATOR_EMAILS`, `src/lib/curator.ts`)
   is already the operator gate; a second role system is the thing its own comment says to avoid.
   Server-rendered, no client state beyond the audit buttons. No new public surface.
2. **Cohort.** Every rate is computed over *cohort trips*: has an owner, the owner is not in
   `CURATOR_EMAILS`, and the trip holds a pass. This removes the seeded, synthetic and operator's own
   test trips, which would otherwise be most of the data until Phase 10 is well under way. The page
   prints the cohort's trip and trip-day count above everything, and every metric shows its own n.
   A rate without its n is how a 2-of-3 reads as 67%.
3. **Verdicts, not just numbers.** Each metric is banded `continue / watch / stop / not enough data`
   by a pure function in the domain, from the bands in §10. A metric with n below its floor is
   `not enough data`, never `stop`. Proportions carry a Wilson 90% interval, and the band is
   `continue`/`stop` only when the whole interval clears the line; straddling a line is `watch`.
   Floors: 20 for outcome-type rates, 20 trip-days for opens, 5 trips for per-trip counts, 30 audits.
4. **"Worth sending" is everything the judge routed to `interrupt` or `briefing`**, counted as
   distinct `(trip, event)` — one event over two stops is one thing told once. This is the decision
   already made in `phase-8-design.md`; the dashboard shows the interrupt share beside it, which is
   zero until something graduates. Reported per trip and normalised to a 7-day trip, since the band
   is stated for one.
5. **Acted-on denominator is resolved interventions** (`outcome IS NOT NULL`), reported twice: over
   all, and over those in a briefing that was opened. An `ignored` item in a briefing nobody opened
   says nothing about whether the advice was good; the second figure is the honest one and the first
   is the one the kill line is written against. Show both and say which is which.
6. **Tokens, not dollars, are stored.** Prices change and are not ours; a `model_call` row holds token
   counts and a price table in the domain turns them into spend at read time. **The price table needs
   the user's confirmation** — the pinned `gpt-5.4-mini` rates are not in the repo and are not guessed
   here. Until set, the page shows tokens and "price not set".
7. **The audit is of what the router would send**, not of everything. The kill criterion is the share
   of *sent* findings that were wrong, so the sample frame is judged pairs with `route != 'drop'`.
   Sampling drops (false negatives) is not built; the criteria do not ask for it. Revisit if the
   per-trip count sits at the stop line and the question becomes whether the judge is too quiet.
8. **The sample is stratified by detector family, deterministic, and unaudited-first.** Weather would
   otherwise be 95% of the queue and the families that need auditing most (events, safety) would never
   surface. Order within a family is by `md5(match id)`, so the queue is stable between page loads and
   nobody gets a re-roll. Auditing per family is also the evidence `INTERRUPT_ELIGIBLE` asks for: the
   graduation rule is "a week briefing-only and hand-audited", and the page shows, per family, days
   live, audited count and false-positive rate next to a plain "eligible to graduate: yes/no" that
   does not itself edit the set. Graduation stays a reviewed code change.
9. **Survey: one question, asked once, after the trip ends.** "Would you pay $5 to have this trip
   watched?" Yes / No, plus optional free text. Shown as a card on the trip page and linked from the
   last briefing, once `trip.ends_at` has passed, for trips that held a pass. It is not a push and
   not an email of its own (Resend is unset; an in-app card works today, and the email link is a bonus
   when it is on). First trip free is the trial, so this asks the question the free trip makes
   answerable.

## Schema — one migration, alone (`0020`)

```
model_call(id, created_at, purpose, model, trip_id null, match_id null,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
           latency_ms, ok bool, error text null)
  index (created_at), (purpose, created_at)
  trip_id / match_id: ON DELETE SET NULL — spend outlives the trip it was for.

verdict_audit(id, match_id uuid null unique (no foreign key — see below),
              family, kind, route, verdict jsonb, evidence jsonb,
              correct bool, reason text null, note text null, auditor text, audited_at)

trip_survey(trip_id uuid pk -> trip ON DELETE CASCADE, would_pay bool,
            note text null, answered_at)
```

`purpose` is a text value from a closed set in the domain (`judge`, `briefing`, `compose`, `extract`,
`translate`, `ask`, `suggest`, `road`), validated at write.

**`verdict_audit` must outlive its match.** `event_match` cascades away with its trip, and an audit
that disappears when a trip is deleted silently moves the false-positive rate. So the audit stores
what it judged: `kind`, `route`, the `verdict` and the event's evidence as a snapshot (the same
argument `intervention.offer` already makes), with `match_id` a plain nullable column, not a foreign
key.

## Layers

```
domain/watch/kill-criteria.ts   bands, floors, Wilson interval, normalise-to-7-days, price table, audit sampling order
dal/metrics.ts                  every dashboard query, read-only SQL
dal/model-calls.ts, dal/audits.ts, dal/surveys.ts   writes
bll/ops-dashboard.ts            gathers the dal reads, hands them to the domain, returns one view model
bll/audit.ts, bll/survey.ts     next-to-audit, record an audit, offer and record a survey
infra/openai.ts                 records a model_call per call (see below)
server/routes/ops.ts            POST /api/ops/audits (requireCurator); POST /api/trips/:id/survey
app/ops/page.tsx                the page
```

`infra` may import `dal` (`src/layers.test.ts`), so the recorder sits where the call is made.
`generateJson` gains a required `purpose` and an optional `{ tripId, matchId }`, and writes one row
after the response, **fire-and-forget with its own catch**: bookkeeping must never fail a judgement.
Required, not optional, so the compiler finds all eight callers and none can be forgotten. A failed
call (timeout, incomplete) is recorded with `ok = false`; failures are spend too.

Not changed: the judge, router, matcher, briefing composer and detectors. `kill:count` stays as the
pre-launch instrument over synthetic trips; the dashboard is its live counterpart and reuses no code
from it.

## The page

One column, top to bottom, no tabs — the daily review is a scroll, not a navigation.

1. **Cohort line:** trips, trip-days, date range, last pipeline run (from `job`/`event_match.matched_at`),
   and a red banner if the pipeline has not run in 3 h. A dashboard that looks fine because nothing is
   arriving is the failure to design against.
2. **Six kill rows:** metric, value with interval and n, the continue/stop lines, the band chip, and a
   one-line "what this needs" when the answer is `not enough data`. Row 4 (per-trip) shows the
   interrupt share beside it.
3. **Pipeline health:** matched pairs per trip-day by family (cap 12), pairs → verdicts → not-dropped
   funnel per family, `route_reason` mix, `rejections` mix (the earliest signal a prompt edit broke
   something), and trip-generation `source` mix (cache / model / retry / template / failed).
4. **Spend:** tokens and (once priced) dollars by `purpose`, per cohort trip and per trip-day, against
   the §11 envelope of $30–60 a month for 100 travellers.
5. **Radius:** per family, distance from event to node for pairs that were not dropped against pairs
   that were, as five buckets (0–1, 1–3, 3–5, 5–10, 10+ km), and the count of matched pairs per
   worth-sending verdict. If everything worth sending sits inside the first two buckets the radius is
   buying only junk beyond them. Distance is computed at read time from live geometries
   (`ST_Distance`); pairs whose event has been removed are omitted and the count of omitted is shown.
6. **Audit queue:** the next sampled verdict, with the event's evidence, the offer as the traveller saw
   it, the stop and its day, and two buttons — *Right to send* / *Wrong to send* — plus an optional
   note. "Wrong" has a reason picker (`not relevant`, `wrong place`, `already over`, `alarmist`,
   `other`) because the reasons are what tell you which guard to write next. Below it, per family:
   audited, wrong, rate, interval, days live, graduation hint.

## Honest limits, written on the page where they apply

- **Email opens are inflated.** Apple Mail Privacy Protection pre-fetches the pixel, so an open from
  an iOS recipient may be a machine. In-app opens are real. Show the two separately; the kill row uses
  the combined figure because that is what the criterion names, and the caption says it overstates.
- **`ignored` is silence, not rejection** (decision 5).
- **Mute is under-counted** while push is unregistered: nobody can mute a channel they never had. The
  mute row reads `not enough data` until at least five cohort trips have a registered device.
- **Audit is one auditor, who built the thing.** The page records `auditor` and says so. The false
  positive rate is therefore the builder's judgement, which is better than nothing and worse than a
  traveller's; the intervention's `dismissed` rate is the independent cross-check and sits beside it.

## Tests

- Domain, no database: banding at each edge (exactly on a line, interval straddling it, n below the
  floor); Wilson interval against known values; 7-day normalisation for a 3-day and a 14-day trip;
  stratified sampling order is stable and reaches a small family while weather is large; price
  table arithmetic including cached and reasoning tokens.
- DAL against Neon, via the pattern the smoke scripts use: `npm run smoke:ops` builds a cohort of
  three trips with known outcomes, mutes, opens, routes and a survey answer, and asserts each of the
  six figures equals what was planted — and that a seeded trip with no owner and a curator's trip are
  excluded. This is the test that catches a wrong join, which unit tests cannot.
- `layers.test.ts` already covers the placement. A test that every `generateJson` caller passes a
  `purpose` is the compiler's job and needs none.
- Browser check with `next-dev-loop`: the page renders, an audit click writes a row and advances the
  queue, a non-curator gets the refusal, the empty database renders `not enough data` for all six.

## Order and commits

Each is its own commit; the migration is alone.

1. Domain: `kill-criteria.ts` with bands, Wilson, sampling order, price table, and their tests.
2. Migration `0020`: `model_call`, `verdict_audit`, `trip_survey`. Alone.
3. `model_call` write path: dal + `generateJson` takes `purpose` + all eight callers updated. This is
   the one with a deadline: **every day before it lands is a day of spend that cannot be recovered.**
4. DAL metrics queries + `bll/ops-dashboard.ts` + `smoke:ops`.
5. `/ops` page, rows 1–5 (read-only).
6. Audit: dal, bll, route, queue UI, per-family table.
7. Survey: dal, bll, route, trip-page card, link in the final briefing.
8. Docs: tracker, build-plan ticks, `running-the-pipeline.md`, implementation-plan §11 with the
   measured spend once there is some.

Step 3 can go first and alone if there is any reason to start recording before the rest is ready.

## Open questions for the user

1. **Model prices** for `gpt-5.4-mini` (input, cached input, output per million tokens). Needed for
   dollars; everything else works without them.
2. **Cohort definition** (decision 2). The default excludes curators and ownerless trips. If a
   friend-and-family trip should count or not is yours to call.
3. **Survey placement** (decision 9). Default: in-app card plus an email link when Resend is on.
   Say so if the native shell should carry it too; today it would not.

## Not in scope

Alerting (the dashboard is read on a schedule, by one person), a historical trend store beyond what the
tables already hold, sampling of dropped verdicts, any public page, and any change to the router's
behaviour. The graduation of a detector stays a deliberate edit to `INTERRUPT_ELIGIBLE`, in review.
