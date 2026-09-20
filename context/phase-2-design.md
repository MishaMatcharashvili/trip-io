# Phase 2 design — trip document and patch log

Status: design, not started. Written 2026-09-16 against the code on `design-system-screens`
(schema from migration `0001`, `src/core/catalogue/*`, fixtures in `src/data/trip.ts`). Checklist
items are in `context/build-plan.md`. This file covers how to build them. Update it when a decision
here changes.

## What Phase 2 has to leave behind

Phase 3 onward calls three functions and trusts them without checking again:

| Consumer | Needs |
|---|---|
| Judge (Phase 3) | `validateProposal(doc, ops, author)`: would these ops leave every touched day coherent? |
| Intervention UI (Phase 5) | `diffDays(before, after)`: the coherent-day diff, accepted or rejected as one unit |
| Web client (Phase 6) | `appendPatch`, `undo`, `restore`: the checkpoint/undo UI |

Everything else in this phase exists so those three functions can be trusted.

## Module layout

```
src/core/trip/
  document.ts     TripDoc + TripNode Zod schemas, rowsToDoc, docToRows, dayKey()
  patch.ts        op grammar (Zod), applyOps → { doc, inverse, touched }, pure
  diff.ts         diffDocs / diffDays, used by restore and the intervention diff
  sun.ts          civil dawn/dusk for a date and point (NOAA algorithm, no dependency)
  travel.ts       TravelEstimator interface + haversine estimator
  validate.ts     validateDay, validateDoc, affectedDays, newViolations, validateProposal
  store.ts        DB: loadDoc, appendPatch (transaction), undo, restore, checkpoints
  generate/
    constraints.ts  Zod input + coarse cache key
    candidates.ts   curated-place retrieval SQL
    compose.ts      the one LLM call (injected, so tests use a fake)
    schedule.ts     plan → timed nodes, deterministic, pure
    fallback.ts     greedy template plan, no model
    cache.ts        plan_cache read/write
    pipeline.ts     orchestration + attempt log
src/db/tx.ts          WebSocket Pool client for transactions (see Database)
src/server/routes/trips.ts
```

Everything except `store.ts`, `candidates.ts`, `cache.ts` and `compose.ts` is pure and runs under
`node --test` without a database. That is on purpose: Neon isn't provisioned yet, and the validator
is test-first.

## 1. The document

### Shape: nodes keyed by id, not an array

```ts
type TripDoc = {
  trip: { title; startsAt; endsAt; party; pace; budget; prefs };
  nodes: Record<NodeId, TripNode>;   // order comes from startsAt, never from position
};

type TripNode = {
  kind: "visit" | "meal" | "transfer" | "stay";
  placeId: string | null;
  startsAt: string;        // ISO, UTC
  durationMin: number;
  indoor: boolean;
  lonLat: [number, number] | null;   // placeless nodes only; exactly one of placeId / lonLat
  meta: { title; note?; booked?; corridorSlug?; urban: boolean };
};
```

RFC 6902 paths into an array (`/nodes/3/startsAt`) break when anything is inserted before index 3.
Keying by id keeps a path valid for the life of the node. The judge's ops stay readable, undo stays
simple, and a stale proposal fails a `test` op instead of silently editing the wrong node.

`trip_node` rows are a **projection of head**, kept in sync by `appendPatch` in the same
transaction. The match query (Phase 3) joins against the rows. History lives in the patch log.

### Node kinds

- `visit`, `meal`: the itinerary. Their `geom` is the place's point.
- `transfer`: an explicit drive between bases, used when travel is over 30 min. It carries
  `meta.corridorSlug` when it runs along one of the 12 corridors, which the road detector (Phase 5)
  needs. Its `geom` is the destination. Short hops stay implicit as the gap between nodes.
- `stay`: check-in at the night's base, a short node like any other (it can overlap and needs
  travel to reach). The base at any moment is the latest stay that started at or before it, so a
  multi-night base is one node. The base anchors each day: the first node must be reachable from
  last night's stay, and the last node must be within an implicit leg of tonight's.

A day is the set of nodes whose `startsAt` falls on the same Asia/Tbilisi calendar date
(`dayKey()`, reusing `tbilisiTime` from `opening-hours.ts`).

