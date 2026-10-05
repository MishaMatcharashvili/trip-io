// Rehearses Phase 9's measurements against the real database: plant a few
// trips whose outcomes are known, and check that every figure on the
// dashboard moved by exactly what was planted. Run with `npm run smoke:ops`.
//
// The query module is the one thing unit tests cannot cover — a wrong join
// returns a plausible number — so this is what stands behind the six rows.
//
// The database may already hold real trips, so nothing here asserts an
// absolute value. Each check reads a figure before the planting and after, and
// asserts the difference. What is planted, per trip:
//
//   cohort trip     (an owner who is not an operator, with a pass)
//     rain × stop 1   briefing, worth sending           ┐ one finding, an interrupt
//     rain × stop 2   interrupt                          ┘
//     festival × 1    dropped, with a rejection reason
//     festival × 2    matched, not yet judged
//     interventions   accepted (opened briefing), ignored (unopened briefing),
//                     dismissed (push), pending (push)
//     briefings       three: opened in the app, opened by email only, unopened
//     a device, and a mute
//   operator trip   the same rain pair and one ignored intervention — must not count
//   ownerless trip  likewise — a seeded or synthetic trip must not count either

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { nextToAudit, recordAudit } from "../../src/bll/audit.ts";
import { loadDashboard } from "../../src/bll/ops-dashboard.ts";
import {
  pendingSurvey,
  submitSurvey,
  surveyStatus,
} from "../../src/bll/survey.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { db } from "../../src/dal/client.ts";
import { registerDevice } from "../../src/dal/devices.ts";
import { upsertEvent } from "../../src/dal/events.ts";
import {
  auditStats,
  briefingOpens,
  cohortTrips,
  funnelByFamily,
  interventionOutcomes,
  muteCounts,
  radiusBuckets,
  rejectionMix,
  spend,
  surveyCounts,
  unauditedCandidates,
  worthSending,
} from "../../src/dal/metrics.ts";
import { insertModelCall } from "../../src/dal/model-calls.ts";
import { insertPass } from "../../src/dal/passes.ts";
import type { TripDoc } from "../../src/domain/trip/document.ts";
import { dedupeKey } from "../../src/domain/watch/event.ts";

const RUN = `smoke-ops-${randomUUID().slice(0, 8)}`;
const OLD_TOWN: [number, number] = [44.8015, 41.6934];
const traveller = `${RUN}-traveller`;
const operator = `${RUN}-operator`;
const operatorEmail = `${operator}@example.test`;
const OPERATORS = [operatorEmail];

let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};
const delta = (what: string, before: number, after: number, by: number) =>
  expect(
    after - before === by,
    `${what}: +${by} (was ${before}, now ${after})`,
  );

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();

const written: string[] = [];

async function buildTrip(title: string, owner: string | null) {
  const doc: TripDoc = {
    trip: {
      title,
      startsAt: hoursFromNow(-1),
      endsAt: hoursFromNow(40),
      party: { adults: 2 },
      pace: "moderate",
      budget: "€€",
      prefs: {},
    },
    nodes: Object.fromEntries(
      [0, 1].map((i) => [
        randomUUID(),
        {
          kind: "visit" as const,
          placeId: null,
          lonLat: OLD_TOWN,
          startsAt: hoursFromNow(2 + i * 2),
          durationMin: 60,
          indoor: true,
          meta: { title: `${title} stop ${i + 1}`, urban: true },
        },
      ]),
    ),
  };
  const tripId = await createTrip(doc.trip, owner);
  await insertPass({
    tripId,
    userId: owner,
    kind: "free",
    amountCents: 0,
    currency: "USD",
    provider: "script",
  });
  written.push(tripId);
  const built = await appendPatch({
    tripId,
    parentId: null,
    intent: "Smoke plan",
    ops: addAllOps(doc),
    author: "user",
  });
  if (!built.ok) throw new Error(`could not build ${title}: ${built.code}`);
  const nodes = await db.execute(sql`
    SELECT id FROM trip_node WHERE trip_id = ${tripId} ORDER BY starts_at
  `);
  return { tripId, nodeIds: nodes.rows.map((r) => r.id as string) };
}

async function event(kind: string, from = 1, to = 6) {
  const draft = {
    source: "smoke",
    kind,
    severity: "severe",
    confidence: 0.9,
    validFrom: hoursFromNow(from),
    validTo: hoursFromNow(to),
    payload: { smoke: RUN },
  };
  // biome-ignore lint/suspicious/noExplicitAny: a kind this script plants on purpose
  const e = await upsertEvent(draft as any, {
    regionSlug: "tbilisi",
    observedAt: new Date().toISOString(),
    dedupeKey: `${dedupeKey(draft as never, "tbilisi")}|${RUN}|${kind}`,
  });
  if (!e) throw new Error("no tbilisi region");
  return e.id;
}

