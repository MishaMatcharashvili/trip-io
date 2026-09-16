import { writeFileSync } from "node:fs";
import { corridors, seasonRisk } from "../../src/core/catalogue/corridors.ts";
import { simplifyLine } from "../../src/core/geo.ts";

// Routes each corridor's waypoints through OSRM and writes the simplified road
// geometry to corridors.geo.json, which is checked in so seeding never depends on
// a third-party router being up. Rerun only when a corridor definition changes.
//
// Uses the FOSSGIS-hosted OSRM (car and bike profiles): 12 requests, one at a
// time, well within its usage policy. Set OSRM_URL to a self-hosted instance
// exposing the same /routed-<profile>/ paths if that ever changes.

const OSRM_URL = process.env.OSRM_URL ?? "https://routing.openstreetmap.de";
const OUT = "src/core/catalogue/corridors.geo.json";
// A waypoint further than this from any routable road is a typo in its
// coordinates, not a road OSRM should quietly snap to.
const MAX_SNAP_M = 750;
const SIMPLIFY_TOLERANCE_M = 25;

type OsrmResponse = {
  code: string;
  message?: string;
  routes: { distance: number; geometry: { coordinates: [number, number][] } }[];
  waypoints: { distance: number; name: string }[];
};

const features = [];

for (const corridor of corridors) {
  seasonRisk.parse(corridor.seasonRisk);

  const coords = corridor.waypoints.map(([, lon, lat]) => `${lon},${lat}`);
  const profile = corridor.profile ?? "car";
  const url = `${OSRM_URL}/routed-${profile}/route/v1/driving/${coords.join(";")}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const body = (await res.json()) as OsrmResponse;
  if (body.code !== "Ok") {
    throw new Error(
      `${corridor.slug}: OSRM ${body.code} ${body.message ?? ""}`,
    );
  }

  body.waypoints.forEach((wp, i) => {
    if (wp.distance > MAX_SNAP_M) {
      const [name] = corridor.waypoints[i];
      throw new Error(
        `${corridor.slug}: waypoint ${name} is ${Math.round(wp.distance)}m from the nearest road`,
      );
    }
  });

  const [route] = body.routes;
  const line = simplifyLine(route.geometry.coordinates, SIMPLIFY_TOLERANCE_M);
  console.log(
    `${corridor.slug.padEnd(18)} ${(route.distance / 1000).toFixed(0).padStart(4)} km  ` +
      `${route.geometry.coordinates.length} -> ${line.length} points`,
  );

  features.push({
    type: "Feature",
    properties: { slug: corridor.slug, distanceM: Math.round(route.distance) },
    geometry: { type: "LineString", coordinates: line },
  });
}

writeFileSync(
  OUT,
  `${JSON.stringify({ type: "FeatureCollection", features }, null, 1)}\n`,
);
console.log(`wrote ${OUT}`);
