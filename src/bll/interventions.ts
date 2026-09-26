import {
  checksRun,
  type InterventionRow,
  interventionsFor,
  loadIntervention,
  lockIntervention,
  recordOutcome,
  sweepIgnored,
} from "../dal/interventions.ts";
import { placeNames } from "../dal/places.ts";
import { loadTrip, lockTrip, patchParent } from "../dal/trips.ts";
import { withTransaction } from "../dal/tx.ts";
import { lockWatch, saveWatchSettings } from "../dal/watches.ts";
import { placeIdsOf, type TripDoc } from "../domain/trip/document.ts";
import { at, kindLabel } from "../domain/watch/briefing.ts";
import type { EventKind } from "../domain/watch/event.ts";
import {
  type ChangeRow,
  changeRows,
  eventSummary,
  isMute,
  mayRecord,
  type Offer,
  type Outcome,
  offer as offerSchema,
} from "../domain/watch/interrupt.ts";
import { appendPatchIn, checkOps, docAt } from "./trip-document.ts";

// The traveller's answer to an intervention, and the record of it.
//
// `intervention.outcome` is the product's only defensibility claim: a record of
// which world-changes actually moved someone's plan. So the answer is written
// in the same transaction as the patch it applies — an `accepted` with no
// patch, or a patch with no `accepted`, would each make the table lie — and
// the silence case, `ignored`, is written by a clock rather than left to the
// client, because a denominator made only of answered interventions is the one
// that flatters the product most.

// ---------------------------------------------------------------------------
// The card

export type InterventionCard = {
  id: string;
  tripId: string;
  channel: InterventionRow["channel"];
  sentAt: string | null;
  outcome: Outcome | null;
  outcomeAt: string | null;
  /** Coral for a disruption, periwinkle for the agent finding something better. */
  tone: "alert" | "agent";
  kind: string;
  headline: string;
  /** The briefing's change sentence, when there was one. */
  suggestion: string | null;
  changed: string;
  affects: string;
  /** Source and timestamp. Always shown (context/architecture.md). */
  evidence: string;
  /** The before-and-after of every stop the change touches, or null for none. */
  rows: ChangeRow[] | null;
  /** Why the change cannot be applied as things stand, when it cannot. */
  blocked: string | null;
  /** Whether an answer from the traveller would still be recorded. */
  canAnswer: boolean;
};

export type CardResult =
  | { ok: true; card: InterventionCard }
  | { ok: false; reason: "not-found" | "forbidden" };

/**
 * One intervention, as the card shows it. The diff is computed against the
 * trip as it is now, not as it was when the offer was made: the traveller may
 * have edited the day since, and what they are deciding about is what would
 * happen if they tapped the button today.
 */
export async function interventionCard(
  id: string,
  userId: string,
): Promise<CardResult> {
  const row = await loadIntervention(id);
  if (!row) return { ok: false, reason: "not-found" };
  if (row.userId !== userId) return { ok: false, reason: "forbidden" };

  const offer = readOffer(row.offer);
  const trip = await loadTrip(row.tripId);
  if (!offer || !trip) return { ok: false, reason: "not-found" };

  const node = trip.doc.nodes[offer.nodeId];
  const names = await placeNames(placeIdsOf(trip.doc));
  const affects = node
    ? `${(node.placeId && names.get(node.placeId)) || node.meta.title} · ${at(node.startsAt)}`
    : "A stop that is no longer on your plan";

  let rows: ChangeRow[] | null = null;
  let blocked: string | null = null;

  if (row.outcome === "accepted" && row.patchId) {
    rows = await appliedRows(row.tripId, row.patchId);
  } else if (offer.ops.length > 0) {
    const preview = await checkOps(trip.doc, offer.ops, "intervention");
    if (preview.ok) {
      rows = changeRows(
        trip.doc,
        preview.doc,
        await namesFor(trip.doc, preview.doc),
      );
    } else {
      blocked =
        preview.kind === "violations"
          ? ((preview.blocking[0] ?? preview.violations[0])?.message ??
            "It would no longer fit the day.")
          : "Your plan has changed since, and this no longer applies.";
    }
  }

  return {
    ok: true,
    card: {
      id: row.id,
      tripId: row.tripId,
      channel: row.channel,
      sentAt: row.sentAt,
      outcome: row.outcome,
      outcomeAt: row.outcomeAt,
      tone: offer.impact === "improves" ? "agent" : "alert",
      kind: kindLabel(offer.kind as EventKind),
      headline: offer.oneLine,
      suggestion: offer.sentence ?? null,
      changed: eventSummary(row.event),
      affects,
      evidence: offer.evidence,
      rows,
      blocked,
      canAnswer: mayRecord(row.outcome, "accepted"),
    },
  };
}

/** The change as it was applied, for a card whose answer was yes. */
async function appliedRows(
  tripId: string,
  patchId: string,
): Promise<ChangeRow[] | null> {
  const parentId = await patchParent(tripId, patchId);
  if (!parentId) return null;
  const [before, after] = await Promise.all([
    docAt(tripId, parentId),
    docAt(tripId, patchId),
  ]);
  if (!before || !after) return null;
  return changeRows(before, after, await namesFor(before, after));
}

const namesFor = (...docs: TripDoc[]) =>
  placeNames([...new Set(docs.flatMap(placeIdsOf))]);

