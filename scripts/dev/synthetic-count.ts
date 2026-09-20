// The Phase 3 kill-criteria check, and the most important number in the plan
// before there is a traveller to ask.
//
//   "Run the pipeline against synthetic trips over historical weather and count
//    what the router would have sent. If that comes back at 1–2 per trip with
//    the weather detector alone, detector expansion stops being Phase 8's nice
//    to have and becomes the whole thesis."
//
// It uses the real database, the real match query and the real router — the
// only thing synthetic is the trips. The weather is real, taken from
// Open-Meteo's archive for the same calendar week one, two and three years back
// and laid over trips that start tomorrow, so the events pass the freshness and
// active-watch filters the live pipeline applies.
//
//   npm run kill:count              pairs per trip-day, no model calls
//   npm run kill:count -- --judge   also judges every pair (costs money)
//
// Each trip is created, matched, judged and deleted before the next one starts.
// Left overlapping, twelve synthetic trips in four regions would match each
// other's weather and report three times the pairs a real traveller would see.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { judgeMatch } from "../../src/bll/judge.ts";
import { JUDGE_JOB, runMatch } from "../../src/bll/match.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { db } from "../../src/dal/client.ts";
import { upsertEvent } from "../../src/dal/events.ts";
import type { TripDoc, TripNode } from "../../src/domain/trip/document.ts";
import { dedupeKey } from "../../src/domain/watch/event.ts";
import { detectWeather } from "../../src/domain/watch/weather.ts";
import { openMeteoArchive } from "../../src/infra/open-meteo.ts";

const argv = new Set(process.argv.slice(2));
const JUDGE = argv.has("--judge");

const TRIP_DAYS = 7;
const DAY_MS = 86_400_000;

type Stop = {
  what: string;
  /** Local Tbilisi time, HH:MM. */
  at: string;
  durationMin: number;
  indoor: boolean;
  kind?: TripNode["kind"];
  lonLat: [number, number];
};

type Area = {
  name: string;
  /** Where the traveller is, and where the weather is asked about. */
  base: [number, number];
  /** A day's shape. Repeated for every day of the trip. */
  day: Stop[];
};

// Four itineraries in the four focus areas, in the shape a generated trip has:
// something outdoors in the morning, meals, something indoors in the afternoon.
// Stops are placeless — a system-authored plan may only use curated catalogue
// places and there are none yet — so their geometry is their own.
const AREAS: Area[] = [
  {
    name: "tbilisi",
    base: [44.7866, 41.7151],
    day: [
      {
        what: "Narikala and the old town",
        at: "09:30",
        durationMin: 180,
        indoor: false,
        lonLat: [44.7217, 41.6879],
      },
      {
        what: "Lunch in Abanotubani",
        at: "13:00",
        durationMin: 75,
        indoor: true,
        kind: "meal",
        lonLat: [44.7186, 41.6906],
      },
      {
        what: "Georgian National Museum",
        at: "15:00",
        durationMin: 120,
        indoor: true,
        lonLat: [44.7999, 41.6977],
      },
      {
        what: "Dinner on Rustaveli",
        at: "19:30",
        durationMin: 90,
        indoor: true,
        kind: "meal",
        lonLat: [44.7955, 41.6995],
      },
    ],
  },
  {
    name: "kazbegi",
    base: [44.6419, 42.6583],
    day: [
      {
        what: "Gergeti Trinity hike",
        at: "09:00",
        durationMin: 240,
        indoor: false,
        lonLat: [44.6194, 42.6624],
      },
      {
        what: "Lunch in Stepantsminda",
        at: "14:00",
        durationMin: 75,
        indoor: true,
        kind: "meal",
        lonLat: [44.6419, 42.6583],
      },
      {
        what: "Sno valley viewpoint",
        at: "16:00",
        durationMin: 120,
        indoor: false,
        lonLat: [44.6669, 42.6039],
      },
      {
        what: "Dinner at the guesthouse",
        at: "19:30",
        durationMin: 90,
        indoor: true,
        kind: "meal",
        lonLat: [44.6419, 42.6583],
      },
    ],
  },
  {
    name: "kakheti",
    base: [45.9219, 41.6203],
    day: [
      {
        what: "Sighnaghi town walls",
        at: "09:30",
        durationMin: 150,
        indoor: false,
        lonLat: [45.9219, 41.6203],
      },
      {
        what: "Lunch at a marani",
        at: "13:00",
        durationMin: 90,
        indoor: true,
        kind: "meal",
        lonLat: [45.92, 41.618],
      },
      {
        what: "Tsinandali Estate",
        at: "15:30",
        durationMin: 120,
        indoor: true,
        lonLat: [45.5686, 41.8931],
      },
      {
        what: "Dinner in Telavi",
        at: "19:30",
        durationMin: 90,
        indoor: true,
        kind: "meal",
        lonLat: [45.4731, 41.9181],
      },
    ],
  },
  {
    name: "svaneti",
    base: [42.728, 43.045],
    day: [
      {
        what: "Chalaadi Glacier trail",
        at: "09:00",
        durationMin: 240,
        indoor: false,
        lonLat: [42.7828, 43.0846],
      },
      {
        what: "Lunch in Mestia",
        at: "14:00",
        durationMin: 75,
        indoor: true,
        kind: "meal",
        lonLat: [42.728, 43.045],
      },
      {
        what: "Svaneti Museum",
        at: "16:00",
        durationMin: 120,
        indoor: true,
        lonLat: [42.7301, 43.0437],
      },
      {
        what: "Dinner in Mestia",
        at: "19:30",
        durationMin: 90,
        indoor: true,
        kind: "meal",
        lonLat: [42.728, 43.045],
      },
    ],
  },
];

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function ymdShifted(days: number): string {
  return ymd(new Date(Date.now() + (days + 1) * DAY_MS));
}
const at = (day: string, hhmm: string) =>
  new Date(`${day}T${hhmm}:00+04:00`).toISOString();

