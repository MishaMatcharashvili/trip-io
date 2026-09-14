# Watch layer — technical spec

Companion to `claude/concept.md`. Last updated 2026-09-14.

## The inversion everything rests on

**Poll each source once per region per cycle. Never per trip.**

Naive: for each live trip, poll every source → O(trips × sources), dies at a few thousand trips,
most cost spent re-fetching the same Kazbegi forecast for eighty people.

Correct: sense per region → write world events → match events to trips with one spatiotemporal
query → O(sources × regions), essentially flat as trips grow.

## Pipeline

```
1 SENSE      per source, per region containing ≥1 live trip
2 NORMALIZE  everything collapses to one CAP-shaped world_event row
3 MATCH      PostGIS ST_DWithin × time-window overlap → candidate pairs
4 JUDGE      the only LLM call, runs only on matched pairs
5 BUDGET     per-trip ledger; above threshold → interrupt, below → tomorrow's briefing
6 ACT        propose a patch set, render a coherent-day diff, never auto-apply
```

Stage 2 is deliberately CAP-shaped (Common Alerting Protocol). That vocabulary is already the
standard for exactly this problem, and copying it means a real alert feed drops straight in later.

Stage 5 is the stage most teams never build. It is the product.

## Schema

```sql
world_event    id, source, kind, severity, confidence,
               geom geography, valid_from, valid_to,
               observed_at, dedupe_key, payload jsonb

trip_watch     trip_id, active_from, active_to,
               regions geography, channels[], quiet_hours

event_match    event_id, trip_id, node_id, matched_at,
               verdict jsonb, score, judged_at

intervention   id, trip_id, event_id, channel(push|briefing),
               sent_at, patch_id,
               outcome(accepted|dismissed|ignored|muted), outcome_at
```

Builds on the revision-1 core: `trip`, `trip_node`, `trip_patch`, `checkpoint_log`.

### `intervention.outcome` is the moat

A record of which world-changes actually caused a traveller to change plans — per region, per
season, per trip type. No planner that stops at the itinerary can ever build this table. It is what
makes the ranker better than a general model's guess, and it is the only defensibility claim in the
whole concept that survives scrutiny.

## The judge

```
input   event {kind, severity, window, geom, source, observed_at}
        node  {activity, place, starts_at, duration, indoor?}
        trip  {party, pace, budget_left, completed[], prefs}
        sent  {count_so_far, last_sent_at, cap}

output  {
          relevant:    boolean
          impact:      "blocks" | "degrades" | "improves" | "none"
          horizon_hrs: number
          one_line:    string        // what the traveller reads
          evidence:    string        // source + timestamp, always shown
          ops:         JsonPatch[]   // the coherent-day proposal
          confidence:  0..1
        }
```

Two guards:

- Every `place_id` in `ops` is validated against the curated catalogue before the proposal is shown.
  The model still cannot name a place it did not retrieve.
- `relevant: true` + `impact: "none"` is rejected by the validator. It is the shape the model
  produces when it wants to be helpful and has nothing to say.

## Interventions cascade

Moving the hike displaces the museum, which collides with lunch, which pushes the drive into the
dark. One intervention = one patch set with an intent string = one diff = accepted or rejected as a
unit. This is the second reason the patch log was worth over-engineering.

## Cost model

| Stage | Scales with | Control |
|---|---|---|
| Sense | regions × sources × cycles | weather is free; only poll regions with a live trip |
| Match | events × live trips | pure SQL + GiST index, effectively free |
| Judge | matched pairs | the only model cost; tighten the match radius to cut it |
| Briefing | active trips × days | one call per trip-day, few thousand tokens — bounded |
| Trip generation | trips created | warm-start cache keyed on coarse constraint hash |

**The trap:** judging every event against every trip. Match first, always. If the model sees more
than ~a dozen pairs per trip-day, the radius is too wide — not the prompt too long.

The briefing is the dominant recurring cost *and* the perfectly predictable one. That is what makes
a subscription price computable before there is a single subscriber.

## Detector registry (v1)

| Detector | Source | Cadence | Notes |
|---|---|---|---|
| weather-vs-activity | Open-Meteo (free, no key) | hourly | derive own thresholds — no official warning feed for Georgia |
| flight-status | flight API ~$5/mo | 15 min on flight days | highest stakes, cheapest integration |
| road-corridor | manual, Telegram bot form | on submit | matches against the 12-corridor table |

Deferred: rail, events/festivals, strikes & protests, opening-hours changes, safety advisories.
All real; all wait until the ranker is proven on three clean signals.

## Stack (carried from revision 1)

Next.js App Router + PWA · ElysiaJS on Bun (TypeBox schemas double as LLM tool schemas) ·
Eden Treaty · Postgres + PostGIS · MapLibre GL + PMTiles (self-hosted, offline-capable) ·
Overture Places → DuckDB → PostGIS · Postgres-backed job queue, no Redis.

## Offline

An alert that arrives where there is no signal was never delivered. On trip save, cache the trip
bbox as a PMTiles pack plus place cards into IndexedDB. Offline patches queue with a client seq and
rebase on reconnect — the patch log gives this for free.

## On MCP

Not for calling your own tools — inside your own process you want typed function calls, not a
protocol hop. The real use is the other direction: **publish the itinerary service as an MCP server**
so other assistants can create and modify trips in your system. A distribution channel worth building
the day the product is good, and worthless before.
