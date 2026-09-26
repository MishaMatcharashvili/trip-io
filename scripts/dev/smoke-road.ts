// Exercises detector #2 against a real database, without Telegram: reports
// from a stranger and from an operator → moderation → a road event over the
// corridor's own geometry → the matcher → the next report ending the last.
// Run with `npm run smoke:road`.
//
// The bot (src/server/telegram) is a thin form over `submitRoadReport` and
// `moderateReport`; everything that decides anything is below it, and runs
// here on the real tables.
//
// It writes on the Georgian Military Road, and a published report ends every
// road event open on that corridor — so it refuses to run while any road
// event on it is live that it did not write itself.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { JUDGE_JOB } from "../../src/bll/match.ts";
import {
  moderateReport,
  reviewQueue,
  submitRoadReport,
} from "../../src/bll/road-report.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { db } from "../../src/dal/client.ts";
import { insertPass } from "../../src/dal/passes.ts";
import type { TripNode } from "../../src/domain/trip/document.ts";
import { MAX_PENDING_PER_REPORTER } from "../../src/domain/watch/road.ts";

const ROAD = "military-road";
const RUN = `smoke-road-${randomUUID().slice(0, 8)}`;

const step = (label: string, value: unknown) =>
  console.log(`\n── ${label}\n`, JSON.stringify(value, null, 1));

let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();

const live = await db.execute(sql`
  SELECT count(*)::int AS n FROM world_event
  WHERE source = 'road-report' AND payload->>'corridor' = ${ROAD}
    AND (valid_to IS NULL OR valid_to > now())
`);
if ((live.rows[0].n as number) > 0) {
  console.error(
    `${live.rows[0].n} live road event(s) on ${ROAD}; publishing here would end them. Not running.`,
  );
  process.exit(1);
}

const stranger = { id: `${RUN}-stranger`, name: "A stranger", chatId: "0" };
const operator = { id: `${RUN}-operator`, name: "Operator", chatId: "0" };
const reports: string[] = [];
let tripId: string | null = null;

const closure = {
  corridorSlug: ROAD,
  condition: "closed",
  hazard: "avalanche",
  duration: "6h",
} as const;

