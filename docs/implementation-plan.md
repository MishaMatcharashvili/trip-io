# trip.io — MVP Implementation Plan

REVISION 2 · 14 SEPT 2026 · SOLO, FULL\-TIME · 12 WEEKS

Written against `concept.md`, `watch-layer.md` and `market.md`, plus decisions taken in session. Revision 2 replaces the four\-week plan: scope is now **everything, at a 10–12 week horizon**, which is the concept doc's own budget plus the additions agreed here.

**What this plan commits to.** Full watch layer. Six live detectors plus one dark. Hybrid catalogue — 600 hand\-verified places over a thin raw layer. Two\-channel delivery, briefing before interrupts. Native shell plus web. Subscription revenue. Instrumentation against all six kill criteria. One hundred real travellers at the end.

**What stays cut:** offline. That is the only thing.

* * *

## 1\. Decisions of record

Where this session's answers and `concept.md` disagreed, the resolution:

| Question | Resolution | Source |
| --- | --- | --- |
| Scope | Everything, 10–12 weeks | session — overrides the doc's 10\-week/narrower scope |
| Catalogue | **Hybrid** — 600 curated over thin raw | session — synthesis of both |
| Road detector | Manual Telegram form now; automation explored in week 10 | session — "discover along the way" |
| Client | **Native shell \+ web.** No PWA | session — overrides doc's PWA\-only |
| Flights in v1 trips | No | session — makes flight\-status a dark detector |
| Offline | Cut | session, both revisions |
| Backend | Hono inside Next.js; ElysiaJS dropped | session |
| Worker | Vercel Cron → route handlers | session |
| Revenue | Subscription. Free plans, paid watches | concept.md |

* * *

## 2\. Three findings that override the docs

All three verified this week. Each invalidates a line you are currently building on.

**Open\-Meteo's free tier prohibits commercial use.** `concept.md` and `watch-layer.md` both specify "Open\-Meteo, free, no key" for the detector that your own doc says produces \~60% of real interventions. The free tier is CC BY 4.0, non\-commercial, 10,000 calls/day. A €5/mo subscription is commercial.

Your architecture makes this survivable: sensing per region rather than per trip puts Georgia at roughly 15 calls/hour — about 11,000/month against API Standard's 1M allowance. It becomes a fixed monthly line, not a scaling one. But the cost model's "weather is free" row is wrong, and the subscription price should carry it.

**Vercel Hobby cron runs once per day**, enforced at deploy time — a `0 * * * *` expression fails the build outright. Per\-minute scheduling begins on Pro. The entire sense→match→judge cycle assumes hourly weather, so **Vercel Pro ($20/mo) is a hard dependency of the architecture**, not a later upgrade. Pro also lifts the function ceiling to 800s from a 300s default, which still is not enough to judge a backlog inline — see §5.

**There is no scrapeable Georgian road\-conditions source.** `georoad.ge` now 302\-redirects to `georoad.gov.ge` — a domain migration that postdates your market notes, so the TLS\-chain complaint recorded there is stale. The destination, however, is a construction\-projects news feed: photo cards, narrative Georgian prose, no timestamps, no per\-road status, no JSON endpoint.

`concept.md` reached this conclusion independently and turned it into an argument: *"be the detector before building one… every manual event with its accept/dismiss outcomes is labelled training data."* That reasoning holds. The manual form ships in week 7; week 10 spikes automation against real data and decides.

* * *

## 3\. The two\-channel design is the architecture

This is the most load\-bearing decision in `concept.md` and it belongs at the centre of the build, not in the delivery layer at the end.

| Channel | Cadence | Carries | Cost |
| --- | --- | --- | --- |
| Daily briefing | 07:30, always | everything non\-urgent — weather shape, events, road notes, budget | absorbs the bulk |
| Interrupt | rare | one test only: **does this require action in the next two hours?** | draws on the push budget |

Routing is a pure function over the judge's output, and it should be written as one, testable in isolation:

