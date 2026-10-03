# Phase 8 design — detector expansion and the road-automation spike

Status: spine built (event kinds, `source_item`, extraction guards — see "Built so far"); detectors
not started. Written 2026-10-03 against `main` at `2a80296`. The checklist is in
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

- **Sources:** general news plus tourism, weather and roadside coverage, English or Georgian; Georgian
  is translated to English by a model first. The named list still has to be written
  (`data/event-sources.json`) — see "Still needed".
- **The 4–8 band counts everything the judge found worth telling**, not interrupts only. That is the
  figure `kill:count -- --judge` already reports (2.2), so briefing-only detectors *do* move it, and
  the dashboard (Phase 9) shows the interrupt share beside it.
- **Detector 5 is reports only.** Opening hours are curated by hand and the validator already reads
  them; there is no second source to poll. Drift is the curator-edit hook above.

## Built so far

| Step | State |
|---|---|
| 2. Event kinds, radii, stale windows, labels | Done — `src/domain/watch/event.ts`. A kind that is not weather is observed once and stays matchable 72 h |
| 1. `source_item` migration | Written (`0016_source_items.sql`), **not applied** to Neon |
| 1. Translator and extractor ports, extraction guards, `toEventDraft` | Done and tested — `src/domain/watch/extraction.ts` |
| 1. `source_item` repository, feed adapter, OpenAI translator and extractor, `sense-news` stage | Not started |
| 3–7 | Not started |

## Still needed from the user

- The named sources: feeds and pages, with the outlet's language. Georgian-language coverage is
  the part an engineer cannot judge. Until the list exists, nothing can be polled.
- Google Cloud credentials for Translation v3 (service account), if Google rather than the OpenAI
  model should do the translating.
- Applying migration `0016` to Neon, which I have not done.
