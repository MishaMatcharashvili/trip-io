// Exercises the briefing against a real database: trip → watch → event → match
// → a stubbed verdict routed to `briefing` → schedule → drain → stored briefing
// → rendered email → opened. Run with `npm run smoke:briefing`.
//
// The composer and the mailer are stubbed. What this is for is the wiring the
// unit tests cannot reach: that a live trip-day is found at all, that the bundle
// query picks the right pairs, that the store's claim is idempotent, that the
// delivery marks and the intervention rows actually land, and that a quiet day
// produces a briefing without calling anything.
//
// Three paths are walked deliberately — a good draft, a draft the guards refuse,
// and a day with nothing on it — because the second and third are the ones that
// happen at 07:30 on a Tuesday and nobody is watching.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  BRIEFING_JOB,
  briefingPage,
  scheduleBriefings,
  writeBriefing,
} from "../../src/bll/briefing.ts";
import { drain } from "../../src/bll/drain.ts";
import { JUDGE_JOB, runMatch } from "../../src/bll/match.ts";
import {
  addAllOps,
  appendPatch,
  createTrip,
} from "../../src/bll/trip-document.ts";
import { briefingBundle, openRate } from "../../src/dal/briefings.ts";
import { db } from "../../src/dal/client.ts";
import { upsertEvent } from "../../src/dal/events.ts";
import type { TripDoc, TripNode } from "../../src/domain/trip/document.ts";
import { dayKey } from "../../src/domain/trip/document.ts";
import type { Briefer, Mailer } from "../../src/domain/watch/briefing.ts";
import { dedupeKey } from "../../src/domain/watch/event.ts";
import type { Verdict } from "../../src/domain/watch/judge.ts";
import { renderBriefingEmail } from "../../src/infra/briefing-email.ts";
import { briefWithGemini } from "../../src/infra/gemini-briefing.ts";

/**
 * `--model` swaps the stubbed composer for the real one. Worth running whenever
 * the prompt changes: the guards below are what catch a draft that has stopped
 * covering its bundle, and a prompt edit is exactly what makes that happen.
 */
const USE_MODEL = process.argv.includes("--model");

const step = (label: string, value: unknown) =>
  console.log(`\n── ${label}\n`, JSON.stringify(value, null, 1));

const hoursFromNow = (h: number) =>
  new Date(Date.now() + h * 3_600_000).toISOString();

// Far enough ahead that the bundle's "still in the future" filter keeps them
// whatever time of day this is run, and inside the 48h lookahead.
const OUTDOOR_AT = hoursFromNow(3);
const INDOOR_AT = hoursFromNow(6);
const DATE = dayKey(OUTDOOR_AT);

const node = (
  title: string,
  startsAt: string,
  indoor: boolean,
  lonLat: [number, number],
): TripNode => ({
  kind: "visit",
  placeId: null,
  lonLat,
  startsAt,
  durationMin: 120,
  indoor,
  meta: { title, urban: true },
});

const header = (title: string): TripDoc["trip"] => ({
  title,
  startsAt: hoursFromNow(-1),
  endsAt: hoursFromNow(48),
  party: { adults: 2 },
  pace: "moderate",
  budget: "€0",
  prefs: { likes: ["hiking"] },
});

const plan = (title: string, outdoorId: string): TripDoc => ({
  trip: header(title),
  nodes: {
    [outdoorId]: node(
      "Narikala fortress",
      OUTDOOR_AT,
      false,
      [44.7217, 41.6879],
    ),
    [randomUUID()]: node(
      "National Museum",
      INDOOR_AT,
      true,
      [44.7999, 41.6977],
    ),
  },
});

/** A verdict the judge would have produced, so stage 6 has something to say. */
const verdict = (oneLine: string, outdoorId: string): Verdict => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 3,
  oneLine,
  evidence: `smoke, taken ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  proposals: [{ move: "shift", nodeId: outdoorId, byMinutes: -120 }],
  confidence: 0.8,
});

const goodDraft: Briefer = USE_MODEL
  ? briefWithGemini
  : async (input) => ({
      greeting: "Dry until mid-afternoon, and one thing worth moving.",
      lines: [
        {
          refs: input.items.map((i) => i.ref),
          title: "Rain over the old town from three",
          detail: "Heaviest between three and five, easing by seven",
        },
      ],
      change: input.items.some((i) => i.hasProposal)
        ? {
            ref: input.items.findIndex((i) => i.hasProposal),
            sentence: "Take the fortress at one instead.",
          }
        : null,
    });

/**
 * The shape the guards exist for: a well-formed draft that quietly writes about
 * the first item and drops the rest. Nothing downstream could tell, which is
 * why `checkDraft` has to.
 */
const losingDraft: Briefer = async () => ({
  greeting: "All fine.",
  lines: [{ refs: [0], title: "Nothing much", detail: "really" }],
  change: null,
});

const sent: { to: string; subject: string }[] = [];
const mail: Mailer = async (message) => {
  sent.push({ to: message.to, subject: message.subject });
  return { sent: true, id: `smoke-${randomUUID()}` };
};

const written: string[] = [];

/**
 * A throwaway account, so the email path is walked rather than skipped. An
 * anonymous trip is briefed in the app and never emailed, which is correct and
 * is exactly why a smoke test that only ever creates one proves nothing about
 * delivery.
 */
const userId = `smoke-${randomUUID()}`;
await db.execute(sql`
  INSERT INTO "user" (id, name, email, email_verified)
  VALUES (${userId}, 'Smoke Traveller', ${`${userId}@example.test`}, false)