```ts
function route(verdict, ledger, watch): "interrupt" | "briefing" | "drop" {
  if (!verdict.relevant) return "drop";
  if (verdict.impact === "none") return "drop";        // guard, see §6
  if (verdict.horizon_hrs > 2) return "briefing";
  if (verdict.confidence < INTERRUPT_MIN_CONFIDENCE) return "briefing";
  if (ledger.sent_so_far >= ledger.cap) return "briefing";
  if (inQuietHours(watch)) return "briefing";
  return "interrupt";
}
```

Two consequences for the build order, both taken from your doc and both correct:

1. **The briefing ships in week 6, before any interrupt exists in week 7.** It is the safe channel. You get to watch what the system notices, for a week, before it is allowed to wake anyone up.
2. **Every path out of the router is logged**, including `drop`. A dropped verdict you never see is how a silent ranker regression goes unnoticed for a month.

### The false\-positive rules are validator rules, not guidelines

`concept.md` sets three, and each compiles into code rather than a prompt instruction:

- **Never auto\-apply.** No code path applies a system\-authored patch without an explicit user action. Enforce it at the patch layer: `trip_patch.author = 'intervention'` requires a non\-null `accepted_by`.
- **Always show evidence and source.** `verdict.evidence` is non\-empty and carries a source plus a timestamp, or the verdict is rejected before rendering.
- **Prefer opportunity framing over alarm framing.** Prompt\-level, and checked in the eval harness (§7) rather than hoped for.

* * *

## 4\. Architecture

### Hono inside Next.js — the real reason

Mount Hono at `app/api/[[...route]]/route.ts`, exporting its handler for every verb.

Not for middleware or ergonomics. Because **`hono/client` gives a typed RPC client that works in React Native**, and Next.js Server Actions do not cross into Expo. `hc<AppType>()` gives web and native one end\-to\-end\-typed surface from a single server definition — the role Eden Treaty played for ElysiaJS in revision 1.

Zod becomes the single schema source: request validation via `@hono/zod-validator`, and the same schemas converted to JSON Schema for LLM structured output. One definition, three consumers.

Business logic lives in `src/core/*` as plain functions that both HTTP handlers and cron handlers import. Route handlers stay thin. This is also the escape hatch — Hono runs unchanged on Bun or Node if you outgrow Vercel, and only the entry file changes.

### Stack

| Layer | Choice | Note |
| --- | --- | --- |
| Database | Neon Postgres \+ PostGIS | `CREATE EXTENSION postgis` works on any project. Use the **pooled** connection string; serverless plus direct connections exhausts the pool fast. |
| ORM | Drizzle \+ drizzle\-kit | Raw SQL where PostGIS gets interesting. |
| Auth | Better Auth | Supports the doc's *"no accounts until save"* — anonymous trip in local state, account created at save, trip claimed. Expo support built in. |
| Map | MapLibre GL \+ PMTiles | One `.pmtiles` file on Vercel Blob or R2; MapLibre's pmtiles protocol reads HTTP ranges directly. **No tile server.** Georgia's extract is small. |
| Queue | Postgres table \+ `SKIP LOCKED` | As specced. No Redis. §5. |
| Email | Resend | Briefings. |
| Push | expo\-notifications \+ EAS | Apple Developer account ($99/yr), APNs key, FCM. **Start day one** — credential latency does not compress. |
| Telegram | grammY, webhook | Road\-corridor form. |

* * *

## 5\. The cron problem

Vercel Cron invokes a function; the function dies at 800s. Sensing and matching fit comfortably. **Judging does not** — it is N model calls against a backlog whose size you do not control, and one bad hour puts you over the ceiling with no partial progress saved.

So cron handlers never call the model. They enqueue.

```
0 * * * *    /api/cron/sense-weather   poll regions w/ live trips → world_event
*/30 * * * * /api/cron/sense-news      RSS + extraction (week 10)
POST         /api/telegram/webhook     road reports → world_event
0 6 * * 1    /api/cron/sense-rail      weekly manual-check reminder

*/5 * * * *  /api/cron/match           PostGIS join → event_match → enqueue judge
* * * * *    /api/cron/drain           claim N jobs SKIP LOCKED, stop at 240s
0 3 * * *    /api/cron/briefing        07:30 Tbilisi = 03:30 UTC; one call/trip-day
0 * * * *    /api/cron/outcomes        mark un-actioned interventions `ignored`
```

