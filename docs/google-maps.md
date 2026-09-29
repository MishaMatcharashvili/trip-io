# Google Maps and Routes

The map is the Google Maps JavaScript API; the road between a trip's stops is the Google Routes API.
This page is the setup, the limits, the billing shape and the way back. What replaced what:

| Was | Is |
|---|---|
| MapLibre GL over a self-hosted Protomaps/PMTiles basemap on Vercel Blob | Google Maps JavaScript API, cloud-styled by a Map ID |
| OSRM car profile (FOSSGIS public instance), straight lines where it failed | Routes API `computeRoutes`, no fallback line |
| Routing on the server page, cached a day in Next's data cache | `POST /api/route` from the browser hook, nothing persisted |

Renderer and routing move together. Google routes are drawn only on the Google map, and the old
basemap is gone, so there is no configuration in which one is drawn over the other.

## What was wrong before

Read from the code that was removed (commit history, before "Remove the OSRM router"):

* **A fabricated route.** `src/bll/route-legs.ts` fell back to `straightLegs` for any chunk the
  router failed on, and `src/ui/map/trip-map.tsx` drew `straight(stops)` while a route was pending
  or when its leg count did not match. A straight line between stops looks like a route and is not one.
* **Approximate leg boundaries.** `src/domain/trip/legs.ts` `splitLine` cut one overview line into
  legs at proportional distances, so a leg's boundary was an estimate, not the router's own geometry.
* **A stale route could pass for current.** The only check that a route still belonged to the stops
  was its leg count (`given.length === stops.length - 1`), so moving a stop kept the old road.
* **No traffic and no times.** OSRM's car profile is not traffic-aware, and no duration ever
  reached the UI.
* **A public demo server in production.** `src/infra/osrm.ts` used the FOSSGIS instance, whose
  policy is for low volume; responses were cached for a day.
* **Checked and not found:** latitude/longitude reversal (GeoJSON in, GeoJSON out, consistently
  longitude first), waypoint reordering, and hidden highway avoidance. The previous stack was
  MapLibre + PMTiles + OSRM, not MapTiler.

## Architecture

```
browser  useTripRoute (src/ui/map/use-trip-route.ts)
   │      one request per change of stops; joins repeats; drops stale answers
   ▼
POST /api/route   src/server/routes/route.ts   session, 16 KB body cap, Zod validation, status codes
   ▼
computeRoute      src/bll/route.ts             departure check → per-user limits → in-flight join → daily total
   ▼
googleRoutes      src/infra/google-routes.ts   builds Google's request and field mask; normalises the answer
```

The request the browser sends is the app's own shape (`src/domain/route/contract.ts`): a mode, the
stops in visiting order, a departure, an alternatives flag. Nothing of Google's is forwarded; the
server builds the Google request from those validated fields. Trip ids are not accepted, so there is
no trip to check ownership of; the route is a function of the coordinates alone, and any session
(anonymous included) may ask, within its limits and inside the region trips are planned in.

What the Routes request is: `DRIVE`, `TRAFFIC_AWARE_OPTIMAL`, `HIGH_QUALITY` encoded polylines,
`METRIC`, `optimizeWaypointOrder: false`. "Leave now" sends no `departureTime`; a scheduled
departure is sent as the UTC instant of the offset-bearing time the client supplied. Walking sends
no routing preference. The field mask names only what the app reads; per-leg polylines are added
only when there is more than one leg. Stop order is never changed: the itinerary is the
traveller's. Up to 25 intermediates go in one request; a longer trip is split with the boundary
stop shared (`chunkStops`), and the legs are laid end to end. Alternatives are requested only
between two stops, because Google returns none past an intermediate waypoint.

## Google Cloud setup

1. **Project and billing.** One project, billing enabled.
2. **APIs.** Enable *Maps JavaScript API* and *Routes API*. Nothing else: no Places, no Directions
   (legacy), no Roads.
3. **Map ID.** Map Management → create a map ID, map type *JavaScript*, **vector**. Attach a map
   style with light *and* dark colour schemes if the design's Mist palette should carry over (the
   old style was drawn in code; a cloud style is configured in the console). Set it as
   `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Advanced Markers and the dark scheme both need a Map ID;
   `DEMO_MAP_ID` stands in for local development only.
4. **Browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`): *Websites* restriction, API restriction
   *Maps JavaScript API*. Referrers: the production domain, the controlled preview domains you
   actually use, and `http://localhost:3000/*`. Not `*.vercel.app`, which authorises every
   application hosted there. This key is public by design; the restrictions are its protection.
5. **Server key** (`GOOGLE_MAPS_ROUTES_API_KEY`): API restriction *Routes API* only. Serverless
   has no fixed outbound address, so an IP restriction is not available; the API restriction, the
   app's own limits and the quota below are the controls. Set it as a server-only variable in
   Vercel. It must never carry a `NEXT_PUBLIC_` name (`src/google-keys.test.ts` fails if it does,
   or if a file outside the server layers names it).
6. **Quota caps (the part that actually stops spend).** APIs & Services → Routes API → Quotas:
   set a per-day cap on *Compute Routes* requests, and a per-day cap on Maps JavaScript API map
   loads. **Budget alerts only send an email**; they do not stop a single request. A quota cap does.
7. **Budget alert** as well, at amounts you would want to hear about, for the email.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | browser, inlined at build | Maps JavaScript API key. Required on Vercel |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | browser, inlined at build | Cloud-styled map ID. Required on Vercel |
| `GOOGLE_MAPS_ROUTES_API_KEY` | server only | Routes API key. Unset → routes answer "not configured" |
| `ROUTES_USER_PER_MINUTE` / `ROUTES_USER_PER_DAY` | server | Per-traveller limits (defaults 20 / 200) |
| `ROUTES_GLOBAL_PER_DAY` | server | Provider calls for everyone per UTC day (default 1000) |