/**
 * Offers are stored as JSON and read back through the schema. A row written
 * before offers existed (the first Phase 4 briefings) has none, and is shown
 * as nothing rather than guessed at.
 */
const readOffer = (value: unknown): Offer | null => {
  const parsed = offerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

// ---------------------------------------------------------------------------
// The answer

export const answers = ["accept", "dismiss", "mute"] as const;
export type Answer = (typeof answers)[number];

const OUTCOME: Record<Answer, Outcome> = {
  accept: "accepted",
  dismiss: "dismissed",
  mute: "muted",
};

export type AnswerResult =
  | { ok: true; outcome: Outcome; patchId: string | null }
  | {
      ok: false;
      reason:
        | "not-found"
        | "forbidden"
        | "already-answered"
        | "nothing-to-apply"
        | "no-longer-applies";
    }
  | { ok: false; reason: "would-break-the-day"; messages: string[] };

/**
 * Accept, dismiss or mute — as a unit, and once.
 *
 * Accept appends the offer's patch as an `intervention` author, accepted by
 * this traveller, and records the outcome in the same transaction. The
 * intervention row is locked first, so two taps from two devices cannot both
 * apply it; the trip is locked next, so the patch is written against the head
 * as it stands at that moment rather than one read a request earlier.
 *
 * Mute is the per-intervention half of the mute signal: it records `muted` and
 * turns push off for the trip, stamping `muted_at` the way the settings screen
 * would. "Stop telling me this" that left the next push switched on would be a
 * button that lies.
 */
export async function answerIntervention(
  id: string,
  userId: string,
  answer: Answer,
  now: Date = new Date(),
): Promise<AnswerResult> {
  const outcome = OUTCOME[answer];

  return withTransaction(async (tx): Promise<AnswerResult> => {
    const row = await lockIntervention(tx, id);
    if (!row) return { ok: false, reason: "not-found" };
    if (row.userId !== userId) return { ok: false, reason: "forbidden" };
    if (!mayRecord(row.outcome, outcome)) {
      return { ok: false, reason: "already-answered" };
    }

    if (answer === "mute") {
      const watch = await lockWatch(tx, row.tripId);
      if (watch) {
        const channels = watch.channels.filter((c) => c !== "push");
        await saveWatchSettings(tx, row.tripId, {
          ...watch,
          channels,
          quietHours: watch.quietHours,
          muted: isMute({
            before: watch.channels,
            after: channels,
            now,
            ...watch,
          }),
        });
      }
    }

    if (answer !== "accept") {
      await recordOutcome(tx, id, outcome);
      return { ok: true, outcome, patchId: null };
    }

    const offer = readOffer(row.offer);
    if (!offer || offer.ops.length === 0) {
      return { ok: false, reason: "nothing-to-apply" };
    }

    const locked = await lockTrip(tx, row.tripId);
    if (!locked) return { ok: false, reason: "not-found" };

    const result = await appendPatchIn(tx, {
      tripId: row.tripId,
      parentId: locked.headPatchId,
      intent: (offer.sentence ?? offer.oneLine).slice(0, 200),
      ops: offer.ops,
      author: "intervention",
      acceptedBy: userId,
      meta: { interventionId: id, eventId: row.eventId },
    });
    if (!result.ok) {
      // Nothing was written: the patch refused before it touched a row, and the
      // outcome stays open so the traveller can still dismiss it.
      if (result.code === "violations") {
        return {
          ok: false,
          reason: "would-break-the-day",
          messages: result.blocking.map((v) => v.message),
        };
      }
      return { ok: false, reason: "no-longer-applies" };
    }

    await recordOutcome(tx, id, "accepted", result.patchId);
    return { ok: true, outcome: "accepted", patchId: result.patchId };
  });
}

/** The hourly sweep: silence past expiry becomes `ignored`. */
export async function sweepOutcomes(): Promise<{
  ignored: number;
  ms: number;
}> {
  const started = Date.now();
  const ignored = await sweepIgnored();
  return { ignored, ms: Date.now() - started };
}

// ---------------------------------------------------------------------------
// The trust screen

export type AlertSummary = {
  id: string;
  sentAt: string;
  channel: InterventionRow["channel"];
  tone: "alert" | "agent";
  title: string;
  detail: string;
  outcome: Outcome | null;
};

export type AlertsPage = {
  title: string;
  alerts: AlertSummary[];
  told: number;
  applied: number;
  kept: number;
  checks: number;
};

/**
 * Everything this trip was told, and what came of it. Access is the caller's
 * to check, as with every read model here.
 */
export async function alertsPage(tripId: string): Promise<AlertsPage> {
  const [rows, checks, trip] = await Promise.all([
    interventionsFor(tripId),
    checksRun(tripId),
    loadTrip(tripId),
  ]);

  const alerts = rows.flatMap((row): AlertSummary[] => {
    const offer = readOffer(row.offer);
    if (!offer || !row.sentAt) return [];
    return [
      {
        id: row.id,
        sentAt: row.sentAt,
        channel: row.channel,
        tone: offer.impact === "improves" ? "agent" : "alert",
        title: offer.oneLine,
        detail: eventSummary(row.event),
        outcome: row.outcome,
      },
    ];
  });

  return {
    title: trip?.doc.trip.title ?? "",
    alerts,
    told: alerts.length,
    applied: alerts.filter((a) => a.outcome === "accepted").length,
    kept: alerts.filter((a) => a.outcome === "dismissed").length,
    checks,
  };
}