The drain handler is twenty lines and the reason the system survives a spike: claim with `SELECT … FOR UPDATE SKIP LOCKED LIMIT n`, track elapsed time, stop cleanly at 240s, let the next minute continue. Overlapping invocations are safe because `SKIP LOCKED` makes them so. Every cron route checks `CRON_SECRET` — these are public URLs.

### The match query

The load\-bearing SQL of the whole system:

```sql
SELECT e.id AS event_id, n.id AS node_id, t.id AS trip_id
FROM world_event e
JOIN trip_node  n ON ST_DWithin(e.geom, n.geom, radius_for(e.kind))
JOIN trip       t ON t.id = n.trip_id
JOIN trip_watch w ON w.trip_id = t.id
                 AND tstzrange(w.active_from, w.active_to) @> now()
WHERE tstzrange(e.valid_from, e.valid_to)
   && tstzrange(n.starts_at, n.starts_at + n.duration_min * interval '1 min')
  AND e.observed_at > now() - interval '6 hours'
  AND NOT EXISTS (SELECT 1 FROM event_match m
                  WHERE m.event_id = e.id AND m.node_id = n.id);
```

GiST on both `geom` columns, btree on `trip_node.starts_at`. `radius_for(kind)` is the single dial controlling your model bill. Your own rule: more than \~a dozen pairs per trip\-day means the radius is too wide. **Log pairs\-per\-trip\-day from the first day the matcher runs** — it is a kill\-criteria input, not just an ops metric.

* * *

## 6\. Schema

```sql
-- core
trip           id, user_id nullable, title, starts_at, ends_at,
               party jsonb, pace, budget, prefs jsonb,
               head_patch_id, created_at

trip_node      id, trip_id, kind, place_id, starts_at, duration_min,
               indoor bool, geom geography, meta jsonb

trip_patch     id, trip_id, parent_id, intent text, ops jsonb,
               author(user|system|intervention), accepted_by nullable,
               applied_at, client_seq

checkpoint_log id, trip_id, patch_id, snapshot jsonb, created_at

-- catalogue
place          id, name, name_ka, category, geom geography,
               tier(curated|verified|raw), source, source_id,
               opening_hours jsonb, attrs jsonb, verified_at, verified_by

corridor       id, name, geom geography(LineString), buffer_m,
               season_risk jsonb          -- the 12 curated corridors

-- watch layer
world_event    id, source, kind, severity, confidence, geom geography,
               valid_from, valid_to, observed_at, dedupe_key, payload jsonb

trip_watch     trip_id, active_from, active_to, regions geography,
               channels[], quiet_hours, cap

event_match    event_id, trip_id, node_id, matched_at,
               verdict jsonb, score, judged_at, route(interrupt|briefing|drop)

intervention   id, trip_id, event_id, channel(push|email|briefing),
               sent_at, patch_id,
               outcome(accepted|dismissed|ignored|muted), outcome_at

-- infrastructure
job            id, kind, payload jsonb, run_after, attempts,
               locked_at, locked_by, completed_at, error
```

### `place.tier` — how the hybrid catalogue works

You chose 600 hand\-verified places over a thin raw layer, which is the right synthesis. The tier column is what keeps them from contaminating each other:

- **`curated`** — the 600. You looked at each one. Tbilisi core, the Kazbegi corridor, Kakheti, Svaneti. **The only tier trip generation composes from.**
- **`verified`** — passed the programmatic gate *and* corroborates against a second signal (website, phone, or an OSM counterpart within 50m). Proposable by the judge, so an intervention can suggest a nearby café you never hand\-checked.
- **`raw`** — everything else Overture yields after gating. **Searchable, never proposable.** Keeps the map populated outside the curated core without letting junk into a proposal.

This is what makes the judge's first guard mean something. *"Every `place_id` in `ops` is validated against the curated catalogue"* only constrains the model if the catalogue is trustworthy; validated against raw Overture — whose own docs admit duplicates, junk and thin properties — it passes a hallucinated restaurant as readily as a real one. Enforce the tier check server\-side, in the validator, not in the prompt.