## 2. Patches

### Op grammar (the path allowlist is itself a validator)

```
add | remove | replace   /nodes/{uuid}
replace                  /nodes/{uuid}/(startsAt|durationMin|placeId|indoor|kind|meta)
replace                  /trip/(title|startsAt|endsAt|party|pace|budget|prefs)
test                     any path above
```

Build a small applier (about 80 lines) in `patch.ts` rather than using `fast-json-patch`. The
grammar is the security boundary: an LLM or a client can't write `geom`, `tripId` or any path outside
this list. Zod parses the ops, and the same Zod schema becomes the JSON Schema the judge's structured
output uses in Phase 3.

**Geometry is never stored for a placed node.** A node has either a `placeId` or a `lonLat`, never
both (enforced by re-parsing every touched node after a patch). Placed nodes are located through the
catalogue at validation time, and `trip_node.geom` is written from `place.geom` by the store, so
swapping `placeId` needs no second op and the inverse stays exact. Only placeless nodes carry
`lonLat`, and system/intervention authors may create placeless nodes only as transfers.

`applyOps` returns `{ doc, inverse, touched }`. `inverse` is stored on the patch, so undo never has to
recompute it. `touched` is the set of node ids, which feeds `affectedDays`.

### The log

- Append-only. Undo **appends** the stored inverse as a new patch (`intent: "Undo: …"`). Restoring to
  patch N rebuilds the doc at N, diffs it against head and appends that diff as one patch. Nothing is
  ever deleted or rewritten.
- `seq` is a server-assigned counter per trip, starting at 1. The generated plan is always seq 1.
- **Checkpoint when `seq === 1 || seq % 20 === 0`.** Seq 1 is added to the plan's rule because the
  generated plan is by far the largest patch. Rebuilding the doc at N means taking the nearest
  checkpoint at or before N and replaying pure `applyOps` forward, with no validation, because every
  patch was validated when it was written.
- Optimistic concurrency. The client sends `parentId` (the head it saw). If it isn't head, the server
  returns 409 and the client refetches. Offline is cut, so no rebase.
- `trip_patch` holds **applied patches only**. A pending intervention's ops live in
  `event_match.verdict` until accepted. So `author = 'intervention'` always has an `accepted_by`,
  enforced by a CHECK constraint as well as in code.

## 3. The coherent-day validator (test-first)

```ts
type Violation = {
  rule: "overlap" | "travel" | "darkness" | "closed" | "tier" | "window" | "pace" | "hours-unknown";
  severity: "error" | "warning";
  nodeIds: string[];
  day: string;         // YYYY-MM-DD, Tbilisi
  message: string;     // shown in the diff and fed back to the model on retry
};

validateDay(doc, day, ctx): Violation[]
ctx = { places: Map<id, { tier, openingHours, lonLat }>, travel: TravelEstimator }
```

| Rule | Severity | Check |
|---|---|---|
| overlap | error | non-`stay` nodes sorted by start: each ends at or before the next one starts |
| travel | error | gap between consecutive nodes ≥ `travel.minutes(a, b)` + 10 min buffer. A `transfer` node counts as the travel. Checked from last night's stay in the morning and back to tonight's stay at the end |
| darkness | error | outdoor `visit` nodes, and `transfer` nodes that aren't urban, start after civil dawn and end before civil dusk (sun −6°) at the node's point |
| closed | error | `isOpenThroughout(hours, start, end)`, a new helper next to `isOpenAt` that checks the whole interval, not one instant |
| tier | error | per author: `system` → `curated`; `intervention` → `curated`/`verified`; `user` → any tier |
| window | error | node inside `trip.startsAt..endsAt` |
| pace | warning | visits + transfers over the pace budget (relaxed 4h, moderate 6h, packed 8h); meals and check-ins don't count |
| hours-unknown | warning | the place has no `opening_hours` (only non-curated places; curated places require hours) |

**Whole-day re-validation.** `affectedDays(before, after, touched)` returns every day a touched node
was on **or** is now on, and each of those days is validated in full. Moving the hike from Tuesday to
Wednesday re-checks both days, not just the node.

**Who is blocked by what.** A trip that already has violations must still accept fixes, so:

- `system` and `intervention` patches: `newViolations(before, after)` must contain no errors. The
  test is "introduces no new errors", not "the day has zero errors". If the user has already
  overbooked a day themselves, the judge can still propose a fix.
- `user` patches: only grammar and `tier` errors block. Coherence errors are applied and returned as
  warnings, because the traveller is in charge of their own day. (Confirmed 2026-09-18.)

`validateProposal(doc, ops, author, ctx)` = parse → apply → affected days → `newViolations` → tier.
Phase 3's judge validator calls exactly this.

`TravelEstimator` v1 is haversine × a detour factor (1.3 urban, 1.7 mountain) at a class speed (25 /
60 / 40 km/h). Checked against the Military Road: Tbilisi–Stepantsminda comes out near 3h, which
matches reality. v2, once there are about 100 curated places: precompute an OSRM `table` matrix
between curated places within 150 km into a `place_travel` table and use v1 as the fallback. The
interface stays the same, so the validator doesn't change.

## 4. Trip generation

```
constraints ─► cache? ──hit──────────────────────────────┐
     │          │miss                                   ▼
     │          ▼                                  schedule (real dates)
     └─► candidates (curated) ─► compose (LLM) ─► resolve refs ─► schedule ─► validate
                                     ▲                   │ invented ref / errors
                                     └── retry once ◄────┘ with rejection as feedback
                                                         │ still failing
                                                         ▼
                                                    fallback template ─► schedule ─► validate
                                                         │ still failing
                                                         ▼
                                                  422 insufficient_coverage (never render)
```

### The LLM chooses places; code assigns times

The model's output has **no clock times**:

```ts
{ days: [{ day: 1, stayRef: "p3" | null, theme: string,
           stops: [{ ref: "p17", slot: "morning"|"midday"|"afternoon"|"evening",
                     kind: "visit"|"meal", durationMin: number }] }] }
```

`schedule.ts` turns that into timed nodes. The day starts by pace (08:00 / 09:00 / 09:30), stops are
placed in slot order, a stop is pushed later within its slot until the place is open, a `transfer`
node is inserted when travel is over 30 min, and anything that can't be placed becomes a `Violation`.
Models are weak at time arithmetic and good at choosing and ordering places, so each side does the
part it's good at. The template fallback and cache hits reuse the same scheduler.

### Candidates

`candidates.ts`: `tier = 'curated'`, inside the chosen focus areas. Move `areaPredicate` out of
`curation.ts` into a shared module first. The query filters by category groups mapped from
interests, returns at most about 150 places, and carries each place's hours and point. Each candidate
gets a short ref (`p1…pN`) that maps to its UUID. That saves tokens, and it makes an invented place
obvious: a ref that isn't in the map.

The model input also includes, for each day: date, weekday, civil dawn and dusk, and each
candidate's hours for that weekday as text.

### Model call

- **Gemini 2.0 Flash** for now (decided 2026-09-18). Confirm the exact model id is still served
  before building, and keep the model id in one constant so switching later is a one-line change.
- Structured output via Gemini's response schema, generated from the same Zod schema. Gemini
  supports only part of JSON Schema, so keep the output schema flat: enums, arrays, objects, no
  unions or `$ref`. The schema guarantees the shape.
- Build `ref` as a **per-request enum** of the candidate refs. Invented ids should then be close to
  impossible at decoding time. Keep the server-side ref check anyway: cache hits and templates go
  through it too, and it is the invariant the plan names. If a 150-value enum is rejected, drop to a
  plain string and rely on the retry.
- `compose.ts` is the only file that knows the provider. The pipeline gets `compose` injected, so
  tests use a fake and a later provider switch doesn't touch the pipeline.
- Retry = the same conversation, appended: the model's plan + a user turn listing each rejected ref
  and each violation's `message`. One retry, then the fallback.
- New dependency: `@google/genai`. New env: `GEMINI_API_KEY`.

### Fallback template

It isn't hand-authored JSON, because curated-place UUIDs differ between databases. It is a
deterministic greedy plan over the same candidates. The day's area comes from the nearest stay. Slots
follow a fixed pattern by pace (morning heritage/nature → midday meal → afternoon culture/nature →
evening meal), and places are ranked by proximity and category match, then scheduled and validated.
When a stop fails, it is dropped and the next candidate is tried. A day that ends up empty means
there isn't enough curated coverage, and the request returns 422. It never returns a partial plan
presented as complete.

