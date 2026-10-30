# Trip feedback design — highlights, weather, the stop panel, and a planner you can talk to

Status: **proposed** (2026-10-30). Written against `new-trip-feedback` at `844d6f7`, from the owner's
feedback items 7–13 and the note before them on highlights and seasons. Items 14–16 (sections J–L)
were added the same day against `trip-feedback-fixes` at `853ae3e`. Nothing here is built. Update
this file when a decision changes.

## What the feedback says, and what the code says

Auditing before designing. Each complaint traced to the code that causes it.

| # | Complaint | Cause in the code |
|---|---|---|
| — | No list of the places people actually go; the planner sends travellers to random places | Retrieval is a per-area share by category (`loadCandidates`, `src/bll/trip-generation.ts`). Google's best-rated sights per destination are fetched (`src/bll/ratings.ts`) but only **annotate** catalogue places that happen to match; a top sight the catalogue lacks is dropped, and nothing tells the composer a sight is *the* sight of a town |
| — | Seasons, forecast and temperature are ignored | Generation never reads weather. The only season rule is `Destination.closed` months in `feasibility.ts`. The suggest engine already takes a `wet` hours set; generation has no equivalent |
| 7 | Weather and opening hours missing on almost every stop | **Weather:** the stop panel's "Weather here" row (`place-view.tsx`) reports *watch status* ("Nothing forecast", "Not watched"), never the weather; and `worthForecasting` stops at 7 days. **Hours:** most catalogue places come from Overture without hours, and Google Place Details is called with `id,rating,userRatingCount,googleMapsUri,reviews,photos` — no hours field, though the call is already in the tier that includes them |
| 8 | "Change this stop" needs better UI and a clear pitch | `StopSuggestions` is an eyebrow, a free-text box and a "Suggest" button, below the fold, with plain-text option cards and no photo, rating or before/after |
| 9 | Applying one swap shows "Applying…" on every option | `StopSuggestions` uses one `useTransition` (`applying`) for all cards |
| 10 | "Ask about it" does nothing | It is a link to `/trips/:id?ask=…`. `CommandBar` asks `initialQuestion` once, in a mount effect. From the stop popup (an intercepting route) the trip screen underneath is already mounted, so nothing remounts and nothing is asked. On a phone the bar may also be hidden (`offsetParent === null`). *Likely; confirm with next-dev-loop before fixing* |
| 11 | Directions leave for Google Maps | The button is `<a href="https://www.google.com/maps/dir/…">`. `POST /api/route` (Mapbox, `src/bll/route.ts`) and `MapRoute` already exist and are unused here |
| 12 | Every trip starts in Tbilisi | `DEFAULT_ENDPOINT = "tbilisi"` (`constraints.ts`), applied by `withDefaults` in `intake.ts` and by `request.ts`. Nothing reads where the traveller is |
| 13 | "Ask about your trip" can't change anything | By design today: `src/domain/trip/ask.ts` is one-shot and read-only ("an answer can suggest a change, never make one") |
| 14 | The day card shows one day; scrolling never reaches the next | `ItineraryPanel` (`(views)/desktop.tsx`) and the phone sheet (`mobile.tsx`) render only `view.day`, the day chosen in `?day=`. Choosing another day is `DayStrip` → `router.replace` → a full server render of the screen. The server builds the map stops (`mapStops(day)`) and the weather (one `forecastRibbon`) for that single day. There is no next-day affordance except the pill row, and on a long trip the pills scroll off sideways |
| 15 | Inputs, textareas and selects are all hand-made | No shadcn: no `components.json`, no Radix or Base UI. `src/ui` has its own `TextField`, `NumberField`, `Toggle` and `RadioRow`. Another ~25 raw `<input>`/`<textarea>`/`<select>` live in features and admin, each styled on its own (inventory in K) |
| 16 | The stop popup sometimes slides under the header, the backdrop stops working, and it can't be closed | Confirmed in code (see L). The dialog's `flex` class overrides the browser's `dialog:not([open]) { display: none }`. So a **closed** `<dialog>` that is still mounted is drawn in the page's normal flow, out of the top layer: below the z-30 header, with no `::backdrop`. Its close button then calls `close()` on a dialog that is already closed, which fires no `close` event, so `router.back()` never runs. `cacheComponents: true` is what leaves it mounted and closed: Activity hides and reveals routes instead of unmounting them, and `PlaceModal` neither closes on hide nor reopens reliably on reveal |