### `intervention.outcome`

Your doc calls this the moat and it is the thing most likely to be deferred to "after launch" and then wired badly. Three rules:

1. The write path ships in the **same commit** as the accept/dismiss button.
2. `ignored` is a real outcome, produced by a cron sweep — an intervention un\-actioned by the end of its `horizon_hrs` window. Without it your acceptance denominator is wrong.
3. `muted` is captured at the notification\-settings layer too, not only per\-intervention. Your doc's note that *"being muted in a proactive product is permanent, not a dip"* makes the mute event more informative than any accept.

* * *

## 7\. The judge, and how you know it works

Input, output and both guards are as specced in `watch-layer.md`. Two additions.

### Guards are server\-side validators

```
reject if  relevant && impact == "none"        // the helpful-but-empty shape
reject if  any ops[].place_id not in (curated, verified)
reject if  evidence empty or missing a timestamp
reject if  interrupt-routed && confidence < INTERRUPT_MIN_CONFIDENCE
```

A rejected verdict is logged with its rejection reason, not silently dropped. Rejection\-reason frequency is your earliest signal that a prompt change went wrong.

### The eval harness — week 5, not week 11

Your kill criteria include *"false\-positive rate, hand\-audited: continue below 15%, stop above 35%."* You cannot measure that, or protect it across prompt changes, without fixtures.

Build thirty `(event, node, trip) → expected verdict` triples: ten that should clearly fire, ten that should clearly not, ten genuinely ambiguous where you record the reasoning rather than a binary. Run them on every prompt edit and every model change. Track impact\-classification accuracy, false\-positive rate, and framing (opportunity vs alarm) as separate scores.

This is a day of work. It pays for itself the first time a tweak that improves rain handling quietly makes the model chatty about wind — which will happen, and which you will otherwise discover from a traveller.

* * *

## 8\. Detector registry

| \# | Detector | Source | Cadence | Week | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | weather\-vs\-activity | Open\-Meteo **commercial** | hourly | 5 | high |
| 2 | road\-corridor | Telegram form, manual | on submit | 7 | high |
| 3 | events & festivals | local pages \+ extraction | 6h | 10 | medium |
| 4 | protests & safety | Georgian news RSS \+ extraction | 30 min | 10 | low → gated |
| 5 | opening\-hours | user reports \+ catalogue drift | on submit | 10 | medium |
| 6 | rail | Georgian Railway, weekly manual | weekly | 10 | high |
| 7 | flight\-status | AeroDataBox | 15 min | dark | high |

**Detector 7 ships dark.** Trips carry no flight legs in v1, so the detector has no input. Build it behind the same interface as the rest and leave it disabled; the day trip legs gain a flight number it activates with no further work.

**New detectors enter on briefing\-only.** A detector may not route to `interrupt` until it has run for one week on briefing\-only and you have hand\-audited its verdicts. Detector 4 in particular — LLM extraction over news is exactly the source that produces a confident, wrong, alarming interrupt. The concept doc's false\-positive asymmetry argument applies hardest to the newest signal.

* * *

## 9\. Build sequence

### Week 1 — foundations, and the procurement that has latency

Neon with PostGIS. Drizzle schema, first migration. Hono mounted, one typed route proving the RPC client end to end. Better Auth with the anonymous\-until\-save flow. Vercel Pro, preview deploys, `CRON_SECRET`.

Day one, in parallel, because none of it compresses: Apple Developer enrolment, APNs key, FCM project, Open\-Meteo commercial plan, AeroDataBox account.

**Also week one: start recruiting.** Your doc wants 100 travellers in week 12, via Tbilisi hostels and Telegram groups. That is a twelve\-week relationship\-building exercise, not a week\-twelve task. Line up three or four hostels now and keep them warm. A watch layer with nothing to watch is the failure that does not announce itself until the end.

### Weeks 1–2 — catalogue and corridors

Overture Places read by DuckDB from S3, filtered to Georgia's bbox, written to Parquet, `COPY`'d into PostGIS. The programmatic gate: require a name, require a category in a \~40\-entry allowlist, dedupe by trigram similarity within 100m, drop anything with no website *and* no phone *and* no address. Assign `raw` and `verified` per §6.

