// Exercises Phase 5's interrupt path against a real database: trip → watch →
// event → match → a stubbed judge routing to `interrupt` → delivery under the
// budget → a stubbed push → the card → accept, dismiss, mute → the sweep.
// Run with `npm run smoke:interrupt`.
//
// No detector has graduated into `INTERRUPT_ELIGIBLE`, so nothing in
// production can reach this path yet. That is exactly why it needs a rehearsal:
// the day a detector graduates is the wrong day to find out the budget can be
// raced. The judge and the push service are stubbed; everything between them
// is the real code on the real tables.
//
// What it checks, and why each one:
//   one event, two stops      one push — `covered`, not two interrupts
//   accept                    patch authored `intervention`, accepted by the
//                             traveller, outcome and patch in one transaction
//   accept twice              refused: two devices cannot both apply it
//   mute                      outcome `muted`, push off, `muted_at` stamped
//   a briefing's change       accepted or dismissed from the same card
//   the sweep                 silence past expiry becomes `ignored`, and a
//                             late answer still overrules it
//   two deliveries, one slot  exactly one push: the lock holds

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { BRIEFING_JOB, writeBriefing } from "../../src/bll/briefing.ts";
import { deliverInterrupt, INTERRUPT_JOB } from "../../src/bll/interrupt.ts";
import {
  answerIntervention,
  interventionCard,
  sweepOutcomes,
} from "../../src/bll/interventions.ts";
import { judgeMatch } from "../../src/bll/judge.ts";
import { JUDGE_JOB, runMatch } from "../../src/bll/match.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { updateWatchSettings } from "../../src/bll/watch-settings.ts";
import { db } from "../../src/dal/client.ts";
import { registerDevice } from "../../src/dal/devices.ts";
import { upsertEvent } from "../../src/dal/events.ts";
import type { TripDoc, TripNode } from "../../src/domain/trip/document.ts";
import { dayKey } from "../../src/domain/trip/document.ts";
import type { Briefer } from "../../src/domain/watch/briefing.ts";
import {
  dedupeKey,
  type EventKind,
  type WeatherKind,
} from "../../src/domain/watch/event.ts";
import type { Pusher, PushMessage } from "../../src/domain/watch/interrupt.ts";
import type { Judge } from "../../src/domain/watch/judge.ts";

const RUN = `smoke-interrupt-${randomUUID().slice(0, 8)}`;
const OLD_TOWN: [number, number] = [44.8015, 41.6934];

const step = (label: string, value: unknown) =>
  console.log(`\n── ${label}\n`, JSON.stringify(value, null, 1));

let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();

// Indoor stops, so the darkness rule cannot make the rehearsal depend on the
// hour it is run at; placed together, so travel time is never the constraint.
const stop = (title: string, startsAt: string, durationMin = 90): TripNode => ({
  kind: "visit",
  placeId: null,
  lonLat: OLD_TOWN,
  startsAt,
  durationMin,
  indoor: true,
  meta: { title, urban: true },
});

const header = (title: string): TripDoc["trip"] => ({
  title,
  startsAt: hoursFromNow(-1),
  endsAt: hoursFromNow(40),
  party: { adults: 2 },
  pace: "moderate",
  budget: "€€",
  prefs: {},
});