`);

type Built = { tripId: string; outdoorId: string };

async function buildTrip(title: string, owned = false): Promise<Built> {
  const outdoorId = randomUUID();
  const doc = plan(title, outdoorId);
  const tripId = await createTrip(doc.trip, owned ? userId : null);
  written.push(tripId);
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
  return { tripId, outdoorId };
}

/**
 * Stand in for stages 1–4. The pipeline's own smoke test is
 * `npm run smoke:watch`; what matters here is that a pair arrives routed to
 * `briefing` with a verdict on it, which is stage 6's only input.
 */
async function routeToBriefing({ tripId, outdoorId }: Built, oneLine: string) {
  const draft = {
    source: "smoke",
    kind: "weather.rain" as const,
    severity: "severe" as const,
    confidence: 0.9,
    validFrom: hoursFromNow(2.5),
    validTo: hoursFromNow(5),
    payload: { metric: "precipitation", unit: "mm/h", peak: 13 },
  };
  await upsertEvent(draft, {
    regionSlug: "tbilisi",
    observedAt: new Date().toISOString(),
    dedupeKey: `${dedupeKey(draft, "tbilisi")}|smoke-${tripId}`,
  });

  await runMatch();

  const routed = await db.execute(sql`
    UPDATE event_match SET
      judged_at = now(),
      route = 'briefing'::event_route,
      route_reason = 'briefing-only-detector',
      verdict = ${JSON.stringify(verdict(oneLine, outdoorId))}::jsonb
    WHERE trip_id = ${tripId} AND judged_at IS NULL
    RETURNING id
  `);
  return routed.rows.length;
}

try {
  // ── 1. A day with news on it, and a composer that behaves.
  const loud = await buildTrip("Briefing smoke · a loud day", true);
  step(
    "pairs routed to briefing",
    await routeToBriefing(loud, "Rain over the fortress from three."),
  );
  step(
    "bundle",
    (await briefingBundle(loud.tripId)).map((i) => ({
      stop: i.nodeTitle,
      at: i.nodeStartsAt,
      kind: i.kind,
      oneLine: i.verdict.oneLine,
    })),
  );

  step("schedule", await scheduleBriefings());

  const drained = await drain({
    handlers: {
      // A no-op judge: `runMatch` above queued the pairs for stage 4, and this
      // script is stage 6's. Leaving them unhandled would fail them and make
      // the drain report meaningless.
      [JUDGE_JOB]: async () => ({ skipped: "not this script's stage" }),
      [BRIEFING_JOB]: async (payload) => {
        const { tripId, date } = payload as { tripId: string; date: string };
        return writeBriefing(tripId, date, {
          brief: goodDraft,
          mail,
          appUrl: "https://example.test",
        });
      },
    },
  });
  step("drain", drained);

  const page = await briefingPage(loud.tripId);
  step("stored briefing", {
    quiet: page?.briefing.quiet,
    dayIndex: page?.briefing.dayIndex,
    greeting: page?.briefing.document.greeting,
    lines: page?.briefing.document.lines,
    change: page?.change,
  });

  // The two marks that stop a morning repeating itself.
  const marks = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM event_match
        WHERE trip_id = ${loud.tripId} AND delivered_at IS NOT NULL) AS delivered,
      (SELECT count(*)::int FROM intervention
        WHERE trip_id = ${loud.tripId} AND channel = 'briefing') AS interventions,
      (SELECT count(*)::int FROM briefing WHERE trip_id = ${loud.tripId}) AS briefings
  `);
  step("delivery marks", marks.rows[0]);
  step(
    "bundle after delivery (must be empty)",
    await briefingBundle(loud.tripId),
  );

  // Idempotent: the store is the claim, so a second run writes nothing.
  step(
    "a second run",
    await writeBriefing(loud.tripId, DATE, { brief: goodDraft, mail }),
  );

  if (page) {
    const email = renderBriefingEmail(page.briefing.document, {
      briefing: `https://example.test/trips/${loud.tripId}/briefing`,
      settings: `https://example.test/trips/${loud.tripId}/watch`,
      pixel: `https://example.test/api/briefings/${page.briefing.id}/opened.gif`,
    });
    step("email", { subject: email.subject, htmlBytes: email.html.length });
    console.log(`\n${email.text}\n`);
  }
  step("mailer", sent);

  // ── 2. A quiet day. No model call, and still a briefing.
  const quiet = await buildTrip("Briefing smoke · a quiet day", true);
  step(
    "quiet day",
    await writeBriefing(quiet.tripId, DATE, {
      brief: async () => {
        throw new Error("the quiet path must not call a model");
      },
      mail,
    }),
  );
  step("quiet briefing", (await briefingPage(quiet.tripId))?.briefing.document);

  // ── 3. A draft the guards refuse. The day still gets its briefing.
  const refused = await buildTrip("Briefing smoke · a refused draft");
  await routeToBriefing(refused, "Rain over the fortress from three.");
  const outcome = await writeBriefing(refused.tripId, DATE, {
    brief: losingDraft,
    mail,
  });
  step("refused draft", outcome);
  step(
    "fallback briefing",
    (await briefingPage(refused.tripId))?.briefing.document.lines,
  );

  // ── 4. The kill-criteria instrument.
  if (page) {
    await db.execute(
      sql`UPDATE briefing SET opened_at = now() WHERE id = ${page.briefing.id}`,
    );
  }
  step("open rate (whole database, 1 day)", await openRate(1));
} finally {
  for (const tripId of written) {
    await db.execute(sql`DELETE FROM intervention WHERE trip_id = ${tripId}`);
    await db.execute(sql`
      DELETE FROM job WHERE kind = ${BRIEFING_JOB}
        AND payload->>'tripId' = ${tripId}
    `);
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
  }
  await db.execute(sql`DELETE FROM "user" WHERE id = ${userId}`);
  console.log("\ncleaned up");
}