## Principles kept

- **Nothing is auto-applied.** The assistant gets far more power (13), but every change it makes is a
  patch the traveller applies with one tap and undoes with one tap, through `POST /trips/:id/patches`.
- **A model never writes ops.** It names options deterministic code built and validated, as
  `suggest.ts` and the judge's four-move vocabulary already do. That's what makes "all-powerful" safe.
- **Curation never blocks.** The highlights list (A) improves plans when it exists; a destination
  without one plans as it does today (see the `curation-optional` decision).
- **Layers.** New rules in `src/domain`, providers only in `src/infra`, SQL only in `src/dal`.

## A. Highlights: the places a destination is known for

**Domain** — `src/domain/catalogue/highlights.ts`. Per destination slug, an ordered list of signature
sights: `{ name, placeId?, months?, outdoor, why }`. Two sources, merged:

1. **Editorial:** a short hand-written list for the focus destinations (Tbilisi: Narikala, Old Town and
   the baths, Holy Trinity; Mtskheta: Jvari, Svetitskhoveli; Kazbegi: Gergeti Trinity, Dariali,
   Gveleti falls; Kutaisi: Gelati, Bagrati, Prometheus Cave, Martvili Canyon; Sighnaghi: the walls,
   Bodbe; Mestia/Ushguli; Vardzia; Uplistsikhe; Ananuri; …). About 60–80 entries in all. I draft it;
   the owner corrects it.
2. **Derived:** Google's `tourist_attraction` search per destination, which `ratings.ts` already makes
   and keeps for 60 days. It is ranked by popularity — `log(userRatingCount)` times a Bayesian-shrunk
   rating — because review count is the best available proxy for "most visited". The top N become
   highlights where no editorial list exists.

**Retrieval** — highlights are candidates *on top of* the per-area share, as must-sees already are,
carrying `highlight: rank`. **Change:** a top-ranked Google attraction the catalogue lacks is taken in
as a verified place through the same path a pinned sight uses (`sight-search.ts`, `sightCategory`'s
refusals included), so it can be planned. That extends the 2026-10-29 storage decision to sights
nobody pinned; see decision 1.

**Composition** — the composer's prompt says each destination's highlights are the default. It may
leave one out only for the season, the weather, the traveller's interests or pace, and must say which
in the day's note. The guard follows the interests send-back (`5a73c3c`): a plan whose full day in a
destination visits none of its top three highlights is sent back once with that as feedback. It is
never rejected outright.

**Seasonal highlights** — `months` hides Ushguli's high trails and the Abudelauri lakes outside June to
September, puts Gudauri's slopes in from December to April, and adds Rtveli to Kakheti in September and
October.

## B. Season, forecast and temperature in planning

**Domain** — `src/domain/trip/generate/outlook.ts`. A `DayOutlook` for each day and destination:
`{ source: "forecast" | "normal", tMinC, tMaxC, wetHours?, precipChance, snow }`, and pure rules over
it:

- Wet hours → outdoor stops in the dry part of the day, indoor ones in the wet part. This is the same
  `wet` set the suggest engine takes.
- `tMaxC ≥ 32` → no exposed outdoor stop between 12:00 and 16:00 (Tbilisi in July).
- Snow, or `tMaxC ≤ 2`, at altitude → no high pass and no long ridge walk. This sits beside
  `road-season.ts`.
- Each day carries one "What to expect" line ("Kazbegi, 4–12 °C, showers after 15:00"), shown on the
  day and given to the composer.

**Sources**

- **Forecast**, for days up to 16 out: Open-Meteo (`src/infra/open-meteo.ts`, already a port). It is
  read per destination, not per stop: one call per destination per generation.
- **Normals**, beyond 16 days: a static table of 64 destinations × 12 months (mean min/max, rainy
  days, snow days), built once by `scripts/climate-normals.ts` from ten years of `openMeteoArchive`
  and checked in as `src/domain/catalogue/climate.json`. It costs nothing at runtime, it is
  deterministic, and tests can use it. See decision 3.

**Afterwards** — when a trip comes within 16 days, the existing watch layer (weather detector →
judge → intervention) already proposes moves against the forecast. Nothing new is needed there.

## C. The stop panel: weather and hours that are always there (item 7)

**Weather** — replace the "Weather here" watch row with a weather block for the stop's own time and
place:

- Up to 16 days out: `stopForecast(lonLat, date)` → `stopWeather(hours, startsAt, durationMin)`, which
  both already exist. From day 8 it is labelled *outlook*. `worthForecasting` takes a horizon argument
  and stays at 7 for the day list.
- Beyond that: the climate normal from B, "Usually 18–27 °C in May, rain on 9 days".
- The watch's status becomes a small line under the block, not the block itself.
- The panel never says "unknown" about weather.

**Hours**

1. Add `regularOpeningHours,currentOpeningHours,utcOffsetMinutes` to the Place Details field mask
   (`google-places.ts:414`), and map them into the domain's `OpeningHours` in `toEnrichment`.
   Asking for `reviews` already puts that call in the Enterprise + Atmosphere tier, which should
   include the hours fields, so this should cost **nothing extra**. Confirm on the pricing page.
   `currentOpeningHours` catches holiday exceptions.
2. **Write the hours back** to `place.opening_hours`, with `hours_source` and `hours_checked_at`
   (migration), so the scheduler and validator plan by them and not only the panel. This is a further
   departure from Google's terms; see decision 1.
3. **Backfill:** a script calls Details once for every highlight, plus the curated and verified sights
   of the focus destinations, so plans have hours before anyone opens a panel. It is bounded by the
   existing daily ceilings.