### Warm-start cache

- Key = sha256 of canonical JSON: `{ PROMPT_VERSION, areas↑, days, pace, interests↑, partyKind,
  mobility, month, budgetBand }`. Exact dates and budget are left out, so this is a coarse hash.
- Value = the model's **untimed** plan with refs resolved to place ids. A hit still goes through
  `schedule` against the real dates (weekday hours and dusk change with the date) and through
  `validate`. A hit that fails validation is treated as a miss and deleted.
- Only plans that validated on attempt 1 or 2 are written. Template plans are cheap and not cached.
  Entries expire after 30 days. Changing `PROMPT_VERSION` invalidates everything.

### Attempt log

Every generation writes a `trip_generation` row: source (`cache|model|retry|template|failed`), each
attempt's invented refs, violations, token usage and latency. The rejection-reason mix is a Phase 9
dashboard input, and this is the only place it gets recorded.

## 5. Database

### Migration 0002

```sql
trip_patch      + seq int not null                    unique (trip_id, seq)
                + inverse_ops jsonb not null
                + meta jsonb not null default '{}'    -- generation id, source, violations-as-warnings
                  client_seq → nullable               unique (trip_id, client_seq) where not null
                  applied_at → not null
                + CHECK (author <> 'intervention' OR accepted_by IS NOT NULL)
checkpoint_log  + unique (trip_id, patch_id)
plan_cache      key text pk, plan jsonb, prompt_version, created_at, expires_at, hits int
trip_generation id, trip_id null, cache_key, source, attempts jsonb, created_at
```

### Transactions need a second client

`drizzle-orm/neon-http` throws on `db.transaction()`. `appendPatch` has to lock the trip row, check
head, write the patch, sync the nodes and move head atomically. Add `src/db/tx.ts` using
`drizzle-orm/neon-serverless` with a `Pool` created per request and closed afterwards. Use it only for
writes that need a transaction. The Phase 3 job drain (`SKIP LOCKED`) needs the same client. Reads
stay on HTTP.

```
BEGIN
  SELECT head_patch_id FROM trip WHERE id = $1 FOR UPDATE
  head ≠ parentId → ROLLBACK, 409
  load nodes + referenced places → applyOps → validate (per author policy) → 422 on blocking errors
  INSERT trip_patch (seq = max+1, ops, inverse_ops, meta)
  upsert/delete trip_node for touched ids (geom from place)
  UPDATE trip SET head_patch_id
  checkpoint if seq = 1 or seq % 20 = 0
COMMIT
```

## 6. API

All routes live under `/api/trips` and require a session. An anonymous session works. The trip's
`user_id` must match the caller.

| Route | Does |
|---|---|
| `POST /trips/generate` | constraints → creates trip + seq-1 patch. Streams SSE step events (`candidates`, `composing`, `checking-hours`, `watch-setup`), which the `/new/building` screen already renders, then `{ tripId, source }` |
| `GET /trips/:id` | doc + head + current violations |
| `POST /trips/:id/patches` | `{ parentId, intent, ops, clientSeq }` → `{ head, warnings }` / 409 / 422 |
| `POST /trips/:id/validate` | dry run of the same → `{ violations, diff }`, used by the replan preview now and the Phase 5 diff later |
| `GET /trips/:id/patches` | history (intent, author, seq, applied_at) |
| `POST /trips/:id/undo` · `POST /trips/:id/restore` | append inverse / append restore diff |

Generation runs synchronously inside the request (`maxDuration` 300). Move it onto the job queue
once Phase 3 builds the queue, if cold starts or abandoned tabs become a problem.

**Anonymous → claimed.** Add Better Auth's anonymous `onLinkAccount` handler to reassign
`trip.user_id` from the anonymous user to the new one. Then remove `disableDeleteAnonymousUser` in
`src/lib/auth.ts`, as its comment already plans.

## 7. Tests (`node --test`, no DB)

- `patch.test.ts`: grammar rejects every non-allowlisted path and any `geom` write; for any valid ops,
  `apply(apply(doc, ops).inverse) == doc`; `test` op failure.