const verdict = (line: string) => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 1,
  oneLine: line,
  evidence: `smoke, taken ${new Date().toISOString().slice(0, 16)}`,
  proposals: [],
  confidence: 0.9,
});

async function match(
  eventId: string,
  tripId: string,
  nodeId: string,
  state:
    | {
        route: "interrupt" | "briefing" | "drop";
        reason: string;
        rejections?: unknown;
      }
    | "unjudged",
): Promise<string> {
  const judged = state !== "unjudged";
  const rows = await db.execute(sql`
    INSERT INTO event_match
      (event_id, trip_id, node_id, score, judged_at, route, route_reason, verdict, rejections)
    VALUES (${eventId}, ${tripId}, ${nodeId}, 1,
            ${judged ? sql`now()` : sql`NULL`},
            ${judged ? sql`${state.route}::event_route` : sql`NULL`},
            ${judged ? state.reason : null},
            ${judged ? JSON.stringify(verdict("A smoke finding.")) : null}::jsonb,
            ${judged && state.rejections ? JSON.stringify(state.rejections) : null}::jsonb)
    RETURNING id
  `);
  return rows.rows[0].id as string;
}

async function briefing(
  tripId: string,
  dayOffset: number,
  opts: { quiet?: boolean; email?: boolean; app?: boolean },
): Promise<string> {
  const rows = await db.execute(sql`
    INSERT INTO briefing (trip_id, day, day_index, quiet, document, opened_at, app_opened_at)
    VALUES (${tripId}, (current_date + ${dayOffset}::int), ${dayOffset}, ${opts.quiet ?? false},
            '{}'::jsonb,
            ${opts.email || opts.app ? sql`now()` : sql`NULL`},
            ${opts.app ? sql`now()` : sql`NULL`})
    RETURNING id
  `);
  return rows.rows[0].id as string;
}

async function intervention(
  tripId: string,
  eventId: string,
  channel: "push" | "briefing",
  outcome: "accepted" | "dismissed" | "ignored" | null,
  briefingId: string | null,
) {
  await db.execute(sql`
    INSERT INTO intervention (trip_id, event_id, channel, outcome, outcome_at, briefing_id, offer)
    VALUES (${tripId}, ${eventId}, ${channel}::delivery_channel,
            ${outcome}::intervention_outcome,
            ${outcome ? sql`now()` : sql`NULL`}, ${briefingId}, '{}'::jsonb)
  `);
}

const now = new Date();
const snapshot = async () => ({
  outcomes: await interventionOutcomes(OPERATORS),
  mutes: await muteCounts(OPERATORS),
  opens: await briefingOpens(OPERATORS),
  worth: await worthSending(OPERATORS),
  funnel: await funnelByFamily(OPERATORS),
  rejections: await rejectionMix(OPERATORS),
  radius: await radiusBuckets(OPERATORS),
  survey: await surveyCounts(OPERATORS, now),
  spend: await spend(OPERATORS, new Date(+now - 3_600_000)),
  audits: await auditStats(),
});
const family = <T extends { family: string }>(rows: T[], f: string) =>
  rows.find((r) => r.family === f);

await db.execute(sql`
  INSERT INTO "user" (id, name, email, email_verified) VALUES
    (${traveller}, 'Smoke Traveller', ${`${traveller}@example.test`}, false),
    (${operator}, 'Smoke Operator', ${operatorEmail}, false)
`);