Obsolete and safe to delete from Vercel once the deploy is verified: `NEXT_PUBLIC_MAP_BASE_URL`,
`BLOB_READ_WRITE_TOKEN` (the basemap files under the Blob store's `map/` prefix can go too).
`OSRM_URL` is still read by `npm run catalogue:corridors`, and by nothing else. Do not revoke
anything old before the new setup has passed the checks below.

The spend limits live in Postgres (`usage_window`, migration `0014`), so they hold across serverless
instances. Run `pnpm db:migrate` before deploying. They are application-level: a request over the
limit is refused before Google is called.

## What costs money

Reference prices at the time of writing; **check the billing account's own rates**, none of this is
in application logic.

| Usage | Category | Note |
|---|---|---|
| A map instantiated in the browser | Dynamic Maps | Once per page view of a map, not per pan or zoom. The pool (`src/ui/map/pool.ts`) reuses one map across pages |
| A driving route (`TRAFFIC_AWARE_OPTIMAL`) | Compute Routes **Pro** | `TRAFFIC_AWARE` is the same tier; switching between them saves nothing |
| A walking route | Compute Routes Essentials | No routing preference is sent |
| The traffic layer | Part of the map | It asks nothing of the Routes API |

Global reference: about 10,000 Dynamic Maps loads and 5,000 Compute Routes Pro requests a month
before the first paid tier ($7 and $10 per 1,000).

Not used, deliberately: traffic on the polyline (`TRAFFIC_ON_POLYLINE`, a further tier), Route
Matrix, Route Optimization, Roads, the Navigation SDK, Places autocomplete. Search in trip.io is over
its own catalogue, so there was no geocoding or place search to migrate.

What triggers a Routes request: the stops or mode of a shown route changing (debounced 400 ms), or
the traveller pressing *Refresh* or *Try again*. What does not: pan, zoom, hover, a panel opening,
the theme changing, a parent re-rendering with the same stops. An answer is kept in memory for ten
minutes so leaving a screen and coming back does not buy the same road again; it is never written to
storage. A home page with several live trips asks once per trip; a trip of more than 27 stops asks
once per 26.

## Google's terms this design leans on

* **Attribution stays visible.** Google draws its logo and terms in the map's bottom corners. Desktop
  panels stop 30 px above the bottom of the map; on a phone the map ends where the itinerary sheet
  begins. Do not float anything over those corners.
* **No stored route content.** Route geometry, durations and place content are never persisted. Only
  a Google place id could be stored (there is no column for one yet); the app's own place ids
  remain the primary keys.
* **Google routes on Google's map.** Do not draw Routes API polylines over another basemap.

## Reading a route honestly

* *Estimate with current traffic* is a "leave now" answer, with its age. *Predicted for the departure
  time* is a scheduled departure and is never called live traffic. Later stops in a long day are
  estimates of the road as it is now; visit time is the app's own and is not part of the drive.
* A provider fallback (`fallbackInfo`) is shown as a caution on the route.
* No route, a timeout, a credential fault, quota exhaustion and a malformed answer each have their
  own words (`src/features/route-model.ts`). None is ever replaced by a line between the stops.
* A calculated route does not prove a mountain road is open or suitable for a given vehicle. Weather
  and road advisories on the map come from trip.io's own detectors and are separate from Google's
  routing: nothing implies a closure reported here is in Google's road network.
* "Open in Google Maps" hands the stops to Google for navigation; there is no in-app turn-by-turn.
  It is offered for up to 11 stops (Google's link takes nine waypoints) and hidden beyond that,
  rather than opening a route with stops missing.

## Deployment checks

1. `pnpm db:migrate` (creates `usage_window`).
2. Both keys and the Map ID set in Vercel for Production and for Preview.
3. Referrer list contains the production domain and each preview domain you use.
4. Quota caps set on Routes API and Maps JavaScript API.
5. After building, confirm the server key is not in the client output:
   `grep -r "$GOOGLE_MAPS_ROUTES_API_KEY" .next/static` finds nothing.
6. Open a trip: the map loads, the route follows roads, *Traffic* toggles without a request to
   `/api/route`, the Google logo is visible at desktop and phone widths.
7. Try a route with the server key unset: the trip screen says routes aren't set up and draws no
   line.

## Limitations

* **Stops are catalogue points.** A landmark's point may not be where a car can stop; Google snaps
  it to the nearest road, not to a separate vehicle entrance. A Google place id per stop
  (`googlePlaceId` on a route stop) would let Google choose the access point; nothing stores one yet.
* **The dark scheme is a new map.** A map's colour scheme can only be set when it is created, so a
  theme change hands the map back and builds another (one extra map load).
* **The Mist palette lives in the console now.** The old style was code; the cloud style has to be
  configured by hand.
* **Departure times** are validated only as "not in the past"; Google's own upper limit is enforced
  by Google and comes back as `invalid`.
* **Search** was not migrated because the app has no geocoder to replace.

## Rollback

Renderer and routing revert together: revert the merge of this change. That restores MapLibre, the
PMTiles basemap reader and the OSRM router as one unit; it needs `NEXT_PUBLIC_MAP_BASE_URL` and the
basemap files in the Blob store, so keep them until the Google setup has been verified in
production. `usage_window` can stay; nothing else reads it.