Then the 600. This is your own labour and the plan does not pretend otherwise — roughly a week and a half of hand\-verification across the Tbilisi core, Kazbegi corridor, Kakheti and Svaneti. Capture `opening_hours` while you are there; detector 5 depends on it and no other source will give it to you.

The 12\-corridor table as buffered LineStrings with seasonal risk annotations. Region decomposition for the sense loop — municipality polygons, or corridors plus a coarse grid.

### Weeks 3–4 — trip document and patch log

`trip`, `trip_node`, `trip_patch`, `checkpoint_log`. JSON Patch application. Append\-only log, checkpoint every 20 patches.

Then the **coherent\-day validator**, test\-first, because every intervention in the product depends on it: no overlapping nodes, travel time respected between consecutive nodes, nothing scheduled into darkness, opening hours honoured where known. It must re\-validate the **whole day** after any patch, not just the moved node — moving the hike displaces the museum, which collides with lunch, which pushes the drive into the dark.

Trip generation: constraints → candidate retrieval from `curated` → LLM composition → validator → patch set. Warm\-start cache on a coarse constraint hash. On an invented `place_id`\: reject, retry once with the rejection as feedback, then fall back to a template. Never render an unvalidated plan.

### Week 5 — the pipeline, weather only

`world_event` CAP\-shaped with `dedupe_key` \= source \+ kind \+ region \+ bucketed `valid_from`. `trip_watch` written on trip save. `job` table and the drain handler. The weather sense handler. The match query and its indexes. The judge with all four validators. The router as a pure function.

**No delivery.** Verdicts land in the database and you read them yourself. Plus the eval harness (§7).

### Week 6 — the daily briefing

07:30 Tbilisi, one model call per live trip\-day, bundling everything the router sent to `briefing` with tomorrow's plan shape. Email via Resend, plus an in\-app view. This is the first thing any user receives — and per your doc, it ships before interrupts exist.

### Week 7 — interrupts, budget enforcer, road form

The budget ledger: per\-trip cap of 3–5 for a 7\-day trip, quiet hours, the two\-hour test. The interrupt path and push delivery. The Telegram bot and its form against the 12 corridors.

The intervention UI: coherent\-day diff, accepted or rejected **as a unit**, evidence and source always visible, opportunity framing. And `intervention.outcome` wired in the same commit.

### Week 8 — web client

MapLibre with PMTiles from blob storage. Trip creation and editing. Itinerary view. Checkpoint/undo. Settings — channels, quiet hours, frequency. Subscription paywall: free plans, paid watches.

### Week 9 — native shell

Expo against the shared Hono client: auth, trip list, intervention card with accept/dismiss, push registration, settings. EAS build, TestFlight and Android internal track — beta distribution, so store review stays off the critical path. Heavy UI stays on web by design.

### Week 10 — detector expansion

Detectors 3–6. News RSS extraction for protests and safety, entering briefing\-only and gated. Events from local pages. Opening\-hours user reports. The weekly rail check.

Also the **road\-automation spike**\: given real manual events from weeks 7–9, evaluate whether extraction over news and the Roads Department's Facebook page reproduces them. Decide on evidence. This is the "discover along the way" lane, with a date on it.

### Week 11 — instrumentation and the kill\-criteria dashboard

Every metric in §10, on one page, measured rather than estimated. Judge spend, pairs\-per\-trip\-day, rejection\-reason mix, radius tuning. The hand\-audit workflow for false\-positive rate — a queue of sampled verdicts you mark correct or not.

### Week 12 — 100 travellers

Tbilisi hostels and Telegram groups. Onboarding, a support loop, and a daily look at the dashboard.

* * *

## 10\. Kill criteria, and what each one requires

From `concept.md`, with the instrumentation each depends on. Build the right\-hand column in week 11 at the latest; three of these need writes that exist from week 7.