try {
  const before = await snapshot();

  const cohort = await buildTrip("Ops smoke · cohort", traveller);
  const staff = await buildTrip("Ops smoke · operator", operator);
  const orphan = await buildTrip("Ops smoke · ownerless", null);

  await registerDevice(traveller, `ExponentPushToken[${RUN}-t]`, "ios");
  await registerDevice(operator, `ExponentPushToken[${RUN}-o]`, "ios");
  await db.execute(sql`
    UPDATE trip_watch SET muted_at = now()
    WHERE trip_id IN (${cohort.tripId}, ${staff.tripId})
  `);

  const rain = await event("weather.rain");
  const festival = await event("event.festival");

  // The cohort trip.
  const m1 = await match(rain, cohort.tripId, cohort.nodeIds[0], {
    route: "briefing",
    reason: "beyond-horizon",
  });
  await match(rain, cohort.tripId, cohort.nodeIds[1], {
    route: "interrupt",
    reason: "urgent",
  });
  const dropped = await match(festival, cohort.tripId, cohort.nodeIds[0], {
    route: "drop",
    reason: "not-relevant",
    rejections: [{ reason: "evidence-missing", detail: "smoke" }],
  });
  await match(festival, cohort.tripId, cohort.nodeIds[1], "unjudged");

  const bApp = await briefing(cohort.tripId, 0, { app: true });
  await briefing(cohort.tripId, 1, { email: true, quiet: true });
  const bNone = await briefing(cohort.tripId, 2, {});
  await intervention(cohort.tripId, rain, "briefing", "accepted", bApp);
  await intervention(cohort.tripId, festival, "briefing", "ignored", bNone);
  const rain2 = await event("weather.wind");
  await intervention(cohort.tripId, rain2, "push", "dismissed", null);
  const rain3 = await event("weather.snow");
  await intervention(cohort.tripId, rain3, "push", null, null);

  // The two that must not count.
  for (const t of [staff, orphan]) {
    await match(rain, t.tripId, t.nodeIds[0], {
      route: "briefing",
      reason: "beyond-horizon",
    });
    await intervention(t.tripId, rain, "briefing", "ignored", null);
    await briefing(t.tripId, 0, { app: true });
  }

  // The trip is over, so the survey may be asked; the operator's is not over.
  await db.execute(sql`
    UPDATE trip SET ends_at = now() - interval '1 hour', starts_at = now() - interval '3 days'
    WHERE id = ${cohort.tripId}
  `);

  // Spend: one call for the cohort trip, one that belongs to no trip.
  const call = {
    model: "smoke-model",
    matchId: null,
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 20,
    reasoningTokens: 5,
    latencyMs: 10,
    ok: true,
    error: null,
  };
  await insertModelCall({ ...call, purpose: "judge", tripId: cohort.tripId });
  await insertModelCall({
    ...call,
    purpose: "extract",
    tripId: null,
    ok: false,
    error: "smoke",
  });

  const after = await snapshot();

  console.log("\n── who is in the cohort");
  const members = (await cohortTrips(OPERATORS, now)).map((t) => t.id);
  expect(members.includes(cohort.tripId), "the traveller's trip is in");
  expect(!members.includes(staff.tripId), "an operator's trip is out");
  expect(!members.includes(orphan.tripId), "an ownerless trip is out");

  console.log("\n── interventions acted on");
  const o = (k: keyof typeof after.outcomes.all, s: "all" | "seen") =>
    after.outcomes[s][k] - before.outcomes[s][k];
  expect(
    o("accepted", "all") === 1 &&
      o("ignored", "all") === 1 &&
      o("dismissed", "all") === 1 &&
      o("pending", "all") === 1 &&
      o("muted", "all") === 0,
    "one each of accepted, ignored, dismissed, pending; the others' ignored excluded",
  );
  expect(
    o("accepted", "seen") === 1 &&
      o("dismissed", "seen") === 1 &&
      o("pending", "seen") === 1 &&
      o("ignored", "seen") === 0,
    "an ignored item in an unopened briefing is not counted as seen",
  );

  console.log("\n── notifications disabled");
  delta(
    "trips that could mute",
    before.mutes.withDevice,
    after.mutes.withDevice,
    1,
  );
  delta("trips that muted", before.mutes.muted, after.mutes.muted, 1);

  console.log("\n── briefings opened");
  delta("composed", before.opens.composed, after.opens.composed, 3);
  delta("opened (any)", before.opens.opened, after.opens.opened, 2);
  delta(
    "opened in the app",
    before.opens.openedInApp,
    after.opens.openedInApp,
    1,
  );
  delta("quiet", before.opens.quiet, after.opens.quiet, 1);

  console.log("\n── worth sending");
  const wb = family(before.worth, "weather");
  const wa = family(after.worth, "weather");
  delta("weather findings", wb?.worth ?? 0, wa?.worth ?? 0, 1);
  delta("…of them interrupts", wb?.interrupt ?? 0, wa?.interrupt ?? 0, 1);
  expect(
    (family(after.worth, "event")?.worth ?? 0) ===
      (family(before.worth, "event")?.worth ?? 0),
    "a dropped festival is not a finding",
  );

  console.log("\n── the funnel");
  const fb = family(before.funnel, "event");
  const fa = family(after.funnel, "event");
  delta("festival pairs", fb?.pairs ?? 0, fa?.pairs ?? 0, 2);
  delta("…dropped", fb?.dropped ?? 0, fa?.dropped ?? 0, 1);
  delta("…unjudged", fb?.unjudged ?? 0, fa?.unjudged ?? 0, 1);
  const rj = (rows: typeof after.rejections) =>
    rows.find((r) => r.label === "evidence-missing")?.n ?? 0;
  delta(
    "evidence-missing rejections",
    rj(before.rejections),
    rj(after.rejections),
    1,
  );

  console.log("\n── radius");
  const nearWorth = (rows: typeof after.radius) =>
    rows.find((r) => r.family === "weather" && r.upToKm === 1)?.worth ?? 0;
  delta(
    "weather worth-sending pairs inside 1 km",
    nearWorth(before.radius),
    nearWorth(after.radius),
    2,
  );

  console.log("\n── spend");
  const cohortJudge = (rows: typeof after.spend) =>
    rows.find(
      (r) => r.purpose === "judge" && r.model === "smoke-model" && r.cohort,
    )?.calls ?? 0;
  const floorExtract = (rows: typeof after.spend) =>
    rows.find(
      (r) => r.purpose === "extract" && r.model === "smoke-model" && !r.cohort,
    )?.failed ?? 0;
  delta(
    "judge calls on the cohort trip",
    cohortJudge(before.spend),
    cohortJudge(after.spend),
    1,
  );
  delta(
    "failed extract calls on no trip",
    floorExtract(before.spend),
    floorExtract(after.spend),
    1,
  );

  console.log("\n── the survey");
  expect(
    (await surveyStatus(cohort.tripId)) === "ask",
    "asked once the trip is over",
  );
  expect(
    (await pendingSurvey(traveller))?.tripId === cohort.tripId,
    "the home page is told which trip to ask about",
  );
  expect(
    (await surveyStatus(staff.tripId)) === "not-yet",
    "not asked mid-trip",
  );
  expect(
    (await submitSurvey({ tripId: staff.tripId, wouldPay: true })) ===
      "not-askable",
    "a mid-trip answer is refused",
  );
  expect(
    (await submitSurvey({
      tripId: cohort.tripId,
      wouldPay: true,
      note: "smoke",
    })) === "recorded",
    "the answer is recorded",
  );
  expect(
    (await submitSurvey({ tripId: cohort.tripId, wouldPay: false })) ===
      "already-answered",
    "and only once",
  );
  expect((await pendingSurvey(traveller)) === null, "and is not asked again");
  const survey = await surveyCounts(OPERATORS, new Date());
  delta("answered", before.survey.answered, survey.answered, 1);
  delta("would pay", before.survey.yes, survey.yes, 1);
  delta("finished trips", before.survey.eligible, survey.eligible, 1);

  console.log("\n── the audit");
  const candidates = await unauditedCandidates();
  expect(
    candidates.some((c) => c.matchId === m1),
    "a briefing-routed verdict is waiting for audit",
  );
  expect(
    !candidates.some((c) => c.matchId === dropped),
    "a dropped verdict is not asked about",
  );
  const next = await nextToAudit(OPERATORS);
  expect(next !== null, "the queue has something to show");
  expect(
    (
      await recordAudit(
        { matchId: m1, correct: false, auditor: "smoke" },
        OPERATORS,
      )
    ).ok === false,
    "a wrong mark needs a reason",
  );
  const marked = await recordAudit(
    { matchId: m1, correct: false, reason: "not-relevant", auditor: "smoke" },
    OPERATORS,
  );
  expect(marked.ok, "a wrong mark with a reason is recorded");
  const again = await recordAudit(
    { matchId: m1, correct: true, auditor: "smoke" },
    OPERATORS,
  );
  expect(
    !again.ok && again.reason === "already-audited",
    "a verdict is audited once",
  );
  expect(
    !(await unauditedCandidates()).some((c) => c.matchId === m1),
    "and leaves the queue",
  );
  const ab = family(before.audits, "weather");
  const aa = family(await auditStats(), "weather");
  delta("weather audits", ab?.audited ?? 0, aa?.audited ?? 0, 1);
  delta("…wrong", ab?.wrong ?? 0, aa?.wrong ?? 0, 1);
  delta(
    "…in the cohort",
    ab?.auditedInCohort ?? 0,
    aa?.auditedInCohort ?? 0,
    1,
  );

  console.log("\n── the page's view model");
  const dash = await loadDashboard(OPERATORS, new Date());
  expect(dash.kill.length === 6, "six kill rows");
  expect(
    dash.kill.every((r) => r.n >= 0 && r.notes.length >= 0),
    "each carries its sample size",
  );
  console.log(
    dash.kill
      .map(
        (r) =>
          `   ${r.label.padEnd(42)} ${String(r.value === null ? "—" : r.value.toFixed(2)).padStart(5)}  n=${r.n}  ${r.band}`,
      )
      .join("\n"),
  );
} finally {
  for (const tripId of written) {
    await db.execute(sql`DELETE FROM intervention WHERE trip_id = ${tripId}`);
    await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
  }
  await db.execute(
    sql`DELETE FROM world_event WHERE dedupe_key LIKE ${`%|${RUN}|%`}`,
  );
  await db.execute(sql`DELETE FROM verdict_audit WHERE auditor = 'smoke'`);
  await db.execute(sql`DELETE FROM model_call WHERE model = 'smoke-model'`);
  await db.execute(
    sql`DELETE FROM "user" WHERE id IN (${traveller}, ${operator})`,
  );
}

console.log(
  failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exitCode = failures === 0 ? 0 : 1;