4. **Fallback:** typical hours by category ("Churches are usually open 08:00–19:00; services on Sunday
   morning"), labelled *typical, not confirmed*. Travellers' hours reports (`hours-report.ts`) still
   override.

## D. "Change this stop" becomes "Swap this stop" (item 8)

This is a redesign inside the existing design system (`src/ui`, `src/features`; Concept A · Mist —
periwinkle for the agent). It has to work in light and dark. The engine (`suggest.ts`,
`bll/suggestions.ts`) stays as it is.

- **Position:** directly under the stop's header, not below the watch rows.
- **Pitch:** the headline is **"Not sure about this one? Swap it."** The subline is "Alternatives that
  still fit your day — checked against opening hours, drive times and daylight." That last part is the
  real selling point and is true by construction.
- **One-tap intents** in place of an empty text box: *Something indoors · Closer by · Less walking ·
  Later · Shorter · Surprise me*, then *Ask for something else…*, which opens the chat (G) focused on
  this stop.
- **Option cards** — a new shared `ProposalCard` in `src/features`, which G reuses. Each card shows:
  - a photo, the rating and the distance, for a swap;
  - a badge: *Swap*, *Time* or *Length*;
  - a before → after line ("14:00 Narikala → 14:00 Abanotubani baths");
  - the knock-on moves, in plain words;
  - one primary **Swap** button.

  `bll/suggestions.ts` joins `placeCards` and photos onto the swap options so the card can draw them.
- **After applying:** "Swapped. Undo", as today. Hovering or focusing a card on desktop previews it on
  the map (see `MapRoute.stale` and the highlight layer in H).

## E. One "Applying…" per card (item 9)

In `StopSuggestions`, replace the shared `applying` flag with `applyingId: string | null`. The card
being applied says "Applying…"; the others are disabled and keep their label. This is a standalone fix
commit and lands first. `ProposalCard` in D takes the pattern over.

## F. "Ask about it" opens a conversation where you are (item 10)

- **Fix the cause first**, whatever replaces the button. A question passed in the URL must be read
  with `useSearchParams` and acted on whenever it changes, not in a mount-once effect. The same mistake
  would break H's `?directions=`.
- **Then:** "Ask about it" opens the chat (G) as a panel *inside* the stop popup, scoped to this stop:
  `focus: { nodeId }`. It is pre-asked "Tell me about <name>", with chips: *Is it worth it? · What do
  people say? · Best time to go? · Swap it for something similar*. "What do people say?" summarises the
  Google and Tripadvisor reviews the panel has already loaded. "Swap it…" returns `ProposalCard`s.

## G. A trip assistant that can change the plan (item 13; F builds on it)

Today's `ask` answers once, from text, and changes nothing. It becomes a conversation that can do
anything the editor can, by proposing patches.

**Domain** — `src/domain/trip/assistant.ts`. Tool schemas, in Zod and converted to JSON Schema as the
composer's are, and the pure handlers behind them. Read tools:

| Tool | Returns |
|---|---|
| `find_places(query, near?, category?, indoor?)` | Places from the catalogue first, then Google (`sight-search.ts`) |
| `place_facts(placeId)` | Hours, rating, a summary of what reviewers say, typical length of a visit |
| `weather(date, destination)` | The `DayOutlook` from B |
| `stop_options(nodeId, wish)` | The suggest engine's validated options, as today |

Propose tools: `propose_swap(nodeId, placeId)`, `propose_add(date, placeId, after?)`,
`propose_remove(nodeId)`, `propose_move(nodeId, date?, time?)`, `propose_length(nodeId, min)`,
`replan_day(date, wishes)` (the generation pipeline run for one day), and `propose_trip_change`
(destinations, dates, pace, must-sees, through the intake's `applyEdit`, then regeneration).

Each propose tool **builds the ops in code**. It then applies them to a copy of the document, retimes,
and runs `validateProposal`. It returns either a proposal `{ id, title, ops, changes, moves }` or the
errors. On errors the model may try something else, as generation retries. The model cites proposal
ids and never ops.

**BLL** — `src/bll/assistant.ts`. The loop: at most 6 tool rounds per message, the existing
per-traveller rate limit, the conversation loaded and saved, and the answer returned as text plus
proposals. The model is told it has changed nothing until the traveller applies something, and the
reply schema keeps it from claiming otherwise.

**Infra** — `src/infra/openai-assistant.ts`. Responses API function calling on the current model, with
`store: false` kept, so the history is resent each turn. Long threads are capped at the last N turns
plus a summary.

**DAL** — `trip_conversation` and `trip_message` (`role`, `text`, `proposals jsonb`,
`applied_patch_id`), so a thread survives a reload and reaches the Expo app. The migration is its own
commit. See decision 2.

**Server** — `POST /api/trips/:id/chat { conversationId?, message, focus? }` and
`GET /api/trips/:id/chat/:conversationId`. Version 1 does not stream; it shows tool progress as states
("Checking opening hours…"). Streaming over Hono SSE comes later; check `hc` and Expo first.

**UI** — `src/features/trip-chat.tsx` replaces `CommandBar`'s single exchange: a right-hand drawer over
the map on desktop, and a full-height sheet on a phone. It keeps the same bar as the entry point.
Proposals render as `ProposalCard`s. Applying one sends its ops with `parentId = head`. The others
then go stale and say so, as the swap panel's "applied" state already does, and asking again rebuilds
them against the new head.

## H. Directions on the trip's own map (item 11)

- "Directions" routes **from** the traveller's live position, when the stop is today and permission is
  given, and otherwise from the stop before it in the day; **to** this stop. The route comes from
  `POST /api/route`, which is token-safe and rate-limited already. It drives by default and walks under
  about 1.5 km.
- `TripMap` gets a `focusRoute` prop: drawn above the trip route, thicker, in the agent colour with a
  casing. The trip route dims beneath it, the map fits to its bounds, and a small card gives
  "18 min · 12 km from Jvari" with a Drive/Walk toggle.
- Turn-by-turn stays Google's: **Start navigation** on that card is the secondary action, using
  `open-in-maps.ts`.
- **Live mode** (today only): `watchPosition` moves the position dot. The route is asked again only
  after drifting more than 150 m off it, at most once a minute, inside `computeRoute`'s limits.
- On a phone the popup covers the map, so "Directions" closes it and opens
  `/trips/:id?directions=<nodeId>`, read reactively (see F). On desktop the map beside the popup draws
  it in place.

## I. Start where the traveller is (item 12)

- **Domain:** `nearestDestination(lonLat)` → `{ slug, km } | null`. It returns null outside the region
  box `route/contract.ts` already declares. The start field gains a third provenance between *said*
  and *defaulted*: *inferred*. An inferred start is shown, can be corrected, and is never treated as
  something the traveller said.
- **Signals, in order:**
  1. Browser GPS, asked on /new by a "Use my location" chip and not by a cold prompt on load.
  2. A silent IP prior from the platform's geolocation headers (Vercel's `x-vercel-ip-latitude` and
     `x-vercel-ip-longitude`), read in the intake route handler.

  Coordinates are used only to choose a slug. They are rounded and never stored.
- **Inside Georgia:** "Starting from Kutaisi — where you are now. Change?" on the start card. The
  finish follows the start, as it already does.
- **Outside Georgia**, which is most travellers planning at home: where they are is not where the trip
  starts. The planner asks the one question that matters, "Flying into Tbilisi, Kutaisi or Batumi?",
  as one-tap suggestions through the intake's existing `suggestions`, instead of assuming Tbilisi.
  `DEFAULT_ENDPOINT` stays only as the last resort for a traveller who skips the question.

## J. The day card scrolls through the trip (item 14)

**Which card.** The owner wrote "on the right". The only card that pairs the day pills with one open
day is the map screen's itinerary panel, which floats on the **left** at `lg` (`ITINERARY_FRAME`), and
its phone twin, the sheet in `mobile.tsx`. The right column holds the watch cards. This section designs
for the itinerary panel; see decision 6.

**Behaviour**

- The panel lists **every day**, one section each: a sticky header (`Day 2 · Kazbegi`, the stamp, the
  `done/total` count), that day's weather ribbon, then its `CheckpointList`. Scrolling past the end of
  day 1 brings day 2 up under the pills.
- **Scroll-spy.** An `IntersectionObserver` on the section headers, rooted on the panel's scroll box,
  picks the active day: the last header above a line about a third of the way down the box. The
  active pill follows it, and `DayStrip` already scrolls the chosen pill into view.
- **Pills and arrows scroll; they don't navigate.** A pill, or a new `‹`/`›` pair at the ends of the
  strip, scrolls the box smoothly to that day's section. Each day ends with a `Next: Day 3 · Sighnaghi
  →` row that does the same. That gives the carousel the owner asked for without a second gesture to
  learn. The arrows are disabled at the first and last day. Arrow keys work on the tablist, following
  the ARIA tabs pattern.
- **The map follows the active day.** It fits that day's stops and draws that day's route. The
  "Whole trip" chip keeps today's `AllDays` summary and the whole-trip map.
- **The address follows too.** It updates with `window.history.replaceState(…, ?day=)`, not
  `router.replace`, so scrolling never re-renders the server page. Next keeps `useSearchParams` in sync
  with native history calls. A shared link or a refresh still opens on that day: the server scrolls the
  box to it on mount.

**Data.** The server stops building one day and builds all of them. `(views)/page.tsx` computes
`mapStops` and `withStopWeather` per day, and calls `forecastRibbon` per day where
`worthForecasting` allows, in parallel. `trip/page.tsx` already does exactly this for every row. The
`OverviewView` gains `days: DaySection[]` in place of the single `day` and `weather`.

**Code**

- `src/features/day-scroll-model.ts`, pure, with tests: which day is active given header offsets and
  the box's scroll position; previous and next; the section to land on for a `?day=`.
- `src/features/day-scroll.tsx`, a client component: the scroll box, the observer and the "Next" rows.
  It is shared by the desktop panel and the phone sheet.
- `DayStrip` gets a controlled mode, `onChoose` plus `active`, used in place of its `router.replace`
  when given. The plan page (`/trip`) keeps the routed mode. It also gets optional `‹ ›` arrows.
- **Map focus is client state.** `TripMapScreen` gets every day's stops, keyed by day, plus an
  `activeDay`. A small `TripFocus` context in `src/features` sits around the map and both panels in
  `(views)/page.tsx`. The map refits on change, using the existing `TripMapHandle`.
- `map-skeleton.tsx` keeps the same frames, so nothing jumps when the panel arrives.

**Phone.** The sheet scrolls the same sections when it is pulled up. At the peek height only the pill
row and the next stop show, as today, so scroll-spy does nothing until the sheet is open.

## K. shadcn for every form control (item 15)

**Setup.** `shadcn init` for Tailwind v4 and React 19, then:

- **Components** go in `src/ui/shadcn/` (alias `@/ui/shadcn`). `src/ui` already has its own `button`,
  `sheet` and `chip`, so the generated files can't share that directory. It is the same layer (`ui` →
  "app" in `layers.test.ts`), so no exception is needed.
- **`cn` is our `cx`.** `components.json` points `utils` at `@/ui/cx`, which also exports `cn`. The
  generated code then goes through the `extendTailwindMerge` that already knows `text-mini`,
  `rounded-control` and the rest. With stock `cn`, `text-mini` would be silently dropped next to a
  colour class.
- **Token bridge.** shadcn's variables are aliases of Mist tokens, declared once in `globals.css` and
  redefined under `[data-theme="dark"]`. That covers `--background`, `--foreground`, `--popover`,
  `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--primary`, `--destructive` and `--radius`.
  `--ring` and `--primary` map to periwinkle (the agent) and `--destructive` to coral, so colour keeps
  exactly its three jobs. No component carries a one-off colour. Spacing in the generated files is
  checked against Tailwind v4's scale: off-scale steps emit nothing.

**Mapping.** First the `src/ui` primitives are rebuilt on shadcn, keeping their props, so most call
sites don't change. Then the raw controls move, one feature per commit.

| Today | Becomes | Where |
|---|---|---|
| `TextField`, and raw text `<input>`s | `Input`, with `InputGroup` where there's an icon or button inside | `ui/field`, `command-bar`, `home-plan`, `explore-screen`, `stop-suggestions`, `survey-card`, `admin/login-form`, `admin/data-table` (search), `ops/audit-panel` |
| `<textarea>` | `Textarea` (keeps its auto-grow) | `trip-planner` |
| `<select>` | `Select` | `constraint-cards`, `curate/place-form` |
| `type="date"` | Date picker (`Popover` + `Calendar`) | `constraint-cards`, `trip-actions` (add a day), `admin/data-table` |
| `type="time"` | `Input type="time"`, as shadcn's own pattern does (it has no time picker) | `watch-settings-form`, `curate/hours-editor` |
| `NumberField` | Same component and draft logic (`number-draft.ts`), drawn with `Input` and `Button` | `ui/number-field`, and `admin/data-table`'s range filters |
| `type="checkbox"` | `Checkbox` | `day-editor`, `admin/data-table` |
| `RadioRow` | `RadioGroup` | `ui/control` |
| `Toggle` | `Switch` | `ui/control` |
| `place-search`'s hand-made listbox | Combobox (`Popover` + `Command`) | `place-search` |

**Left as they are, on purpose**

- The `<details>` accordions. They work without script, Activity preserves their state, and the day
  accordion's exclusive `name` is native.
- The two `<dialog>`s. They stay native and only take shadcn's dialog styling; see L and decision 7.
- Chips and buttons. They are already `src/ui` primitives, and the item names form controls.

**Guard.** A test beside `layers.test.ts` fails on any `<input`, `<textarea` or `<select` outside
`src/ui/shadcn/`. The only exception is `type="hidden"`. It lands last, once nothing trips it.
`/design` shows every new control in both themes. The Expo app is untouched.

## L. The stop popup that sticks (item 16)

**What happens.** Next 16 with `cacheComponents: true` hides a route you leave inside React
`<Activity>` (`display: none`, effects cleaned up) and reveals it when you come back. It does not
unmount it (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`). `PlaceModal`
(`src/features/place-modal.tsx`) was written for mount and unmount:

1. **A closed dialog stays visible.** `className="… flex …"` beats the browser's
   `dialog:not([open]) { display: none }`. A mounted but closed dialog is therefore drawn in flow:
   under the header, with no backdrop and no inertness. This one line turns every case below into the
   symptom.
2. **Closing before the navigation.** Escape, the backdrop or ✕ closes the dialog at once. Then
   `router.back()` runs, asynchronously. Until it commits, the closed dialog sits under the header,
   which is long on a slow `back` such as a dev compile or a screen that suspends again. If the back
   never removes the popup route, it stays there for good. That happens when the entry before is not
   the screen underneath, for example after `CommandBar`'s `router.replace` that clears `?ask=`. ✕
   then does nothing, because closing a closed dialog fires no `close`.
3. **Leaving the popup through a link** ("Open this day", the alert, "Ask about it", all made to work
   in `91e6e23`) hides the popup route while the dialog is still **open as a modal** in the top layer.
   The cleanup restores page scroll but never closes it. The invisible modal still owns Escape, and on
   Android the back gesture. Escape on the trip screen closes the hidden dialog, which fires
   `router.back()`, which reopens the stop. *To confirm in Chrome:* whether a `display: none` modal
   also leaves the page beneath inert.
4. **Revealing.** `showModal()` runs in a passive `useEffect` with no dependencies. On reveal there is
   a frame where the dialog is visible and closed, before the effect reopens it.