try {
  // A trip that drives the Military Road, and does other things beside it.
  const transfer = randomUUID();
  const lunch = randomUUID();
  const named = randomUUID();
  const node = (
    over: Partial<TripNode> & Pick<TripNode, "kind" | "startsAt">,
  ) =>
    ({
      placeId: null,
      lonLat: [44.644, 42.657], // Stepantsminda, on the road
      durationMin: 60,
      indoor: false,
      meta: { title: "stop", urban: false },
      ...over,
    }) as TripNode;
  const doc = {
    trip: {
      title: "Road smoke · Kazbegi",
      startsAt: hoursFromNow(-1),
      endsAt: hoursFromNow(30),
      party: {},
      pace: "moderate" as const,
      budget: "€",
      prefs: {},
    },
    nodes: {
      [transfer]: node({
        kind: "transfer",
        startsAt: hoursFromNow(1),
        durationMin: 180,
        meta: { title: "Drive to Stepantsminda", urban: false },
      }),
      // On the road too, but lunch is not a drive: a closure is about getting
      // there, not about what happens once you have.
      [lunch]: node({
        kind: "meal",
        startsAt: hoursFromNow(4.5),
        indoor: true,
        meta: { title: "Lunch in Stepantsminda", urban: false },
      }),
      // Twenty kilometres off the road, but says which corridor it drives.
      [named]: node({
        kind: "transfer",
        lonLat: [44.9, 42.6],
        startsAt: hoursFromNow(6),
        durationMin: 90,
        meta: {
          title: "Drive out to the valley",
          urban: false,
          corridorSlug: ROAD,
        },
      }),
    },
  };
  tripId = await createTrip(doc.trip, null);
  // Only a trip holding a pass is watched (src/dal/passes.ts).
  await insertPass({
    tripId,
    userId: null,
    kind: "free",
    amountCents: 0,
    currency: "USD",
    provider: "script",
  });
  const built = await appendPatch({
    tripId,
    parentId: null,
    intent: "Smoke plan",
    ops: addAllOps(doc),
    author: "user",
  });
  if (!built.ok) throw new Error(`could not build the trip: ${built.code}`);

  // ── 1. A stranger's report waits for review.
  const first = await submitRoadReport(closure, stranger, "community");
  step("a stranger reports", first);
  expect(
    first.ok && first.status === "pending",
    "held for review, not published",
  );
  if (first.ok) reports.push(first.reportId);

  // ── 2. …and cannot bury the queue.
  const more = [];
  for (let i = 0; i < MAX_PENDING_PER_REPORTER; i++) {
    more.push(
      await submitRoadReport(
        {
          ...closure,
          condition: "delays",
          hazard: "roadworks",
          duration: "2h",
        },
        stranger,
        "community",
      ),
    );
  }
  for (const r of more) if (r.ok) reports.push(r.reportId);
  step("and again, and again", more);
  expect(
    more.at(-1)?.ok === false,
    `a reporter may have ${MAX_PENDING_PER_REPORTER} waiting, not more`,
  );
  step(
    "the operators' queue",
    (await reviewQueue()).map((r) => r.description),
  );

  // ── 3. An operator approves it: an event over the corridor, at the
  //    community's confidence, matched against drives and nothing else.
  const approved = first.ok
    ? await moderateReport(first.reportId, operator.id, "approve")
    : null;
  step("approved", approved);
  const eventId =
    approved?.ok && "eventId" in approved ? approved.eventId : null;
  const event = eventId
    ? (
        await db.execute(sql`
          SELECT kind, severity, confidence, ST_GeometryType(geom::geometry) AS shape
          FROM world_event WHERE id = ${eventId}
        `)
      ).rows[0]
    : null;
  step("the event", event);
  expect(
    event?.kind === "road.closure" && Number(event?.confidence) === 0.8,
    "a closure, trusted at the community's 0.8",
  );
  expect(
    String(event?.shape).includes("Polygon"),
    "its geometry is the corridor's buffer",
  );

  const matched = (
    await db.execute(sql`
      SELECT n.meta->>'title' AS title FROM event_match m
      JOIN trip_node n ON n.id = m.node_id
      WHERE m.event_id = ${eventId} AND m.trip_id = ${tripId}
      ORDER BY n.starts_at
    `)
  ).rows.map((r) => r.title);
  step("matched", matched);
  expect(
    matched.includes("Drive to Stepantsminda"),
    "the drive along it matches",
  );
  expect(
    !matched.includes("Lunch in Stepantsminda"),
    "lunch beside it does not",
  );
  expect(
    matched.includes("Drive out to the valley"),
    "a drive that names the corridor matches by name",
  );

  const twice = first.ok
    ? await moderateReport(first.reportId, operator.id, "reject")
    : null;
  expect(
    twice?.ok === false && twice.reason === "already-decided",
    "a report is decided once",
  );
  const [second] = more;
  if (second?.ok) {
    const rejected = await moderateReport(
      second.reportId,
      operator.id,
      "reject",
    );
    expect(
      rejected.ok && rejected.status === "rejected",
      "a rejection is kept, not deleted",
    );
  }

  // ── 4. An operator's own report is published at once, and ends the last.
  const restricted = await submitRoadReport(
    {
      corridorSlug: ROAD,
      condition: "restricted",
      hazard: "snow-closure",
      duration: "today",
    },
    operator,
    "operator",
  );
  step("an operator reports", restricted);
  if (restricted.ok) reports.push(restricted.reportId);
  expect(
    restricted.ok &&
      restricted.status === "published" &&
      restricted.ended === 1,
    "published at once, and the closure it replaces is over",
  );

  // ── 5. Open again: no new event, and nothing left open.
  const reopened = await submitRoadReport(
    {
      corridorSlug: ROAD,
      condition: "reopened",
      hazard: null,
      duration: "unknown",
    },
    operator,
    "operator",
  );
  step("reopened", reopened);
  if (reopened.ok) reports.push(reopened.reportId);
  const open = await db.execute(sql`
    SELECT count(*)::int AS n FROM world_event
    WHERE source = 'road-report' AND payload->>'corridor' = ${ROAD}
      AND valid_to > now()
  `);
  expect(
    reopened.ok &&
      reopened.status === "published" &&
      reopened.eventId === null &&
      open.rows[0].n === 0,
    "a reopening writes no event and leaves nothing open",
  );

  // ── 6. Approved after its window closed: history, not news.
  const old = await submitRoadReport(
    { ...closure, condition: "hazard", hazard: "rockfall", duration: "2h" },
    { ...stranger, id: `${RUN}-late` },
    "community",
    new Date(Date.now() - 5 * 3_600_000),
  );
  if (old.ok) reports.push(old.reportId);
  const late = old.ok
    ? await moderateReport(old.reportId, operator.id, "approve")
    : null;
  step("approved too late", late);
  expect(
    late?.ok === true && late.status === "expired",
    "recorded as expired, not published",
  );
} finally {
  if (tripId) {
    await db.execute(sql`
      DELETE FROM job WHERE kind = ${JUDGE_JOB} AND payload->>'matchId' IN (
        SELECT id::text FROM event_match WHERE trip_id = ${tripId})
    `);
    await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
  }
  const events = await db.execute(sql`
    SELECT event_id FROM road_report WHERE reporter_id LIKE ${`${RUN}%`}
      AND event_id IS NOT NULL
  `);
  await db.execute(
    sql`DELETE FROM road_report WHERE reporter_id LIKE ${`${RUN}%`}`,
  );
  for (const r of events.rows) {
    await db.execute(sql`
      DELETE FROM job WHERE kind = ${JUDGE_JOB} AND payload->>'matchId' IN (
        SELECT id::text FROM event_match WHERE event_id = ${r.event_id as string})
    `);
    await db.execute(
      sql`DELETE FROM world_event WHERE id = ${r.event_id as string}`,
    );
  }
}

console.log(
  failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exitCode = failures === 0 ? 0 : 1;