/** Trips start tomorrow, so their watch is active and their nodes are ahead. */
const START = new Date(Date.now() + DAY_MS);
const LAST_YEAR = START.getUTCFullYear() - 1;

/**
 * Which real week of weather to lay over the trip.
 *
 * Sampling only the current week would measure September, not the system: a
 * mild month produces almost nothing, and reading that as "the detector is
 * quiet" would be exactly the wrong conclusion to draw before Phase 8. So four
 * seasons are sampled as well as two in-season years, and a winter trip in
 * Svaneti is allowed to say what it has to say.
 *
 * Laying January weather over September dates puts the diurnal cycle an hour or
 * two out against sunrise. That costs nothing here, because matching is a
 * spatiotemporal join and knows nothing about dusk — only the judge does, and
 * the judge is told the real dates.
 */
const WEATHER_WINDOWS = [
  { label: "in season, 1y", from: ymdShifted(-365) },
  { label: "in season, 2y", from: ymdShifted(-730) },
  { label: `jan ${LAST_YEAR}`, from: `${LAST_YEAR}-01-15` },
  { label: `apr ${LAST_YEAR}`, from: `${LAST_YEAR}-04-15` },
  { label: `jul ${LAST_YEAR}`, from: `${LAST_YEAR}-07-15` },
  { label: `oct ${LAST_YEAR}`, from: `${LAST_YEAR}-10-15` },
];

function buildTrip(area: Area): TripDoc {
  const startDay = ymd(START);
  const endDay = ymd(new Date(START.getTime() + (TRIP_DAYS - 1) * DAY_MS));
  const nodes: Record<string, TripNode> = {};

  for (let d = 0; d < TRIP_DAYS; d++) {
    const day = ymd(new Date(START.getTime() + d * DAY_MS));
    for (const stop of area.day) {
      nodes[randomUUID()] = {
        kind: stop.kind ?? "visit",
        placeId: null,
        lonLat: stop.lonLat,
        startsAt: at(day, stop.at),
        durationMin: stop.durationMin,
        indoor: stop.indoor,
        meta: { title: stop.what, urban: area.name === "tbilisi" },
      };
    }
  }

  return {
    trip: {
      title: `Synthetic ${area.name}`,
      startsAt: at(startDay, "00:00"),
      endsAt: at(endDay, "23:59"),
      party: { adults: 2 },
      pace: "moderate",
      budget: "€700",
      prefs: { areas: [area.name], synthetic: true },
    },
    nodes,
  };
}