`PhotoViewer` gets this right: there is no display class on the `<dialog>` itself, and it closes in
its cleanup. `PlaceModal` should match it.

**Fix**, in one commit with its reasoning in the comment:

- Draw only when open: `hidden open:flex` in place of `flex`.
- Call `showModal()` in a `useLayoutEffect`, and in its cleanup call `close()` **silently**. The docs
  advise a layout effect, so the cleanup runs before the hide is painted. "Silently" means a ref marks
  the close as the component's own, so `onClose` does not navigate. Strict mode's double effect run
  goes through the same guard.
- Make `onClose` the only path to `router.back()`, and only for a close the traveller made.
- Use the address as the truth, as the docs advise for dialogs. If `usePathname()` no longer ends in
  `/place/:id` while the layout is visible, the dialog closes silently. A popup can't outlive its
  route.

**Verify** with next-dev-loop at desktop and phone widths, each run checked for no closed-but-visible
dialog and no console errors. The runs: open a stop then Escape; the backdrop; ✕; open stop A, close
it, open stop B; "Open this day" then Escape on the plan; "Ask about it" then browser back; back and
forward across a stop; an Android-style back gesture, via `history.back()` while it's open.

## Order of work

Every item is in scope. The order is by what each one unblocks, not by importance.

**Items 14–16**, which are independent of A–I:

