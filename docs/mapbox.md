# Mapbox: the map and the road

The map is Mapbox GL JS; the road between a trip's stops is the Mapbox Directions API, called from
our server. This page is the setup, the limits, the billing shape and the way back. What replaced
what:

| Was | Is |
|---|---|
| Google Maps JavaScript API, cloud-styled by a Map ID | Mapbox GL JS, `light-v11` / `dark-v11` (or a Studio style of our own) |
| Google Routes API `computeRoutes`, encoded polylines | Directions API `mapbox/driving-traffic` and `mapbox/walking`, GeoJSON geometry |
| Google's traffic layer | Mapbox's traffic tileset (`mapbox.mapbox-traffic-v1`), off by default |
| `@googlemaps/js-api-loader`, `@googlemaps/markerclusterer`, `@types/google.maps` | `mapbox-gl`, `supercluster` |

Renderer and routing stay one decision: Directions routes are drawn only on the Mapbox map.

## What was wrong, and what was checked

Read from the code, and from the history of the stacks it replaced. **None of it was reproduced
against a live service**: no Mapbox token was available while this was written (see "Verification").

* **Fixed earlier, on the Google branch, and kept fixed.** A straight line drawn between stops when
  the router failed or was pending; leg boundaries estimated by cutting one overview line at
  proportional distances; a stale route passing for current because only its leg count was compared;
  no traffic and no times; a public demo router in production.
* **Found in the Google version and fixed here.**
  * A request could carry 27 stops. Mapbox's limit is 25 coordinates, so a full-size request would
    have been refused. The limit is now `MAX_STOPS = 25` in the contract, checked before anything is
    sent, and a longer trip is split with the boundary stop shared.
  * A stop could be silently moved to any road, however far. Left at its default, Mapbox's snapping
    radius is unlimited, so a mountain viewpoint would become a road in the next valley and the
    route would look right. Every stop now has a 3 km radius. A stop with no road inside it is a
    failure (`unroutable-stop`). Mapbox's reply does not say which stop, so the panel says "a stop has no
    road near enough" unless a reply ever carries an index; a stop moved more than 500 m says so, with the
    distance.
  * Google's place id stood in for "where a car can actually go". The contract now separates the two:
    a stop's `lonLat` is where the place is, and an optional `access` point is where a vehicle can
    reach it. The route runs to `access` when there is one. Nothing stores an access point yet, so
    today every stop is snapped from its own coordinate (see "Limitations").
* **Checked and not found.** Latitude/longitude reversal: coordinates are `[lon, lat]` from the
  database to the request URL (Mapbox is longitude first) and back in GeoJSON, with no swap
  anywhere; the adapter also refuses an answer whose road does not begin and end at the stops it
  snapped, which is what swapped axes would look like. Reordered waypoints: Directions never
  reorders, and the URL is assembled from the stops in the order given, in one place. Wrong travel
  mode: the mode picks the profile; there is no fallback from one to another. Stale responses: the
  hook drops an answer whose key no longer matches (`src/ui/map/use-trip-route.ts`).

## Architecture

```
browser  useTripRoute (src/ui/map/use-trip-route.ts)
   │      one request per change of stops; joins repeats; drops stale answers
   ▼
POST /api/route   src/server/routes/route.ts   session, 16 KB body cap, Zod validation, status codes
   ▼
computeRoute      src/bll/route.ts             departure check → per-user limits → in-flight join → global limits
   ▼
mapboxDirections  src/infra/mapbox-directions.ts  builds Mapbox's URL; validates and normalises the answer
```

The request the browser sends is the app's own shape (`src/domain/route/contract.ts`): a mode, the
stops in visiting order, a departure, an alternatives flag. Nothing of Mapbox's is forwarded; the
server builds the Directions URL from those validated fields, with the server token. Trip ids are
not accepted, so there is no trip to check ownership of; the route is a function of the coordinates
alone, and any session (anonymous included) may ask, within its limits and inside the region trips
are planned in.