/** The judge, stubbed: urgent, confident, and moving museums a quarter-hour. */
const judge: Judge = async (input) => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 1,
  oneLine: `${input.node.title} is under the weather — a quarter-hour later misses the worst of it.`,
  evidence: `smoke, taken ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  proposals: input.node.title.startsWith("Museum")
    ? [{ move: "shift", nodeId: input.node.id, byMinutes: 15 }]
    : [],
  confidence: 0.9,
});

/** Graduated for this run only. Production's set is empty. */
const eligible = new Set<EventKind>([
  "weather.rain",
  "weather.wind",
  "weather.snow",
  "weather.thunderstorm",
]);

const pushed: { message: PushMessage; tokens: readonly string[] }[] = [];
const push: Pusher = async (message, tokens) => {
  pushed.push({ message, tokens });
  return tokens.map((token) => ({ token, ok: true as const }));
};

const userId = `smoke-${randomUUID()}`;
const written: string[] = [];

async function buildTrip(title: string, stops: TripNode[]) {
  const doc: TripDoc = {
    trip: header(title),
    nodes: Object.fromEntries(stops.map((s) => [randomUUID(), s])),
  };
  const tripId = await createTrip(doc.trip, userId);
  written.push(tripId);
  const built = await appendPatch({
    tripId,
    parentId: null,
    intent: "Smoke plan",
    ops: addAllOps(doc),
    author: "user",
  });
  if (!built.ok) throw new Error(`could not build ${title}: ${built.code}`);
  // What the settings screen will do: push on, and no quiet hours, so the
  // rehearsal does not depend on the hour either.
  await updateWatchSettings(tripId, {
    channels: ["push", "briefing"],
    quietHours: null,
  });
  return {
    tripId,
    ids: Object.fromEntries(
      Object.entries(doc.nodes).map(([id, n]) => [n.meta.title, id]),
    ),
  };
}

async function weather(kind: WeatherKind, from: number, to: number) {
  const draft = {
    source: "smoke",
    kind,
    severity: "severe" as const,
    confidence: 0.9,
    validFrom: hoursFromNow(from),
    validTo: hoursFromNow(to),
    payload: { metric: "smoke", unit: "mm/h", peak: 9 },
  };
  const event = await upsertEvent(draft, {
    regionSlug: "tbilisi",
    observedAt: new Date().toISOString(),
    dedupeKey: `${dedupeKey(draft, "tbilisi")}|${RUN}`,
  });
  if (!event) throw new Error("no tbilisi region");
  return event.id;
}

/** This run's pairs for one event on one trip, judged by the stub. */
async function judgePairs(tripId: string, eventId: string) {
  await runMatch();
  const rows = await db.execute(sql`
    SELECT m.id, n.meta->>'title' AS title FROM event_match m
    JOIN trip_node n ON n.id = m.node_id
    WHERE m.trip_id = ${tripId} AND m.event_id = ${eventId}
    ORDER BY n.starts_at
  `);
  const out: { matchId: string; title: string; route: string }[] = [];
  for (const r of rows.rows) {
    const judged = await judgeMatch(r.id as string, {
      judge,
      interruptEligible: eligible,
    });
    out.push({
      matchId: r.id as string,
      title: r.title as string,
      route: judged.ok ? `${judged.route} (${judged.reason})` : judged.reason,
    });
  }
  return out;
}

const interventionOf = async (tripId: string, channel: string) => {
  const rows = await db.execute(sql`
    SELECT id, outcome, sent_at, patch_id FROM intervention
    WHERE trip_id = ${tripId} AND channel = ${channel}::delivery_channel
    ORDER BY sent_at
  `);
  return rows.rows;
};

await db.execute(sql`
  INSERT INTO "user" (id, name, email, email_verified)
  VALUES (${userId}, 'Smoke Traveller', ${`${userId}@example.test`}, false)