1. **L**: the popup fix. It is a live bug in one file.
2. **K's foundation**: `init`, the token bridge, `cn`, and the `src/ui` primitives rebuilt on shadcn.
   J's arrows and controls are built on it.
3. **J**, in this order: the model and its tests; `DayStrip`'s controlled mode; the server building
   every day; `day-scroll.tsx` with `TripFocus`; then the phone sheet.
4. **K's call sites**, one feature per commit, then the guard test.

**Items 7–13** and the highlights and seasons note:

1. **E** (one "Applying…" per card) and **F's cause** (the URL question read reactively). These are
   small fixes and land first.
2. **C** (hours in the Details call and written back; a weather block in the panel). This needs
   decision 1.
3. **B** (the normals table, the outlook, and the planning rules). C's "beyond 16 days" uses B's
   normals table.
4. **A** (highlights and their send-back). It uses B's `months` and season rules.
5. **I** (start from location).
6. **H** (directions on the map, with the `focusRoute` layer). D's map preview uses it.
7. **D** (Swap this stop, and `ProposalCard`).
8. **G**, then **F's panel** (the assistant, and the stop-scoped chat that runs on it). G is the
   largest piece. It reuses `ProposalCard` from D and the outlook and place facts from B and C.

Each step is several atomic commits: the migration alone, then the domain module with its tests, then
the adapter, then the use case, then the route, then the UI. Docs go in their own commit.

## Decisions for the owner

1. **Keeping Google's hours, and taking in unpinned top sights, in Postgres.** Planning by hours needs
   them in `place`. The terms allow only the id to be kept. This goes past the 2026-10-29 decision,
   which covered pinned sights. The alternative is to keep them in Redis for 60 days and read them at
   generation, which costs a lookup per candidate and leaves cold places unplanned by hours.
2. **Storing assistant conversations.** The recommendation is Postgres, so threads survive a reload and
   reach mobile. The alternative is client-only for v1, with no migration but threads lost on reload.
3. **Climate normals:** a precomputed checked-in table (recommended) or a live climate API call per
   generation.
4. **Who owns the editorial highlights list.** I draft it; you correct it. Until a destination has
   one, it uses the derived Google ranking.
5. **Assistant cost.** Up to 6 tool rounds a message on `gpt-5.4-mini`. Set a per-trip daily message
   cap: 50 is proposed.
6. **Which card item 14 means.** J assumes the map screen's itinerary panel, which is on the left at
   desktop width. If it's the plan page (`/trip`, whose day accordion already lists every day), the
   same scroll-spy pills could drive the accordion instead. Say which.
7. **The stop popup on shadcn `Dialog`?** The recommendation is no. shadcn's dialog portals to `body`
   with `z-50` and its own scroll lock and focus trap. Under Activity that puts the popup back in a
   z-index contest with the z-30 header and the z-20 map panels, beside effects that hide and reveal.
   The native top layer can't lose that contest. The popup keeps `<dialog>` and borrows shadcn's
   classes, so it looks like the rest.
8. **Radix or Base UI under shadcn.** shadcn offers both. The recommendation is Radix, the more
   mature and the one most shadcn blocks are written against.
9. **Date picker everywhere, or only for travellers?** K uses `Calendar` for the admin filters as well
   ("all", as asked). Native `type="date"` is the cheaper choice for admin, if you prefer it there.
