# Phase 8 design — detector expansion and the road-automation spike

Status: **built** (2026-10-04) — all four detectors and the spike harness; see "Built" at the end for
what ran, what did not, and what the spike decided. Written 2026-10-03 against `main` at `2a80296`. The checklist is in
`context/build-plan.md`; the reasoning behind the detector list is `docs/implementation-plan.md` §8
and §12. This file says how to build them. Update it when a decision here changes.

## Why this phase exists, in one number

`kill:count -- --judge` measured **2.2 interventions worth sending per 7-day trip** from the weather
detector alone, against a 4–8 band and a stop line of 2. Weather is seasonal (12 of the 53 came from
one January week in Kazbegi), so the other detectors have to carry the in-season weeks. That makes the
order below a question of which detector adds the most trip-relevant events for the least risk.

## What Phase 8 has to leave behind

1. Four detectors that write `world_event` rows and nothing else — the matcher, judge and router
   never learn they exist.
2. **No new detector can interrupt.** `INTERRUPT_ELIGIBLE` stays empty. For safety this is enforced
   twice (below), because "empty today" is not a guarantee about next month.
3. A labelled record of what the extractor found against what a person reported, which is the only
   evidence the road-automation spike can be decided on.

## The shape every detector shares

```
source adapter → translator → source_item → extractor → guards → EventDraft → upsertEvent
(infra)          (port)        (dal)         (port)      (domain)  (domain)     (existing)
```

- **Everything past the translator is English.** Sources are general news plus tourism, weather and
  roadside coverage, Georgian as often as English. A Georgian item is translated to English by a
  model before anything reads it; the extractor sees English, the quote guard is checked against the
  English, and the original is stored beside it (`source_item.original_text`) so a person auditing a
  claim can check it against what was printed. The traveller only ever reads English.
- **`Translator` is a port** (`src/domain/watch/extraction.ts`), like `Judge`. The user asked for
  Google's LLM translation. Cloud Translation v3's LLM model needs a service-account token, not
  the API key the Places adapter uses, and none is provisioned — so the first implementation, until
  there is one, is the already-keyed OpenAI model behind the same port, and the Google adapter is a
  one-file swap in `src/infra` when credentials exist. A translator must not summarise: the quote
  guard would otherwise pass against words nobody printed.

- **`source_item`** (new table, own migration): `source`, `url`, `content_hash`, `fetched_at`, `text`,
  `extraction jsonb`, `status` (`new | extracted | rejected | published`), `reason`. One row per
  distinct article or page. It makes the sense loop idempotent (an item whose hash was seen is never
  sent to the model twice), and it is the audit trail and the label set for the spike. Detectors 3
  and 4 need it; 5 and 6 do not.
- **Extractor** is a domain port, like `Judge` and `Composer`; the OpenAI implementation lives in
  `src/infra` beside the others, behind the same pinned model in `src/infra/openai.ts`. Structured
  output from the Zod schema, the same way the judge does it.
- **Guards are deterministic and live in the domain**, tested without a model. An extraction that
  fails any guard is stored as `rejected` with the reason and never becomes an event:
  - it quotes the passage it relied on, and the quote appears **verbatim** in the source text;
  - its place resolves against a gazetteer (municipality or named corridor) to a sense region — an
    unresolvable place is dropped, not guessed;
  - its window is sane (starts no more than 14 days out, ends after it starts, at most 7 days long);
  - its confidence is capped per detector (below), whatever the model claimed.
- **New event kinds**, namespaced so `radiusFor` forces a deliberate decision for each:
  `event.festival`, `event.closure` (a street or site shut for an event), `safety.demonstration`,
  `safety.advisory`, `hours.closed`, `rail.cancelled`, `rail.delayed`. Add them to `eventKinds`
  in `src/domain/watch/event.ts`; the compiler then makes `radiusFor` and the briefing's labels
  exhaustive. `event.*` and `safety.*` get a *city* radius (2–3 km); `hours.closed` gets no spatial
  slop at all — it matches by `place_id`.