/** Which sense region a point falls in. The events borrow its geometry. */
async function regionAt([lon, lat]: [number, number]): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT slug FROM region
    WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)
    LIMIT 1
  `);
  return (rows.rows[0]?.slug as string) ?? null;
}

/**
 * A real week of weather, moved onto the trip's own dates. Whole days are
 * shifted, so rain that fell during the afternoon still falls during the
 * afternoon — the part that decides whether it lands on the hike or on dinner.
 */
async function shiftedWeather(area: Area, fromDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(from.getTime() + (TRIP_DAYS - 1) * DAY_MS);
  const hourly = await openMeteoArchive(area.base, fromDate, ymd(to));
  const shift =
    Math.round((START.getTime() - from.getTime()) / DAY_MS) * DAY_MS;

  return {
    ...hourly,
    time: hourly.time.map((t) => iso(new Date(Date.parse(t) + shift))),
  };
}

type Row = {
  area: string;
  weather: string;
  events: number;
  pairs: number;
  sent: number;
};

const rows: Row[] = [];
const routes: Record<string, number> = {};
const reasons: Record<string, number> = {};
let judgeFailures = 0;

/** Judge every unjudged pair on this trip, and count where the router sent it. */
async function judgeTrip(tripId: string): Promise<number> {
  const pending = await db.execute(sql`
    SELECT id FROM event_match
    WHERE trip_id = ${tripId} AND judged_at IS NULL
    ORDER BY score DESC
  `);

  let sent = 0;
  for (const row of pending.rows) {
    try {
      const outcome = await judgeMatch(row.id as string);
      if (!outcome.ok) continue;
      routes[outcome.route] = (routes[outcome.route] ?? 0) + 1;
      reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
      if (outcome.route !== "drop") sent++;
    } catch (error) {
      judgeFailures++;
      console.error("  judge failed:", (error as Error).message);
    }
  }
  return sent;
}

async function cleanUp(tripId: string): Promise<void> {
  // Jobs first: `event_match` cascades from the trip, so once the trip is gone
  // there is nothing left to find the queued jobs by, and they sit in the queue
  // until something drains them.
  await db.execute(sql`
    DELETE FROM job
    WHERE kind = ${JUDGE_JOB}
      AND payload->>'matchId' IN (
        SELECT id::text FROM event_match WHERE trip_id = ${tripId}
      )
  `);
  // Interventions restrict event deletion, and this phase writes none — but
  // order the deletes as though it did, so this stays correct in Phase 5.
  await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
  await db.execute(
    sql`DELETE FROM world_event WHERE dedupe_key LIKE ${`%|synthetic-${tripId}`}`,
  );
}

for (const area of AREAS) {
  const slug = await regionAt(area.base);
  if (!slug) {
    console.error(
      `no sense region contains ${area.name} — is the catalogue loaded?`,
    );
    process.exit(1);
  }

  for (const window of WEATHER_WINDOWS) {
    const doc = buildTrip(area);
    const tripId = await createTrip(doc.trip, null);

    try {
      const patched = await appendPatch({
        tripId,
        parentId: null,
        intent: `Synthetic ${area.name}`,
        ops: addAllOps(doc),
        author: "user",
        meta: { synthetic: true },
      });
      if (!patched.ok) {
        console.error(`${area.name}: could not build the trip`, patched);
        process.exit(1);
      }

      const hourly = await shiftedWeather(area, window.from);
      const observedAt = iso(new Date());
      const drafts = detectWeather(hourly, {
        observedAt,
        horizonHours: TRIP_DAYS * 24,
      });

      let events = 0;
      for (const draft of drafts) {
        // Scoped to the trip: three weather years in the same region would
        // otherwise collapse onto one dedupe key and overwrite each other.
        const key = `${dedupeKey(draft, slug)}|synthetic-${tripId}`;
        const written = await upsertEvent(draft, {
          regionSlug: slug,
          observedAt,
          dedupeKey: key,
        });
        if (written) events++;
      }

      const matched = await runMatch();
      const sent = JUDGE ? await judgeTrip(tripId) : 0;

      rows.push({
        area: area.name,
        weather: window.label,
        events,
        pairs: matched.matched,
        sent,
      });
      console.log(
        `${area.name.padEnd(9)} ${window.label.padEnd(14)} ` +
          `${String(events).padStart(3)} events  ` +
          `${String(matched.matched).padStart(4)} pairs` +
          (JUDGE ? `  ${String(sent).padStart(3)} worth sending` : ""),
      );
    } finally {
      await cleanUp(tripId);
    }
  }
}

const tripDays = rows.length * TRIP_DAYS;
const pairs = rows.reduce((n, r) => n + r.pairs, 0);
console.log(`\n── pairs per trip-day`);
console.log(
  `${pairs} pairs over ${tripDays} trip-days = ${(pairs / tripDays).toFixed(1)} per trip-day`,
);
console.log(
  pairs / tripDays > 12
    ? "  above a dozen: the match radius is too wide, not the prompt too long"
    : "  within budget",
);

if (JUDGE) {
  console.log(`\n── the router`);
  console.log("routes  ", routes);
  console.log("reasons ", reasons);
  if (judgeFailures) console.log("failed  ", judgeFailures);

  const perTrip = rows.reduce((n, r) => n + r.sent, 0) / rows.length;
  console.log(`\n── the number that decides Phase 8`);
  console.log(
    `${perTrip.toFixed(1)} interventions worth sending per ${TRIP_DAYS}-day trip`,
  );
  console.log(
    perTrip < 2
      ? "  below 2: detector expansion is the thesis, not a later nice-to-have"
      : perTrip > 8
        ? "  above 8: the judge is too talkative — tighten it before the briefing ships"
        : "  inside the 4-8 band the kill criteria ask for",
  );
}

console.log(`\ncleaned up ${rows.length} synthetic trips`);
