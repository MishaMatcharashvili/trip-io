# Running the watch pipeline

Status: written 2026-09-21, when Phase 3 landed. Phase 3 built the whole pipeline and switched none
of it on. This file is the list of switches — what is off, why, what turning each one on unblocks,
and in what order. Update it as each switch flips; delete it when they all have.

`context/architecture.md` says what the pipeline *is*. This says how to make it run.

## What failed, and why it is worth writing down

The Phase 3 PR shipped a `vercel.json` scheduling the three cron handlers hourly, every five
minutes, and every minute. **The deployment failed.** Vercel Hobby cron runs once per day and
rejects a sub-daily expression at deploy time — which `docs/implementation-plan.md` §2 had already
said in as many words, and which the Phase 0 procurement checklist had already flagged by leaving
Vercel Pro unticked.

The fix was to remove `vercel.json`, not to relax the schedules. Daily schedules would have deployed
cleanly and silently broken the hourly sense loop that the cost model and the two-channel design
both rest on. **A deploy that goes green by weakening the design is worse than a red one**, because
the red one is still telling you the truth.

The general rule this leaves: before adding anything the hosting platform validates — cron
schedules, `maxDuration`, regions — check `docs/implementation-plan.md` §2 and the procurement
checklist in `context/progress-tracker.md` for whether the account is on a plan that allows it.

## The switches, in the order they pay off

### 1. `GEMINI_API_KEY` — the judge has never been called

Nothing in the watch layer has spoken to a model. This gates the most valuable unrun thing in the
project.

```
npm run judge:eval              # the 30 fixtures against the real model
npm run kill:count -- --judge   # the half of the kill-criteria check that decides Phase 8
```

`judge:eval` prints relevance, impact accuracy and framing as three separate numbers, plus the
false-positive rate against the kill line (continue below 15%, stop above 35%). **The first run is
the baseline** — nothing is gated on it yet, so record the numbers somewhere before touching the
prompt.

`kill:count -- --judge` answers the question the whole phase exists to ask: how many interventions
per trip the router would actually send. Below 2 and detector expansion (Phase 8) stops being a
nice-to-have and becomes the thesis. Above 8 and the judge is too talkative to let the briefing ship.

It also gates trip generation, which is separately blocked on the 600 curated places.

### 2. Vercel Pro — nothing runs on a timer

The three handlers exist, are secured by `CRON_SECRET`, and are invoked by hand. Enabling Pro makes
this file the whole change:

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

Set `CRON_SECRET` in the same sitting. Without it the routes return 503 rather than running — an
unset secret in production is the configuration mistake the guard exists to survive, so it refuses
instead of waving requests through.

Pro also lifts the function ceiling to 800s, which the drain does not need (it stops at 240s by
design) but trip generation does.

### 3. `OPEN_METEO_API_KEY` — the detector is on a licence it should not be on

The weather detector works today on Open-Meteo's free tier, which is CC BY 4.0 and **non-commercial**.
Fine for development, not for a paid product. The key switches `src/infra/open-meteo.ts` to the
commercial endpoint with no other code change.

### 4. The 600 curated places — the judge can only swap in `verified` places

`nearbyAlternatives` offers the judge `curated` and `verified` places. With 0 curated and 11,590
verified, every alternative it can propose today is a place nobody has hand-checked. The tier rule
holds — an intervention may name a `verified` place by design — but the quality of what it proposes
is the quality of Overture's data until the curation queue at `/curate` has run.

## Checking it without switching anything on

These three work today, against the live database, and none of them costs a model call:

```
npm test              # 232 tests; the watch layer's are in src/domain/watch/
npm run smoke:watch   # trip → watch → sense → match → queue → drain, judge stubbed
npm run kill:count    # pairs per trip-day over synthetic trips and archived weather
```

`smoke:watch` is the one to run after touching anything in the pipeline. It proves the three things
unit tests cannot: that one trip in Tbilisi makes exactly one region worth polling, that the matcher
picks the outdoor stop and leaves the museum alone, and that a failing job is backed off with its
error kept rather than losing the queue. It writes a stand-in event when the sky is clear, because a
rehearsal that only works in bad weather is not a rehearsal.

## What the pipeline has already told us

`npm run kill:count` builds 24 synthetic trips across the four focus areas, lays six real weeks of
archived weather over them (two in-season years plus January, April, July and October) and runs the
real match query:

- **0.8 matched pairs per trip-day**, worst case 3.4 in Svaneti in January. The budget is about a
  dozen, above which the match radius is too wide rather than the prompt too long. The radius is not
  the problem.
- **The weather detector is seasonal, and the traveller season is the quiet one.** A September week
  in Kazbegi produced no events at all; January in Svaneti produced 24 pairs. Whatever the judge
  says once it can run, one detector will not carry a summer trip — which is an argument for
  Phase 8 that exists before the judge has said anything.

## Housekeeping that has no owner yet

- `purgeExpiredEvents` runs inside the sense loop and drops events more than 30 days past their
  window, keeping any an intervention cites. Nothing calls the sense loop on a timer, so nothing is
  being purged.
- Failed jobs keep their row after `MAX_ATTEMPTS` — the error is the only record of what the
  pipeline could not do. `queueDepth()` counts them; nothing surfaces them yet. That is Phase 9's
  dashboard.
- `event_match` rows accumulate for the life of the trip. Fine at this scale; revisit when
  `pairsPerTripDay` is being read regularly.
