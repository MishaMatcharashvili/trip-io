// Exercises the watch pipeline against a real database and a real forecast:
// trip → watch → sense → match → queue → drain. Run with `npm run smoke:watch`.
//
// The judge is stubbed. The queue's mechanics — claiming under SKIP LOCKED, the
// time budget, backoff, giving up after MAX_ATTEMPTS — are what this is for, and
// they are worth exercising without paying a model. `npm run judge:eval` is
// where the model itself is measured.
//
// It writes one trip starting tomorrow, senses only the regions that trip makes
// live, and deletes everything it wrote.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drain } from "../../src/bll/drain.ts";
import { JUDGE_JOB, runMatch } from "../../src/bll/match.ts";
import { senseWeather } from "../../src/bll/sense.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { db } from "../../src/dal/client.ts";
import { upsertEvent } from "../../src/dal/events.ts";
import { enqueue, queueDepth } from "../../src/dal/jobs.ts";
import { insertPass } from "../../src/dal/passes.ts";
import { loadWatch } from "../../src/dal/watches.ts";
import type { TripDoc, TripNode } from "../../src/domain/trip/document.ts";
import { dedupeKey } from "../../src/domain/watch/event.ts";

const DAY = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+04:00`).toISOString();

const step = (label: string, value: unknown) =>
  console.log(`\n── ${label}\n`, JSON.stringify(value, null, 1));

const node = (
  title: string,
  hhmm: string,
  durationMin: number,
  indoor: boolean,
  lonLat: [number, number],
): TripNode => ({
  kind: "visit",
  placeId: null,
  lonLat,
  startsAt: at(hhmm),
  durationMin,
  indoor,
  meta: { title, urban: true },
});

const header: TripDoc["trip"] = {
  title: "Watch smoke test",
  startsAt: at("00:00"),
  endsAt: at("23:59"),
  party: { adults: 1 },
  pace: "moderate",
  budget: "€0",
  prefs: {},
};

// A day with something outdoors and something indoors, so the matcher has both
// a pair worth judging and a pair the judge should dismiss.
const doc: TripDoc = {
  trip: header,
  nodes: {
    [randomUUID()]: node(
      "Narikala fortress",
      "10:00",
      180,
      false,
      [44.7217, 41.6879],
    ),
    [randomUUID()]: node(
      "National Museum",
      "15:00",
      120,
      true,
      [44.7999, 41.6977],
    ),
  },
};

const tripId = await createTrip(header, null);

// Only a trip holding a pass is watched (src/dal/passes.ts).

await insertPass({
  tripId,
  userId: null,
  kind: "free",
  amountCents: 0,
  currency: "USD",
  provider: "script",
});
console.log("trip", tripId);

try {
  const built = await appendPatch({
    tripId,
    parentId: null,
    intent: "Smoke plan",
    ops: addAllOps(doc),
    author: "user",
  });
  if (!built.ok) {
    console.error("could not build the trip", built);
    process.exit(1);
  }

  // 1. The watch, written in the same transaction as the node projection.
  step("trip_watch", await loadWatch(tripId));

  // 2. Sense. Only regions this trip makes live are polled — with one trip in
  //    Tbilisi, that should be one region and one forecast.
  const sensed = await senseWeather();
  step("sense", {
    regions: sensed.regions,
    events: sensed.events,
    escalated: sensed.escalated,
    failed: sensed.failed,
    purged: sensed.purged,
    ms: sensed.ms,
    byRegion: sensed.byRegion,
  });

  // 3. Most days, Tbilisi's weather is quiet and there is nothing to match.
  //    A rehearsal that only works in bad weather is not a rehearsal, so write
  //    one deliberate event over the outdoor stop when the sky is clear.
  if (sensed.events === 0) {
    const draft = {
      source: "smoke",
      kind: "weather.rain" as const,
      severity: "severe" as const,
      confidence: 0.9,
      validFrom: at("09:00"),
      validTo: at("14:00"),
      payload: { metric: "precipitation", unit: "mm/h", peak: 13 },
    };
    const written = await upsertEvent(draft, {
      regionSlug: "tbilisi",
      observedAt: new Date().toISOString(),
      dedupeKey: `${dedupeKey(draft, "tbilisi")}|smoke-${tripId}`,
    });
    step("stand-in event (the sky was clear)", written);
  }

  // 4. Match, and queue what matched.
  step("match", await runMatch());
  step("queue depth", await queueDepth());

  // 5. Drain with a stubbed judge. Every claimed job should complete.
  let judged = 0;
  const drained = await drain({
    handlers: {
      [JUDGE_JOB]: async (payload) => {
        judged++;
        return payload;
      },
    },
  });
  step("drain", { ...drained, judged });

  // 6. A job that always throws: the drain must record the error, back the job
  //    off and carry on rather than lose the queue.
  await enqueue(JUDGE_JOB, { matchId: "deliberately-broken" });
  const failing = await drain({
    handlers: {
      [JUDGE_JOB]: async () => {
        throw new Error("smoke: deliberate failure");
      },
    },
  });
  const failed = await db.execute(sql`
    SELECT attempts, error, run_after > now() AS backed_off, completed_at
    FROM job
    WHERE payload->>'matchId' = 'deliberately-broken'
  `);
  step("a failing job", { drain: failing, row: failed.rows[0] });

  // 7. Nothing was delivered. That is the phase's whole guarantee.
  const delivered = await db.execute(
    sql`SELECT count(*)::int AS n FROM intervention WHERE trip_id = ${tripId}`,
  );
  step("interventions (must be 0 in Phase 3)", delivered.rows[0]);
} finally {
  await db.execute(
    sql`DELETE FROM job WHERE payload->>'matchId' = 'deliberately-broken'`,
  );
  await db.execute(sql`
    DELETE FROM job WHERE kind = ${JUDGE_JOB}
      AND payload->>'matchId' IN (
        SELECT id::text FROM event_match WHERE trip_id = ${tripId}
      )
  `);
  await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
  await db.execute(
    sql`DELETE FROM world_event WHERE dedupe_key LIKE ${`%|smoke-${tripId}`}`,
  );
  console.log("\ncleaned up");
}
