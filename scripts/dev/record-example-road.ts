// Records the example trip's road once, for the screens a signed-out visitor
// can open: the landing page's example card, and the example's Trip and Map
// screens. Run with `pnpm record:example-road` after changing `georgiaMapStops`;
// it rewrites src/data/georgia-road.json.
//
// The road comes from OpenStreetMap through OSRM's public demo server, not from
// Mapbox: OpenStreetMap's data may be kept (ODbL, attributed on the map), and a
// Directions answer is not kept beyond memory until Mapbox's terms say it may
// be (docs/mapbox.md). It spends one request and needs no credential.

import { writeFile } from "node:fs/promises";
import { georgiaMapStops } from "../../src/data/trip.ts";
import { haversineM, type LonLat, simplifyLine } from "../../src/domain/geo.ts";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const OUT = new URL("../../src/data/georgia-road.json", import.meta.url);

/** Under a pixel at the zoom a whole-trip map is drawn at. */
const TOLERANCE_M = 8;
/** About a metre: more digits are noise, and bytes in every page. */
const round = ([lon, lat]: LonLat): LonLat => [
  Math.round(lon * 1e5) / 1e5,
  Math.round(lat * 1e5) / 1e5,
];

type OsrmStep = { geometry: { coordinates: LonLat[] }; name: string };
type OsrmLeg = { distance: number; duration: number; steps: OsrmStep[] };
type OsrmReply = {
  code: string;
  routes: { legs: OsrmLeg[] }[];
  waypoints: { location: LonLat; distance: number; name: string }[];
};

const coords = georgiaMapStops.map((s) => s.lonLat.join(",")).join(";");
const res = await fetch(
  `${OSRM}/${coords}?overview=false&steps=true&geometries=geojson`,
  { headers: { "User-Agent": "trip.io example-road recorder" } },
);
const body = (await res.json()) as OsrmReply;
if (!res.ok || body.code !== "Ok") {
  console.error(`OSRM refused: ${res.status} ${body.code}`);
  process.exit(1);
}

const [route] = body.routes;
const legs = route.legs.map((leg) => {
  // A leg's road is its steps' lines end to end; each step starts where the
  // last one ended, so the shared point is dropped.
  const path = leg.steps.flatMap((step, i) =>
    i === 0 ? step.geometry.coordinates : step.geometry.coordinates.slice(1),
  );
  return {
    distanceM: Math.round(leg.distance),
    durationS: Math.round(leg.duration),
    path: simplifyLine(path, TOLERANCE_M).map(round),
  };
});

// The legs must meet: a gap would be drawn as a road that is not there.
for (let i = 1; i < legs.length; i++) {
  const gap = haversineM(legs[i - 1].path.at(-1) as LonLat, legs[i].path[0]);
  if (gap > 5) {
    console.error(`Legs ${i - 1} and ${i} are ${Math.round(gap)} m apart.`);
    process.exit(1);
  }
}

const recording = {
  source: "OpenStreetMap via OSRM",
  recordedAt: new Date().toISOString(),
  stops: georgiaMapStops.map((s) => s.lonLat),
  snaps: body.waypoints.map((w) => ({
    lonLat: round(w.location),
    distanceM: Math.round(w.distance),
    road: w.name || null,
  })),
  legs,
};

await writeFile(OUT, `${JSON.stringify(recording)}\n`);
const points = legs.reduce((n, l) => n + l.path.length, 0);
const km = legs.reduce((n, l) => n + l.distanceM, 0) / 1000;
console.log(
  `Recorded ${legs.length} legs, ${km.toFixed(1)} km, ${points} points → ${OUT.pathname}`,
);
