# Running the watch pipeline

Status: written 2026-09-21 when Phase 3 landed, updated the same day when Phase 4 did. Phase 3 built
the whole pipeline and switched none of it on; Phase 4 added the one channel that delivers. This
file is the list of switches — what is off, why, what turning each one on unblocks, and in what
order. Update it as each switch flips; delete it when they all have.

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

### 1. `OPENAI_API_KEY` — the provider changed, and has not been called yet

Every model call — the judge, the briefing composer, trip generation — runs on OpenAI's
`gpt-5.4-mini` (`src/infra/openai.ts`, which pins the id). It replaced Gemini on 2026-09-25. The
Gemini key was on a free tier capped at twenty calls a day per model: enough for the one briefing
it composed on 2026-09-24, below one run of the eval harness, and its `gemini-3.8-flash` returned
503 on two runs in three.

`OPENAI_API_KEY` is **not set yet**. Set it (on a project with billing, in `.env` and on Vercel),
then run the three things below. The judge and `kill:count -- --judge` have never met a model;
the briefing composer has, but not this one.

```
npm run judge:eval                  # the 30 fixtures against the real model
npm run kill:count -- --judge       # the half of the kill-criteria check that decides Phase 8
npm run smoke:briefing -- --model   # the briefing composer's prompt, end to end
```

`judge:eval` prints relevance, impact accuracy and framing as three separate numbers, plus the
false-positive rate against the kill line (continue below 15%, stop above 35%). **The first run is
the baseline** — nothing is gated on it yet, so record the numbers somewhere before touching the
prompt.

`smoke:briefing -- --model` swaps the stubbed composer for the real one and walks the whole delivery
path. It is the thing to run after any edit to the briefing prompt: the guards in
`src/domain/watch/briefing.ts` are what catch a draft that has stopped covering its bundle, and a
prompt edit is exactly what makes that happen.

`kill:count -- --judge` answers the question the whole phase exists to ask: how many interventions
per trip the router would actually send. Below 2 and detector expansion (Phase 8) stops being a
nice-to-have and becomes the thesis. Above 8 and the judge is too talkative to let the briefing ship.

It also gates trip generation, which is separately blocked on the 600 curated places.

### 2. A Trigger.dev account — nothing runs on a timer

The clock is `src/trigger/watch-pipeline.ts`: one hourly scheduled task that calls the three
`/api/cron/*` handlers in order over HTTP. **Trigger.dev is the clock and nothing else** — the work
stays on Vercel, and the Postgres queue and its drain are untouched.

To switch it on:

1. `npx trigger.dev@latest login` (opens a browser), then put the **development** secret key from
   the dashboard into `TRIGGER_SECRET_KEY` in `.env`. Both are CLI-only — the Next app never reads
   them. The project ref is committed in `trigger.config.ts`.
2. On the Trigger.dev environment, set **`APP_URL`** (the deployed origin, no trailing slash) and
   **`CRON_SECRET`** — the task reads those, not the local `.env`.
3. Set the same `CRON_SECRET` on Vercel. Without it the routes return 503 rather than running: an
   unset secret in production is the configuration mistake the guard exists to survive, so it
   refuses instead of waving requests through.
4. `npm run trigger:dev` registers the tasks against the development environment and keeps them
   running locally; `npm run trigger:deploy` publishes them.

Four tasks are exported. `watch-pipeline` is the hourly schedule — sense, match, drain — and
`morning-briefing` runs `briefing` then `drain` at 07:30 Asia/Tbilisi, written in Tbilisi's zone
rather than as 03:30 UTC. `run-watch-pipeline` and `run-morning-briefing` do the same passes on
demand; trigger them from the dashboard when you want a cycle now rather than at seven minutes past,
which is most of what you want while the pipeline is still being read by hand.

Note that `src/trigger` is a layer in its own right (`src/layers.test.ts`): an entry point beside
`src/server`, allowed to call a use case and not a repository. That is what keeps the option of
running the pipeline on Trigger.dev open without the tasks quietly growing their own data access.

#### Why not Vercel cron

It was tried and it failed the deployment (see above). Vercel Pro is $20/mo; Trigger.dev is free at
hourly and $10/mo for finer, and brings a run history, logs and retries that Vercel cron does not.

