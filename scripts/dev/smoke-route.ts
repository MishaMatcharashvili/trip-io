// Exercises the Mapbox Directions adapter against the LIVE API: the three
// routes that used to come out wrong (Tbilisi–Rustavi, Tbilisi–Mtskheta,
// Tbilisi–Gudauri–Stepantsminda), walking, alternatives, and the failures.
// Run with `pnpm smoke:route`. Needs MAPBOX_DIRECTIONS_TOKEN in .env; it spends
// about ten Directions requests and touches no database.
//
// The unit tests in src/infra/mapbox-directions.test.ts use mocked replies and
// prove the adapter's own rules. This is the only check that Mapbox itself
// answers these questions sensibly, so the assertions are bounds a road must
// satisfy (longer than the straight line, shorter than a detour, ends at the
// stops, longitude first), not numbers copied from a previous run.

import { haversineM, type LonLat } from "../../src/domain/geo.ts";
import {
  type RouteAnswer,
  routeRequest,
} from "../../src/domain/route/contract.ts";
import { mapboxDirections } from "../../src/infra/mapbox-directions.ts";

const token = process.env.MAPBOX_DIRECTIONS_TOKEN;
if (!token) {
  console.error("MAPBOX_DIRECTIONS_TOKEN is not set: nothing to check.");
  process.exit(2);
}

const TBILISI: LonLat = [44.7936, 41.7151];
const RUSTAVI: LonLat = [44.9975, 41.5495];
const MTSKHETA: LonLat = [44.7181, 41.8457];
const GUDAURI: LonLat = [44.4791, 42.4767];
const STEPANTSMINDA: LonLat = [44.6435, 42.6567];
const KAZBEK_SUMMIT: LonLat = [44.5178, 42.6989];

const provider = mapboxDirections({ token });
let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const min = (s: number) => `${Math.round(s / 60)} min`;

async function route(
  label: string,
  stops: LonLat[],
  extra: Record<string, unknown> = {},
) {
  console.log(`\n── ${label}`);
  const request = routeRequest.parse({
    stops: stops.map((lonLat) => ({ lonLat })),
    ...extra,
  });
  const out = await provider.compute(request, new Date());
  return { request, out };
}

function sane(answer: RouteAnswer, stops: LonLat[]) {
  const [main] = answer.routes;
  const straight = stops
    .slice(1)
    .reduce((n, s, i) => n + haversineM(stops[i], s), 0);
  console.log(
    `   ${km(main.distanceM)}, ${min(main.durationS)}` +
      (main.typicalDurationS === null
        ? ""
        : ` (usually ${min(main.typicalDurationS)})`) +
      `, ${main.path.length} points, via ${main.description ?? "?"}`,
  );
  expect(
    main.distanceM >= straight * 0.98,
    "road is no shorter than the crow flies",
  );
  expect(main.distanceM <= straight * 2.5, "road is not an absurd detour");
  expect(main.legs.length === stops.length - 1, "one leg per stretch");
  expect(
    answer.stops.every((s, i) => haversineM(s.lonLat, stops[i]) < 3_100),
    "every stop landed within its snapping radius",
  );
  expect(
    main.path.every(
      ([lon, lat]) => lon > 43 && lon < 46.5 && lat > 41 && lat < 43.2,
    ),
    "every point is longitude-first and inside Georgia's neighbourhood",
  );
  answer.stops.forEach((s, i) => {
    if (s.distanceM > 500) {
      console.log(
        `   note: stop ${i + 1} is ${Math.round(s.distanceM)} m from its road`,
      );
    }
  });
}

// Tbilisi–Rustavi
{
  const stops = [TBILISI, RUSTAVI];
  const { out } = await route("Tbilisi → Rustavi, driving", stops);
  expect(out.ok, "answered");
  if (out.ok) {
    sane(out.answer, stops);
    expect(out.answer.traffic === "live", "labelled as a leave-now estimate");
  }
}

// Tbilisi–Mtskheta, both ways of getting there
{
  const stops = [TBILISI, MTSKHETA];
  const drive = await route("Tbilisi → Mtskheta, driving", stops);
  expect(drive.out.ok, "driving answered");
  if (drive.out.ok) sane(drive.out.answer, stops);
  const walk = await route("Tbilisi → Mtskheta, walking", stops, {
    mode: "walk",
  });
  expect(walk.out.ok, "walking answered");
  if (walk.out.ok) {
    sane(walk.out.answer, stops);
    expect(walk.out.answer.traffic === "none", "walking claims no traffic");
    expect(
      walk.out.answer.routes[0].typicalDurationS === null,
      "walking has no typical driving time",
    );
    if (drive.out.ok) {
      expect(
        walk.out.answer.routes[0].durationS >
          drive.out.answer.routes[0].durationS,
        "walking takes longer than driving",
      );
    }
  }
}

// Tbilisi–Gudauri–Stepantsminda: order, legs, and where each leg ends
{
  const stops = [TBILISI, GUDAURI, STEPANTSMINDA];
  const { out } = await route("Tbilisi → Gudauri → Stepantsminda", stops);
  expect(out.ok, "answered");
  if (out.ok) {
    sane(out.answer, stops);
    const [a, b] = out.answer.routes[0].legs;
    expect(
      haversineM(a.path.at(-1) as LonLat, out.answer.stops[1].lonLat) < 25 &&
        haversineM(b.path[0], out.answer.stops[1].lonLat) < 25,
      "the two legs meet at Gudauri",
    );
    expect(
      haversineM(b.path.at(-1) as LonLat, out.answer.stops[2].lonLat) < 25,
      "the second leg ends at Stepantsminda",
    );
    console.log(
      `   legs: ${km(a.distanceM)} ${min(a.durationS)}, ${km(b.distanceM)} ${min(b.durationS)}`,
    );
  }
}

// Alternatives, between two stops
{
  const { out } = await route(
    "Tbilisi → Rustavi, with alternatives",
    [TBILISI, RUSTAVI],
    {
      alternatives: true,
    },
  );
  expect(out.ok, "answered");
  if (out.ok) console.log(`   ${out.answer.routes.length} route(s) offered`);
}

// A stop with no road near it, and a credential that does not work
{
  const { out } = await route("Tbilisi → the summit of Kazbek", [
    TBILISI,
    KAZBEK_SUMMIT,
  ]);
  console.log(
    `   ${JSON.stringify(out.ok ? { ok: true, snap: out.answer.stops[1].distanceM } : out)}`,
  );
  expect(
    !out.ok
      ? out.reason === "unroutable-stop"
      : out.answer.stops[1].distanceM <= 3_000,
    "no road within 3 km is refused, not routed to some other road",
  );

  console.log("\n── a token Mapbox does not know");
  const bad = await mapboxDirections({ token: "pk.invalid" }).compute(
    routeRequest.parse({ stops: [{ lonLat: TBILISI }, { lonLat: RUSTAVI }] }),
    new Date(),
  );
  expect(
    !bad.ok && bad.reason === "auth",
    `reported as auth (${JSON.stringify(bad)})`,
  );
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