| Signal | Continue | Stop | Requires |
| --- | ---: | ---: | --- |
| Interventions acted on | ≥ 40% | \< 15% | `outcome` \+ the `ignored` sweep |
| Notifications disabled during trip | \< 10% | \> 25% | mute events at settings *and* per\-intervention |
| Briefing opened per trip\-day | ≥ 50% | \< 20% | open tracking on email and in\-app |
| Interventions per trip worth sending | 4–8 | \< 2 | router log including `drop` |
| False\-positive rate, hand\-audited | \< 15% | \> 35% | sampling queue \+ audit UI |
| Would pay $5 per watched trip, asked post\-trip | ≥ 25% | \< 8% | post\-trip survey trigger |

**Row 4 is the one your doc flags and it is the one this plan is most exposed to.** *"If the system only ever finds 1–2 things worth saying per trip, the watch layer is a feature, not a product."*

It is measurable in week 5, before a single notification is delivered — run the pipeline against synthetic trips over historical weather and count what the router would have sent. If that number comes back at 1–2 with the weather detector alone, you learn the most important thing in the plan six weeks before you would otherwise, and detector expansion stops being week 10's nice\-to\-have and becomes the whole thesis.

Do this in week 5. It is the cheapest high\-information test available to you.

* * *

## 11\. Running costs

| Item | Monthly |
| --- | ---: |
| Vercel Pro — **required** | $20 |
| Neon (Launch tier at 100\-traveller scale) | $19 |
| Open\-Meteo commercial, API Standard | see checkout |
| AeroDataBox (dark detector, minimum tier) | \~$5 |
| Resend, blob storage, Telegram | \~$0 |
| Model calls — judge, generation, briefing, extraction | $30–60 |
| Apple Developer ($99/yr amortised) | \~$8 |
| **Approximate total at week 12** | **$90–130** |

At 100 travellers on 7\-day trips: roughly 7,000 judge calls and 700 briefing calls across the cohort. Every line except model calls is fixed, and model calls are bounded by the match radius — which is what makes a subscription price computable before you have a subscriber. That claim from your cost model survives; it just sits on a higher fixed floor than "weather is free" implied.

* * *

## 12\. What will actually bite you

**Judge quality is the product and cannot be validated without real trips.** Everything else here is ordinary engineering. The eval harness and the week\-5 synthetic\-trip count are the only instruments you have before week 12.

**Detector 4 will produce a confident, wrong, alarming interrupt** if you let it route to interrupt before it has earned it. LLM extraction over news is the highest\-variance signal in the registry and protests are the highest\-stakes topic. The briefing\-only gate is not bureaucracy.

**The 600 hand\-verified places will take longer than you think.** It always does, it is not compressible by writing code, and weeks 3 onward depend on it. If it slips, cut coverage regions rather than lowering the verification bar — a curated tier you stopped actually curating is worse than not having the tier.

**Connection exhaustion.** Serverless plus Postgres. Pooled connection string, Neon's HTTP driver for short queries in route handlers.

**Radius tuning is cost control and quality control at once.** Too wide, you pay for junk pairs and the model gets chatty; too tight, you miss the front two valleys over. Instrument from day one of the matcher.

**Push credentials have lead time.** APNs, FCM, TestFlight. Day one.

**Twelve weeks is a long time to build before a stranger sees it.** The mitigation is not to shorten the plan; it is the week\-5 synthetic count and getting the briefing in front of three real travellers in week 6, well before the cohort. Find volunteers among people you know who are travelling in Georgia in October.

* * *

## 13\. Still open

1. **Domain.** Deliberately parked. `trip.io`, `tripio.ai`, `tripio.io` all registered; `roamline.io` is your researched best free option and `wandr.ai` is brokered with a price. Confirm at a registrar and run EUIPO / USPTO / Sakpatenti checks before any design spend. Positioning line already exists and is good: *"It notices before you do."*
2. **Road automation.** Decided in week 10, on evidence from real manual events.
3. **Who may submit road reports** — you alone, trusted locals, or any user. Changes the trust model on `world_event.confidence` and whether reports need moderation before they can trigger an interrupt. Needed by week 7.
4. ~~**Subscription mechanics**~~ — **decided 2026-09-26.** Watching is paid per trip rather than by subscription: $5 at an early-adopter price against a $50 list price, through Flitt. A traveller's first watched trip is free, and there is no separate trial.