Hourly is not a compromise: the weather is re-forecast hourly, so that is the cadence the design
actually calls for. The finer schedules in `context/architecture.md` — match every five minutes,
drain every minute — are throughput settings for a scale this project does not have at 0.8 pairs per
trip-day. Buy the $10 tier when that stops being true, or go back to Vercel cron if Pro is bought
for other reasons; `context/architecture.md` still holds the `vercel.json` for that.

One honest cost: this puts a third party in the watch loop and adds a second place secrets live and
a second deploy step. Vercel cron would have been zero extra infrastructure.

#### The bigger version, deliberately not taken

Trigger.dev could run the pipeline rather than just trigger it — tasks on their infrastructure have
no Vercel function ceiling and bring their own retries and concurrency control, which would make the
`job` table and the drain largely redundant. That is a real option and it is a Phase 5 decision to
make on evidence, not in passing: the queue is built, tested and exercised, and the drain's 240s
budget fits Vercel's 300s ceiling comfortably. If it is ever taken, `judgeMatch(matchId)` is already
a plain function a task could call directly — which is what the layering was for.

### 3. `RESEND_API_KEY` + `BRIEFING_FROM` — the briefing is written but not posted

The briefing composes, stores and renders without them; only the send is skipped, and
`briefing.email_error` says which variable was missing. Turning it on needs a verified sending
domain at Resend — DNS records, so start it a day before you need it — and `BRIEFING_FROM` set to
the verified identity. `APP_URL` must also be set, because a link in an email has to be absolute;
unset, the send is refused rather than a briefing going out with broken links.

Until then the in-app briefing at `/trips/{id}/briefing` is the whole product surface, which is
enough to put in front of the three travellers Phase 4 asks for.

### 4. `OPEN_METEO_API_KEY` — the detector is on a licence it should not be on

The weather detector works today on Open-Meteo's free tier, which is CC BY 4.0 and **non-commercial**.
Fine for development, not for a paid product. The key switches `src/infra/open-meteo.ts` to the
commercial endpoint with no other code change.

### 5. The 600 curated places — the judge can only swap in `verified` places

`nearbyAlternatives` offers the judge `curated` and `verified` places. With 0 curated and 11,590
verified, every alternative it can propose today is a place nobody has hand-checked. The tier rule
holds — an intervention may name a `verified` place by design — but the quality of what it proposes
is the quality of Overture's data until the curation queue at `/curate` has run.

## Checking it without switching anything on

These three work today, against the live database, and none of them costs a model call:

```
npm test                # 269 tests; the watch layer's are in src/domain/watch/
npm run smoke:watch     # trip → watch → sense → match → queue → drain, judge stubbed
npm run smoke:briefing  # bundle → compose → store → email → opened, composer and mailer stubbed
npm run kill:count      # pairs per trip-day over synthetic trips and archived weather
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

`smoke:briefing` is the one to run after touching anything in the briefing. It walks three paths on
purpose — a good draft, a draft the guards refuse, and a day with nothing on it — because the second
and third are the ones that happen at 07:30 on a Tuesday when nobody is watching. It creates a
throwaway account so the email path is exercised: an anonymous trip is briefed in the app and never
emailed, which is correct and is exactly why a test that only makes anonymous trips proves nothing
about delivery.

## Housekeeping that has no owner yet

- `purgeExpiredEvents` runs inside the sense loop and drops events more than 30 days past their
  window, keeping any an intervention cites. Nothing calls the sense loop on a timer, so nothing is
  being purged.
- Failed jobs keep their row after `MAX_ATTEMPTS` — the error is the only record of what the
  pipeline could not do. A judge job that gives up leaves its pair queued and unjudged; the quiet
  briefing counts it as unresolved rather than calling the day clear. `queueDepth()` counts them; nothing surfaces them yet. That is Phase 9's
  dashboard.
- `event_match` rows accumulate for the life of the trip. Fine at this scale; revisit when
  `pairsPerTripDay` is being read regularly.
- A pair routed to `briefing` whose stop passes before a briefing ever covers it keeps
  `delivered_at` NULL for ever. Harmless — it can never match the bundle filter again — and
  deliberate: "judged, never delivered" is a truer row than one backdated to look sent.
- `intervention.outcome` is NULL on every briefing row. The accept/dismiss path ships in Phase 5
  with the patch it applies, and the sweep that marks the rest `ignored` ships with it.