The Directions request:

* Profile `mapbox/driving-traffic` for driving, `mapbox/walking` for walking.
* `geometries=geojson`, `overview=full`: the road as `[lon, lat]` at full detail. Nothing is
  decoded, simplified or redrawn.
* `steps=true`, because Mapbox returns no per-leg geometry without it. A multi-stop route's legs are
  the concatenation of each leg's own step geometry, and the adapter checks that each leg starts and
  ends at its stops. (The steps' instructions are read by nothing.)
* `radiuses` of 3,000 m for every stop (above).
* `continue_straight=false` for driving: a stop is somewhere you park, so a U-turn there is allowed.
  The default would send the route on to the next junction and back. This is a choice, not a
  default; revisit it if drive times look long around stops.
* "Leave now" sends no `depart_at`, which Mapbox reads as live traffic. A scheduled departure is
  sent as UTC and is labelled a prediction. Walking sends no departure.
* `alternatives=true` only between exactly two stops. Stop order is never changed.

Not used, deliberately: the Navigation SDK, the Optimization and Matrix APIs, Search/Geocoding,
`waypoint_targets`, `exclude`, annotations.

Answers are refused (reported as `malformed`, never drawn) when the leg or waypoint count is wrong,
the road does not begin and end where its stops were snapped, consecutive legs do not meet, a leg is
shorter than the straight line across it, or a stop moved beyond its radius.

## Setup

1. **Two tokens, two jobs.** In Mapbox → Access tokens:
   * **Browser token** (`NEXT_PUBLIC_MAPBOX_TOKEN`): a *public* token (`pk.`), with **URL
     restrictions** set to the production domain, the preview domains you actually use, and
     `http://localhost:3000`. Keep only the default public scopes. It is in the client bundle by
     design; the URL restriction is its protection. The environment schema rejects anything that
     does not start with `pk.`, so a secret token cannot be shipped by mistake.
   * **Server token** (`MAPBOX_DIRECTIONS_TOKEN`): an ordinary second token (Mapbox has no
     Directions-specific token type; `pk.` or `sk.` both work, and Directions needs only public
     scopes), with no URL restriction, used only by `src/infra/mapbox-directions.ts` and set as a
     server-only variable in Vercel. It must not be the same token as the browser's: that one is in
     the client bundle, so anyone could call Directions with it directly and skip our auth and
     limits. Serverless has no fixed outbound address, so a URL or IP restriction is not available
     for it: the app's own limits below and Mapbox's usage alerts are the controls.
     It must never carry a `NEXT_PUBLIC_` name (`src/mapbox-keys.test.ts` fails if it does, or if a
     file outside the server layers names it).
2. **Usage alerts.** Mapbox → Statistics / billing: set alerts. **An alert only sends an email**; it
   does not stop a request. The application-level limits below do.
3. **Style (optional).** To carry the Mist palette over, build a style in Mapbox Studio (light and
   dark) and set `NEXT_PUBLIC_MAPBOX_STYLE_LIGHT` / `_DARK` to their `mapbox://styles/...` URLs.
   The traveller can also choose **Satellite** (`satellite-streets-v12`: imagery with the street names
   on it) or **Terrain** (`outdoors-v12`: hillshade, contours, trails); those two look the same in
   both themes. `NEXT_PUBLIC_MAPBOX_STYLE_TERRAIN` swaps in a Studio style for Terrain; Satellite has no
   custom variant. The choice is kept in the browser (`src/ui/map/map-style.ts`).
   Unset, Mapbox's `light-v11` and `dark-v11` are used.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | browser, inlined at build | Public token (`pk.`), URL-restricted. Required on Vercel |
| `NEXT_PUBLIC_MAPBOX_STYLE_LIGHT` / `_DARK` / `_TERRAIN` | browser, inlined at build | Optional Studio styles |
| `MAPBOX_DIRECTIONS_TOKEN` | server only | Directions token. Unset → routes answer "not configured" |
| `ROUTES_USER_PER_MINUTE` / `ROUTES_USER_PER_DAY` | server | Per-traveller limits (defaults 20 / 200) |
| `ROUTES_GLOBAL_PER_MINUTE` | server | Directions calls for everyone per minute (default 200; Mapbox's own ceiling is 300) |
| `ROUTES_GLOBAL_PER_DAY` | server | Directions calls for everyone per UTC day (default 1000) |

Obsolete and safe to delete from Vercel once the deploy is verified: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `GOOGLE_MAPS_ROUTES_API_KEY`. (`GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are Google sign-in and stay.) `OSRM_URL` is still read by
`pnpm catalogue:corridors`, and by nothing else. Do not revoke anything old before the new setup has
passed the checks below.

The spend limits live in Postgres (`usage_window`, migration `0014`, already applied by the Google
version), so they hold across serverless instances. They are application-level: a request over a
limit is refused before Mapbox is called.

## What costs money

Check the account's own rates and free tiers; none of this is in application logic, and none of it
was verified from Mapbox's pricing while this was written.

| Usage | Note |
|---|---|
| A map instantiated in the browser (a "map load") | Once per visit to a screen with a map, not per pan or zoom. The pool (`src/ui/map/pool.ts`) reuses one map across pages, and a theme or base-map change (Map, Satellite, Terrain) restyles it rather than building another, so switching costs no map load |
| A Directions request | One per change of a shown route's stops or mode (debounced 400 ms), or per press of *Refresh* / *Try again*. A trip of more than 25 stops asks once per 24 stretches |
| The traffic layer | Vector tile requests. The layer is hidden by default, and a hidden layer requests no tiles; it asks nothing of Directions |

What does not trigger a Directions request: pan, zoom, hover, a panel opening, the theme changing, a
parent re-rendering with the same stops. There is no GPS-driven or polling recalculation anywhere.
Identical requests in flight share one call. An answer is kept **in memory only** for ten minutes so
leaving a screen and coming back does not buy the same road again; it is never written to storage,
and a failure is never remembered.

## Search and place data

trip.io has no external search or geocoder: adding a stop and Explore search the app's own
catalogue in Postgres (`searchPlaces`, `src/dal/places.ts`), so there was nothing to migrate and
**Mapbox Search / Geocoding was not adopted**. That means the two things asked to be verified before
replacing search, Georgian-language coverage and permission to store results, do not arise: the app
stores none of Mapbox's search results, because it never asks for any. If a Mapbox geocoder is added
later, both must be checked first, because Mapbox distinguishes temporary from permanent geocoding.

Nothing from Mapbox is persisted: no route geometry, no duration, no snapped point. Only the app's
own coordinates and place ids are stored.

## Reading a route honestly

* The time is the drive: **visit durations are the itinerary's own and are never added to it**, and
  the panel says so.
* *Calculated N min ago with traffic data where Mapbox has it; not every road is observed.* A
  "leave now" answer uses live and historical traffic where Mapbox has data, and is an estimate of
  the road as it was when asked. *Usually N min* is Mapbox's `duration_typical`, shown only when it
  differs. A scheduled departure is *calculated for the departure time from usual traffic, not live
  conditions*. Walking has no traffic and no typical time.
* Per-stretch times are listed for a multi-stop trip. Later stretches of a long day are the road as
  it is now, not as it will be.
* No route, no road near a stop, a timeout, a credential fault, a rate limit, quota exhaustion and a
  malformed answer each have their own words (`src/features/route-model.ts`). None is ever replaced
  by a line between the stops. The map draws stops alone until a road is returned.
* A calculated route does not prove a mountain road is open or suitable for a vehicle. Weather and
  road advisories on the map come from trip.io's own detectors and are separate from Mapbox's
  routing: nothing implies a closure reported here is in Mapbox's road network.
* **The traffic layer** shows congestion where Mapbox has data, in neutral steps (darker and wider is
  slower); free-flowing roads are left as the basemap has them. Colour is not used, because periwinkle
  is the agent's route and coral a real disruption. It is a separate thing from the route's estimate.
  How complete it is in Georgia has not been checked.
* "Open in Google Maps" hands the stops to Google's site or app for turn-by-turn navigation, which
  trip.io does not build. It is a plain link and needs no Google key. It is offered for up to 11 stops
  and hidden beyond that, rather than opening a route with stops missing.

## Attribution

Mapbox's logo and attribution stay visible: desktop panels stop 30 px above the bottom of the map,
and on a phone the map ends where the itinerary sheet begins. Do not float anything over those
corners. Mapbox GL JS also sends its usual usage telemetry from the browser.

## Verification

**Unit tests (mocked; no network).** `pnpm test`: the adapter's URL, order, profile, snapping,
validation and error mapping (`src/infra/mapbox-directions.test.ts`), the use case's limits, the
client's deduplication and stale handling, the route panel's wording, and the token-separation
tests. The mocked replies have Mapbox's shape around real Georgian coordinates; they show the adapter
asks the right question and refuses an answer that does not fit. They do not show that Mapbox
answers well.

**Live (needs a token; not yet run).** `pnpm smoke:route` asks Mapbox for Tbilisi–Rustavi,
Tbilisi–Mtskheta by car and on foot, Tbilisi–Gudauri–Stepantsminda, alternatives, a stop with no road
near it (Kazbek's summit) and a bad token, and checks that each road is no shorter than the straight
line, not an absurd detour, longitude-first, ends at its stops, and that legs meet. It spends about
ten requests.

**In the browser (needs the browser token; not yet run).** Open a trip and check: the map loads with
one `mapbox-gl` map (no second one on navigating between trips); the route follows roads and its
legs match the stops; pan, zoom and hover make no request to `/api/route`; *Traffic* toggles without
one; toggling the theme keeps the route and stops; the Mapbox logo and attribution are visible at
desktop and phone widths; with the server token unset the trip says routes aren't set up and draws no
line; with the browser token unset it shows the ground colour and the itinerary.

## Deployment checks

1. Both tokens set in Vercel (Production and Preview); the browser token URL-restricted to the
   domains in use.
2. `pnpm smoke:route` passes against the real token.
3. After building, confirm the server token is not in the client output:
   `grep -r "$MAPBOX_DIRECTIONS_TOKEN" .next/static` finds nothing.
4. The browser checks above.

## Limitations

* **Stops are catalogue points.** A landmark's point may not be where a car can stop. Mapbox snaps
  it to the nearest road within 3 km and says how far it moved; it does not pick an entrance. The
  contract's `access` field exists for a real vehicle access point, but nothing stores one, so no
  stop has one yet.
* **No route caching beyond memory**, and no check yet of what Mapbox's terms allow for caching
  Directions results. The in-memory ten-minute window is the only reuse; confirm it against the
  current terms before lengthening it or storing anything.
* **Georgian coverage is unmeasured.** The road network and traffic data for Georgia (rural and
  mountain roads especially) are Mapbox's, and only a live run shows how good they are. Places with
  no road (summits, trails) will fail or snap far; they are reported, not routed.
* **Markers are not numbered.** The pins carry a glyph or the place's logo, as they did before; the
  stop's number appears in the popover ("Stop 3 of 7") and the itinerary, not on the pin.
* **Departure times** are validated only as "not in the past"; Mapbox enforces its own limits and a
  refusal comes back as `invalid`.
* **The Mist palette** is Mapbox's stock style until a Studio style is set.

## Rollback

Renderer and routing revert together: revert the merge of this change. That restores the Google
Maps and Routes version (the branch `google-maps-routes`), which needs the three Google variables
above; keep them until the Mapbox setup has been verified in production. `usage_window` can stay;
nothing else reads it. Rolling back does not need a database change.