`);
await registerDevice(userId, `ExponentPushToken[${RUN}]`, "ios");

try {
  // ── 1. One event over two stops: one push, then accept it.
  const a = await buildTrip("Interrupt smoke · accept", [
    stop("Museum of Fine Arts", hoursFromNow(2)),
    stop("Café Littera", hoursFromNow(4), 60),
  ]);
  const rain = await weather("weather.rain", 1, 6);
  const judged = await judgePairs(a.tripId, rain);
  step("judged", judged);
  expect(
    judged.length === 2 && judged.every((j) => j.route.startsWith("interrupt")),
    "both stops routed to interrupt",
  );

  const delivered = [];
  for (const j of judged) {
    delivered.push(await deliverInterrupt(j.matchId, { push }));
  }
  step("delivered", delivered);
  expect(pushed.length === 1, "one event is one push, however many stops");
  expect(
    delivered.some((d) => !d.ok && d.reason === "covered"),
    "the second stop is covered by the first push",
  );
  step("the push", pushed[0]?.message);

  const [pushA] = await interventionOf(a.tripId, "push");
  const card = await interventionCard(pushA.id as string, userId);
  step("the card", card);
  expect(
    card.ok && (card.card.rows?.length ?? 0) === 1,
    "the card shows the coherent-day diff",
  );

  const accepted = await answerIntervention(
    pushA.id as string,
    userId,
    "accept",
  );
  step("accept", accepted);
  const patch = accepted.ok
    ? (
        await db.execute(sql`
          SELECT author, accepted_by, meta FROM trip_patch
          WHERE id = ${accepted.patchId}
        `)
      ).rows[0]
    : null;
  expect(
    patch?.author === "intervention" && patch?.accepted_by === userId,
    "the patch is authored `intervention` and accepted by the traveller",
  );
  const [afterA] = await interventionOf(a.tripId, "push");
  expect(
    afterA.outcome === "accepted" &&
      afterA.patch_id === (accepted.ok && accepted.patchId),
    "outcome and patch were written together",
  );
  const moved = await db.execute(sql`
    SELECT starts_at FROM trip_node WHERE id = ${a.ids["Museum of Fine Arts"]}
  `);
  step("museum now starts", moved.rows[0]);

  const again = await answerIntervention(pushA.id as string, userId, "accept");
  expect(
    !again.ok && again.reason === "already-answered",
    "a second accept is refused",
  );
  expect(
    !(await answerIntervention(pushA.id as string, "someone-else", "dismiss"))
      .ok,
    "nobody else can answer it",
  );

  // ── 2. Mute: the per-intervention half of the mute signal.
  const b = await buildTrip("Interrupt smoke · mute", [
    stop("Gallery", hoursFromNow(2.5)),
  ]);
  const wind = await weather("weather.wind", 1, 6);
  for (const j of await judgePairs(b.tripId, wind)) {
    await deliverInterrupt(j.matchId, { push });
  }
  const [pushB] = await interventionOf(b.tripId, "push");
  step("mute", await answerIntervention(pushB.id as string, userId, "mute"));
  const watchB = (
    await db.execute(sql`
      SELECT channels, muted_at FROM trip_watch WHERE trip_id = ${b.tripId}
    `)
  ).rows[0];
  step("watch after mute", watchB);
  expect(
    !String(watchB.channels).includes("push") && watchB.muted_at !== null,
    "push is off for the trip and the mute is stamped",
  );

  // ── 3. Two deliveries racing for the last slot.
  const c = await buildTrip("Interrupt smoke · race", [
    stop("Museum of Georgia", hoursFromNow(3)),
  ]);
  await db.execute(
    sql`UPDATE trip_watch SET cap = 1 WHERE trip_id = ${c.tripId}`,
  );
  const snow = await weather("weather.snow", 2, 6);
  const storm = await weather("weather.thunderstorm", 2, 6);
  const racing = [
    ...(await judgePairs(c.tripId, snow)),
    ...(await judgePairs(c.tripId, storm)),
  ];
  const before = pushed.length;
  const raced = await Promise.all(
    racing.map((j) => deliverInterrupt(j.matchId, { push })),
  );
  step("raced", raced);
  expect(pushed.length - before === 1, "two deliveries, one slot: one push");
  expect(
    raced.some((r) => !r.ok && r.reason === "budget-spent"),
    "the loser goes to the briefing as budget-spent",
  );

  // ── 4. The loser arrives in the morning briefing, as an offer on the card.
  const date = dayKey(hoursFromNow(3));
  const brief: Briefer = async (input) => ({
    greeting: "One thing worth moving.",
    lines: [
      {
        refs: input.items.map((i) => i.ref),
        title: "Weather",
        detail: "Later",
      },
    ],
    change: {
      ref: input.items.findIndex((i) => i.hasProposal),
      sentence: "Start the museum a quarter-hour later.",
    },
  });
  step("briefing", await writeBriefing(c.tripId, date, { brief }));
  const [briefingC] = await interventionOf(c.tripId, "briefing");
  const briefingCard = briefingC
    ? await interventionCard(briefingC.id as string, userId)
    : null;
  step("the briefing's card", briefingCard);
  expect(
    Boolean(briefingCard?.ok && briefingCard.card.suggestion),
    "the briefing's change is on the same card, with its sentence",
  );
  step(
    "dismiss",
    briefingC
      ? await answerIntervention(briefingC.id as string, userId, "dismiss")
      : null,
  );

  // ── 5. The sweep, and a late answer overruling it.
  const [pushC] = await interventionOf(c.tripId, "push");
  await db.execute(sql`
    UPDATE intervention SET expires_at = now() - interval '1 minute'
    WHERE id = ${pushC.id as string}
  `);
  step("sweep", await sweepOutcomes());
  const [sweptC] = await interventionOf(c.tripId, "push");
  expect(sweptC.outcome === "ignored", "silence past expiry is `ignored`");
  const late = await answerIntervention(pushC.id as string, userId, "accept");
  step("a late accept", late);
  expect(late.ok, "the traveller's late answer overrules the sweep's guess");
} finally {
  // Trips first, then the events nothing cites — see smoke-briefing.ts for why
  // the order is the whole point.
  for (const tripId of written) {
    await db.execute(sql`DELETE FROM intervention WHERE trip_id = ${tripId}`);
    await db.execute(sql`
      DELETE FROM job WHERE (kind IN (${JUDGE_JOB}, ${INTERRUPT_JOB})
          AND payload->>'matchId' IN (
            SELECT id::text FROM event_match WHERE trip_id = ${tripId}))
        OR (kind = ${BRIEFING_JOB} AND payload->>'tripId' = ${tripId})
    `);
    await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
  }
  await db.execute(
    sql`DELETE FROM world_event WHERE dedupe_key LIKE ${`%|${RUN}`}`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE id = ${userId}`);
}

console.log(
  failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exitCode = failures === 0 ? 0 : 1;