- **Mute families** (`trip_watch.muted_sources`) gain `events`, `safety`, `hours`, `rail`. No schema
  change: the column is already free-text array, the settings form lists the families.
- **Clock:** `sense-news` (30 min) and `sense-events` (6 h) are new stages in the Trigger.dev task,
  not Vercel cron (Hobby rejects sub-daily at deploy time). The task uses 2 of the free tier's 10
  schedules today; these two are stages inside the existing hourly task if the cadence can bear it,
  and a separate schedule only for the 30-minute news poll. Rail is a weekly schedule of its own.

## The four detectors, in the order to build them

### 5. Opening hours — first, because it needs no model

Two inputs, both deterministic:

- **A report.** A "this was closed" / "different hours" button on a place, one tap, no free text
  (the road form's lesson). Stored like a road report and moderated the same way: an operator's
  publishes at once, a stranger's waits. Writes `hours.closed` for the date, geometry = the place.
- **Drift.** `place.opening_hours` is captured by hand during curation (no source provides it for
  Georgia) and the coherent-day validator already reads it through `isOpenThroughout`. So a node
  scheduled outside a place's hours is caught when the day is written, not by a detector. What
  drift adds is the other direction: a *curator correcting* a place's hours after trips are
  planned. On that edit, write an `hours.closed` event for the affected dates so live trips that
  now conflict are matched and judged. It is only as good as the curated set (0 of 600 today),
  so it is a hook to build with the curation UI, not a source to poll. Do not scrape.

Confidence: 0.8 operator, 0.6 community. Cheapest detector; ships first so the matcher sees a
second `kind` family end to end.

### 6. Rail — second, and honestly a thin one

A weekly reminder (Monday 06:00, Trigger.dev) to an operator to check Georgian Railway for
cancellations; the answer goes in through the road report form's pattern, with rail routes in place
of the twelve road corridors. Confidence 0.9 from an operator.

**Problem to settle first:** `transfer` nodes carry `meta.corridorSlug` for roads and nothing for
rail, so a rail disruption has nothing to match. Either transfers gain `meta.mode` and a route slug
(a patch-grammar and validator change, and generation has to emit it), or rail waits until trips
model train legs. Recommendation: do the cheap half — an event on a rail route matches any
`transfer` within the route's buffer — and say plainly in the briefing that rail is "checked
weekly", never "watched". Mirror the road detector's honest "not watched yet" strip state until a
report has ever been entered.

### 3. Events and festivals — third, the first one that calls a model

Sources are a short, hand-picked list in `data/event-sources.json` (Tbilisi city hall, a few
cultural calendars, regional festival pages) — not a crawl. Poll every 6 h, hash the page text,
extract only when the hash moved. Extraction yields name, place, window and an effect
(`crowds | closure | opportunity`). Confidence cap 0.7.

- A `closure` effect (a street shut for a parade, a site booked out) is a disruption and goes through
  the existing verdict path.
- An `opportunity` effect (a wine festival in Telegi the week you are in Kakheti) is the one the
  concept doc cares about and the one most likely to be noise. Confirm the judge's verdict shape
  can express "worth adding" before building; if it cannot, v1 reports events as briefing context
  only and the opportunity path is Phase 9+.
- Prefilter before the model: a page that does not change costs nothing, and a changed page with
  no date in the next 14 days is dropped by a regex, not a call.

### 4. Protests and safety — last, and gated twice

The highest-variance source and the highest-stakes topic. It ships so the gate can be tested, not
because it is expected to be loud.

- **Gate one — the router.** `INTERRUPT_ELIGIBLE` omits `safety.*`. That is the existing mechanism
  and it stays.
- **Gate two — a hard rule beside it.** A `NEVER_INTERRUPT` prefix list in `route()` that returns
  `briefing` for `safety.*` *even if someone adds the kind to `INTERRUPT_ELIGIBLE`*, with a test
  that asserts it. Graduating a safety kind then needs a deliberate edit to this rule, in review,
  not a one-line set insertion on the way to something else.
- **Corroboration.** An item becomes an event only when two independent outlets report it, or one
  outlet plus an operator's approval (the road-report queue, reused). A single-source extraction
  stays `rejected: uncorroborated`.
- **Wording guard.** A claim must describe an event ("a demonstration is scheduled on Rustaveli
  Avenue 18:00–21:00"), never characterise a place or people ("Tbilisi is unsafe"). The guard
  rejects a draft whose evidence line names no street, time or authority.
- Confidence cap 0.5, severity cap `moderate`, window capped at 24 h, regions limited to
  municipalities where a trip is live.
- RSS only. No social scraping.

## The road-automation spike

The question: does extraction over news and the Roads Department's page reproduce what operators
entered by hand on the twelve corridors?

**What exists:** `road_report` rows, with their approval outcomes, since the form shipped. As of
this writing there are **zero** — the bot is unconnected. The spike therefore cannot conclude yet,
and the design says so instead of inventing a result.

What Phase 8 builds is the *harness*, so the decision is a script run, not a project:

1. `source_item` already holds every news item the extractor saw, with its extraction.
2. `npm run roads:spike` joins extractions of road kind against `road_report` by corridor and
   overlapping window and prints recall (manual events the extractor also found), precision
   (extractor events a person also reported), median lag (extractor later or earlier than the
   person), and every miss with its source text.
3. **Decision rule, fixed now:** automate only if recall ≥ 70% and precision ≥ 80% over at least
   20 manual events; otherwise road stays manual and the form is the product. Writing the threshold
   before the data is what keeps the result from being argued into place.
4. Facebook is out unless the Roads Department offers a feed or API. Scraping a Meta page is a
   terms-of-service decision for the user, not an engineering detail, and is not assumed.

Expect the verdict to be "insufficient data" until real travellers have used the form (Phase 10).
That is a valid outcome and the build-plan item closes on the harness plus that statement.

## Cost and kill-criteria

- Extraction is per *changed item*, not per trip: O(sources), flat as trips grow. Budget it as a
  fixed monthly floor, the same way briefings are, and put the number in `docs/implementation-plan.md`
  §11 once measured.
- Matched pairs per trip-day must stay ≤ 12. Add the new kinds to `kill:count` (synthetic events
  from the archive are not possible for news; use recorded fixtures and say so) and re-measure
  before graduating anything.
- Interventions per trip is still the metric that decides the project. Briefing-only detectors do
  not raise it, by design. **Open question for the user:** is the 4–8 band counted over interrupts
  only, or over everything the judge found worth telling (the 2.2 figure's definition)? If
  interrupts only, nothing in Phase 8 can move it before a detector graduates, and Phase 9's
  dashboard should report both.

## Tests

- Per detector: guard tests in the domain (verbatim-quote, unresolvable place, window bounds,
  wording, corroboration), run without a model.
- Extraction fixtures: recorded Georgian- and English-language articles with the expected
  extraction, added to the eval harness. At least ten per new kind before a kind is eligible to
  be judged against real trips; the 30-fixture judge eval grows by the same.
- `layers.test.ts` already enforces that only `src/infra` names a provider; feeds and the extractor
  go there.
- Router: the `NEVER_INTERRUPT` rule has its own test.

## Order and commits

1. `source_item` migration (alone), repository, and the extractor port with a fake.
2. Event kinds, radii, briefing labels, mute families.
3. Detector 5 (report path, then drift if the catalogue has hours).
4. Detector 6 and the transfer-mode decision.
5. Detector 3: sources file, adapter, extraction, guards, fixtures.
6. Detector 4: gates, corroboration, wording guard, fixtures. Last, so it never exists without them.
7. `roads:spike` harness and the decision rule.

## Decided (2026-10-03)

- **Sources:** general news plus tourism, weather and roadside coverage, English or Georgian;
  Georgian is translated to English by a model first (the pinned OpenAI model, not Google's).
- **The 4–8 band counts everything the judge found worth telling**, not interrupts only. That is the
  figure `kill:count -- --judge` already reports (2.2), so briefing-only detectors *do* move it, and
  the dashboard (Phase 9) shows the interrupt share beside it.
- **Detector 5 is reports only.** Opening hours are curated by hand and the validator already reads
  them; there is no second source to poll.

## Source research (2026-10-03)

Every address below was fetched before it was written down.

| Source | Result |
|---|---|
| civil.ge/feed, jam-news.net/feed/, oc-media.org/feed/ | English RSS, full article text. **On.** |
| netgazeti.ge/feed/, on.ge/rss | Georgian RSS, summary only. **On.** |
| newsgeorgia.ge/feed/ | Russian RSS, summary only. Off — Russian was not asked for. |
| georgiatoday.ge/feed/ | HTTP 500 on every path tried. |
| agenda.ge, interpressnews.ge | No RSS link in the page; HTML only. |
| tbilisi.gov.ge, georgia.travel, yolo.ge, 1tv.ge, bm.ge | No feed at the usual paths. georgia.travel/events and yolo.ge/en/posters/festivals are HTML listings: an HTML adapter, not built. |
| **api.georoad.gov.ge/api/restrictions** | **The Roads Department's own notices as JSON**: public, no key, what georoad.ge itself calls. 4,594 notices, Georgian, with a status code (restriction / restored / partial). Used by the spike. |
| nea.gov.ge, meteo.gov.ge | Reachable; the warnings page was not found at the path tried. Weather stays on Open-Meteo. |

The tourism and events side is the weakest: no tourism outlet publishes a feed. The general-news
feeds do carry festivals, closures and demonstrations, which is what the extractor reads for, but a
real events calendar needs an HTML adapter for georgia.travel or yolo.ge. That is a follow-up, and
those sites' terms have not been read.

## Built

| Step | State |
|---|---|
| Event kinds, radii, stale windows, labels | Done. A kind that is not weather is observed once and stays matchable 72 h |
| `source_item` (migrations 0016, 0017) | Applied to Neon |
| Translator and extractor ports, guards, `toEventDraft`, gazetteer | Done, tested without a model |
| Feed adapter, OpenAI translator and extractor, `sense-news`, `extract` job, hourly stage | Done; **run live** (below) |
| 5. Opening hours — `hours_report` (migration 0018), quorum, `POST /api/places/:id/closed`, a button on the place page | Done; API and database exercised live, **button not seen in a browser** |
| 6. Rail — four lines, operator form in the Telegram bot, Monday reminder | Done; use case exercised live on Neon, **bot never connected to Telegram** (no token) |
| 3. Events — five feeds, translated and extracted | Done; first live run below |
| 4. Safety — two-outlet corroboration, wording guard, `NEVER_INTERRUPT`, judge prompt | Done, exercised with synthetic events; **no real safety event has occurred yet** |
| Road spike — `npm run roads:spike` | Done; result below |

### The first live run (2026-10-04)

`sense-news` fetched 118 items from five feeds, `drain` processed them: 89 were stopped by the
relevance gate before any model call, 23 were read and had nothing, 4 were refused by the guards
(three events already over — the model had extracted a diplomatic reception that had happened —
and one quote with a leading ellipsis), and 2 were still queued. **No event was published from
that run.** After two fixes the one genuine upcoming item (a Georgian-language education fair in
Tbilisi and Batumi, 10–11 October) became two English events, one per city, at the capped
confidence of 0.7. Guards worked as designed; the thin result is the day's news, which was about
German foundations leaving Georgia.

### The road-automation spike (2026-10-04)

Can a model read the Roads Department's notices and reproduce what an operator would enter by hand?
**No, not yet: stay manual.**

20 notices were labelled by hand against the 12 corridors by the engineer who built this, from the
Georgian titles; only notices whose road was clear were included. The decision rule was fixed in
the domain before the data was read (≥ 20 labelled, recall ≥ 80%, precision ≥ 90%, condition ≥ 80%).

| | First run (as pre-registered) | Second run (fixes, same labels) |
|---|---|---|
| Recall on corridors | 6/12 (50%) | 4/12 (33%) |
| Precision | 6/6 (100%) | 4/4 (100%) |
| Condition | 14/20 (70%), graded on all | 10/12 (83%), graded where an event would be written |
| Refused by guards | 2 | 2 |

**The second run is exploratory.** It changed the validator, the prompt and how the condition is
graded after seeing the first result's misses, on the same labels, so it cannot be used as
evidence for the decision; the first run is the evidence. Both say the same thing: **when the model
places a notice on a corridor it is right every time, and it places too few** — it does not know that
Lasdili is on the Zagari Pass road or that Samtredia–Grigoleti is the way to the coast.

Two findings that matter more than the numbers:

1. **The department's own status code is not reliable.** Notice 5244 is coded "restored" for a text
   that says trailers *will be* restricted. The first validator forced the status over the text and
   produced a wrong "reopened" on the Military Road — which would have ended real events. The
   validator now refuses any claim where status and text disagree and leaves it for a person.
2. **Precision of 100% on a small set is the useful result**: it suggests the right shape is
   *assisted*, not automatic — the model proposes a road event from each new notice and an operator
   approves it in the existing Telegram queue with one tap. That removes the typing without removing
   the check. Not built; it is the recommended next step.

To get a decisive answer: grow the labelled set to 50+ with a second reviewer, add a deterministic
place list per corridor (villages, passes, junctions) so the model is not relying on what it happens
to know, and re-run on labels written *before* the list. `GOLD` in `scripts/dev/roads-spike.ts`.

### Done after the first pass (2026-10-04)

- **Mute list.** The watch screen and API now offer events, safety, opening hours and rail;
  `muteFamilies` is derived from the kind namespaces and a test keeps them equal.
- **One event, many outlets.** Event listings merge across outlets the way safety does (source
  `news-events` / `news-safety`, outlets in the payload), so a parade three outlets cover is one row.
- **Judge eval for the new kinds.** Eleven fixtures (`eval/fixtures-news.ts`), built from the keys the
  detectors really write. Real judge, 41 fixtures: **11/11 on the news set, no alarm wording, safety
  fixtures quiet or neutral.** The only failures were the two quiet-urban-stop false positives that
  were already known (a Rustaveli stroll, a taxi across Tbilisi), 13% against a 15% line. The first
  run also missed one "fire" fixture that the second did not, so the model is not deterministic here
  and one run is not a verdict.
- **Assisted road automation** (the spike's recommendation). `sense-roads` reads the Roads
  Department's newest notices; the drain has the model place each on a corridor; a claim that lands
  on one becomes a pending road report, 72 hours long; the operators are sent it once with the
  usual Approve / Reject buttons. A person still decides. Migration 0019 (`notified_at`). Run live
  on the real feed: 9 notices, 3 landed on a corridor (Military Road closed and reopened, Tusheti
  restricted), 6 were left alone; a second pass queued nothing. **Nobody has been sent one: there is
  no bot token and no operator id.** The Tusheti proposal, which is still live, will be announced
  the first time there is.

### Not done, and why

- **`kill:count` over the new kinds.** News has no archive to replay, so the synthetic count cannot
  include it. The pairs-per-trip-day figure for the new kinds is unmeasured; watch it on real trips.
- **An events calendar** (HTML adapter for georgia.travel or yolo.ge). Their terms have not been
  read, and a scraper written before reading them is a decision made for the site.
- **A city event is a whole municipality.** News events are stored with the region's polygon, so a
  closure on one Tbilisi avenue matches every Tbilisi stop and the judge decides (it did, correctly,
  in the eval: a closure on one avenue does not touch dinner across the river). A narrower
  geometry needs a geocoder, which costs money per call and has not been chosen.
- **Rail station coordinates were written from memory** and checked only for plausibility (Kutaisi
  falls inside the Tbilisi–Batumi buffer, Mestia outside it).
- **Anything in a browser or on Telegram.** Chrome cannot start in this environment (missing system
  libraries, `sudo agent-browser install --with-deps`), and there is no bot token.
- **A larger spike.** If the assisted flow is to be trusted to propose without a model-reading
  check, the labelled set needs 50+ notices and a second reader.