- `sun.test.ts`: dawn and dusk for Tbilisi and Stepantsminda on known dates, within ±2 min of NOAA.
- `opening-hours.test.ts`: add `isOpenThroughout` cases (interval spans a close, an overnight shift,
  out of season).
- `validate.test.ts`, **written first**. Fixtures come from the Kazbegi day in `src/data/trip.ts`.
  Moving the Gergeti hike to 11:30 collides with lunch, which pushes the drive past dusk. Assert the
  whole chain of violations, and that a cross-day move re-validates both days. Also: `newViolations`
  ignores errors that were already there, and the tier-per-author matrix.
- `schedule.test.ts`: slot ordering, pushing a stop until the place opens, transfer insertion,
  a stop that can't be placed becomes a violation.
- `pipeline.test.ts` with a fake composer: clean first attempt; invented ref → retry carries the
  rejection → success; two bad attempts → template; template with too little coverage → 422;
  a cache hit that fails validation for the new dates is treated as a miss.
- `constraints.test.ts`: the cache key ignores exact dates and budget and is sensitive to order-free
  sets.

## 8. Build order

1. Pure core: `document` → `patch` (+tests) → `sun`, `travel`, `isOpenThroughout` (+tests).
2. `validate.ts`, test-first. **The phase is judged on this step.**
3. `schedule.ts` + `fallback.ts` (pure, tested).
4. Migration 0002 + `src/db/tx.ts` + `store.ts` + trip routes + anonymous claim. *Needs Neon.*
5. `candidates` + `compose` + `cache` + `pipeline` + generate route. *Needs Neon, an API key and
   curated places.*
6. ~~Dev-only curated seed~~. Decided against (2026-09-18): end-to-end generation waits for real
   curated places. Until then the pipeline is covered by `pipeline.test.ts` with a fake composer.
7. Wire `/new` → `/new/building` → `/trips/[tripId]` to the API, replacing the `src/data/trip.ts`
   loader for the itinerary screens. Optional in this phase; the rest of the UI wiring is Phase 6.

Steps 1–3 unblock nothing external and can start now. Steps 4–5 wait on Neon (Phase 0 procurement).

## Built so far (2026-09-20)

Everything in this document is written, typechecked and linted; 143 tests pass; `next build`
succeeds. The database is live, migrations `0000`–`0002` are applied and the catalogue is loaded.

| Step | State |
|---|---|
| 1–3 pure core | Done and tested: document, patch + inverse, diff, sun, travel, day checker, plan schema, scheduler, fallback, constraints + cache key, pipeline |
| 4 database | Done and exercised against Neon: migration `0002_trip_patch_log`, `src/db/tx.ts`, `src/core/trip/store.ts`, `/api/trips`, the anonymous-to-account handover |
| 5 generation | Written: `candidates.ts`, `cache.ts` (round-tripped against the database), `compose.ts` (Gemini), `record.ts`, `POST /api/trips/generate`. The model call has never run: no `GEMINI_API_KEY`, and no curated places to compose from |

`npm run smoke:trip` runs create → first patch → user edit → stale write → undo → restore →
projection against the real database, and cleans up after itself.

Changes made while building:

- `POST /api/trips` creates an empty trip, so the patch path can be used without the model.
- Generation runs inline (`maxDuration = 300`) and returns JSON. Progress events for the
  `/new/building` screen can be added when that screen is wired in Phase 6.
- With no visitable candidates, generation fails before calling the model — the honest answer while
  the curated catalogue is empty.
- Restoring to a version identical to head returns `no-change` rather than a contrived failure.
- The area-matching SQL moved to `src/core/catalogue/area-query.ts`, shared with `/curate`.

Known gaps:

- Day 1 assumes the traveller is already at the first stop; arrival isn't modelled.
- The fallback can serve the same restaurant twice on one day when an area has few curated food
  places.
- The straight-line travel estimate is still v1; the OSRM matrix waits for curated places.

## Decisions (2026-09-18)

1. User patches that break coherence are applied with warnings; system and intervention patches may
   not introduce new errors.
2. Generation uses Gemini 2.0 Flash for now, behind `compose.ts`.
3. No dev curated seed. End-to-end generation waits for real curation.
