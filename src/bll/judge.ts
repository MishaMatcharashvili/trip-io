import {
  loadDay,
  loadPair,
  nearbyAlternatives,
  recordVerdict,
} from "../dal/matches.ts";
import { placeFacts } from "../dal/places.ts";
import { loadWatch, spentBudget } from "../dal/watches.ts";
import type { PlaceTier } from "../domain/catalogue/tier.ts";
import {
  type Judge,
  type JudgeInput,
  type Rejection,
  readVerdict,
  type Verdict,
} from "../domain/watch/judge.ts";
import { placeIdsInProposals } from "../domain/watch/proposal.ts";
import { type Route, type RouteReason, route } from "../domain/watch/route.ts";
import { DEFAULT_QUIET_HOURS } from "../domain/watch/settings.ts";
import { judgeWithGemini } from "../infra/gemini-judge.ts";

// Stages 4 and 5, in the order they happen: assemble the pair, ask the model,
// refuse the answer if it breaks a guard, route what survives, write all of it
// down — including the drops and the refusals.
//
// Phase 3 delivers nothing. A verdict lands in `event_match` and is read by
// hand, which is the point: the system gets to be watched for a week before it
// is allowed to speak.

/**
 * How far the judge may look for a replacement. Wide enough to reach the next
 * village in the mountains, narrow enough that the alternatives are somewhere
 * the traveller can actually get to before the stop it replaces.
 */
export const ALTERNATIVE_RADIUS_M = 15_000;
export const ALTERNATIVE_LIMIT = 12;

export type JudgeOutcome =
  | {
      ok: true;
      matchId: string;
      route: Route;
      reason: RouteReason | "rejected";
      verdict: Verdict | null;
      rejections: Rejection[];
    }
  | { ok: false; matchId: string; reason: "gone" | "already-judged" };

export type JudgeDeps = {
  judge?: Judge;
  now?: () => Date;
};

export async function judgeMatch(
  matchId: string,
  deps: JudgeDeps = {},
): Promise<JudgeOutcome> {
  const pair = await loadPair(matchId);
  if (!pair) return { ok: false, matchId, reason: "gone" };
  // A duplicate job, or a drain that overlapped itself. Judging again would be
  // the one mistake in this pipeline that costs money.
  if (pair.judgedAt) return { ok: false, matchId, reason: "already-judged" };

  const [day, alternatives, watch, sentSoFar] = await Promise.all([
    loadDay(pair.trip.id, pair.node.startsAt),
    nearbyAlternatives(
      pair.node.lonLat,
      ALTERNATIVE_RADIUS_M,
      ALTERNATIVE_LIMIT,
    ),
    loadWatch(pair.trip.id),
    spentBudget(pair.trip.id),
  ]);

  const cap = watch?.cap ?? 0;
  const input: JudgeInput = {
    event: {
      kind: pair.event.kind,
      severity: pair.event.severity as JudgeInput["event"]["severity"],
      confidence: pair.event.confidence,
      validFrom: pair.event.validFrom,
      validTo: pair.event.validTo ?? pair.event.validFrom,
      source: pair.event.source,
      observedAt: pair.event.observedAt,
      payload: pair.event.payload,
    },
    node: {
      id: pair.node.id,
      kind: pair.node.kind as JudgeInput["node"]["kind"],
      title: (pair.node.meta.title as string) ?? "",
      placeName: pair.node.placeName,
      startsAt: pair.node.startsAt,
      durationMin: pair.node.durationMin,
      indoor: pair.node.indoor,
      corridorSlug: pair.node.meta.corridorSlug as string | undefined,
    },
    trip: {
      party: pair.trip.party,
      pace: pair.trip.pace as JudgeInput["trip"]["pace"],
      prefs: pair.trip.prefs,
      day: day.map((n) => ({
        id: n.id,
        title: n.title,
        startsAt: n.startsAt,
        durationMin: n.durationMin,
        indoor: n.indoor,
      })),
    },
    alternatives,
    sent: { countSoFar: sentSoFar, cap, lastSentAt: null },
  };

  // A provider failure is not a verdict, so it throws and the job retries —
  // with the queue's backoff, and its give-up at `MAX_ATTEMPTS`. The claim on
  // the pair is deliberately kept: the retry re-runs this function, which never
  // looks at `queued_at`, and releasing it would let the next matcher run post
  // a second job for the same pair while the first is still retrying. During
  // an outage that multiplies the jobs every run and means a pair is never
  // given up on. A pair whose job does give up stays queued and unjudged,
  // which is the record of what the pipeline could not do.
  const raw = await (deps.judge ?? judgeWithGemini)(input);

  // Tiers are read from the catalogue, not from the list handed to the model:
  // the guard has to be able to catch an id the model took from somewhere else
  // in its input, which is exactly the case a list-membership check misses.
  const proposed = proposedPlaceIds(raw);
  const facts = await placeFacts(proposed);
  const tiers = new Map<string, PlaceTier>(
    [...facts].map(([id, info]) => [id, info.tier]),
  );

  const read = readVerdict(raw, { tiers, source: pair.event.source });
  if (!read.ok) {
    await recordVerdict(matchId, {
      verdict: read.verdict,
      route: "drop",
      reason: "rejected",
      rejections: read.rejections,
    });
    return {
      ok: true,
      matchId,
      route: "drop",
      reason: "rejected",
      verdict: read.verdict,
      rejections: read.rejections,
    };
  }

  const routing = route({
    verdict: read.verdict,
    kind: pair.event.kind,
    eventConfidence: pair.event.confidence,
    ledger: { sentSoFar, cap },
    watch: {
      channels: watch?.channels ?? [],
      quietHours: watch?.quietHours ?? DEFAULT_QUIET_HOURS,
    },
    now: deps.now?.() ?? new Date(),
  });

  await recordVerdict(matchId, {
    verdict: read.verdict,
    route: routing.route,
    reason: routing.reason,
    rejections: [],
  });

  return {
    ok: true,
    matchId,
    route: routing.route,
    reason: routing.reason,
    verdict: read.verdict,
    rejections: [],
  };
}

/** Place ids a raw model answer would introduce, before it has been trusted. */
function proposedPlaceIds(raw: unknown): string[] {
  const proposals = (raw as { proposals?: unknown })?.proposals;
  if (!Array.isArray(proposals)) return [];
  return placeIdsInProposals(
    proposals.filter(
      (
        p,
      ): p is {
        move: "swap";
        placeId: string;
        nodeId: string;
        indoor: boolean;
      } =>
        typeof p === "object" &&
        p !== null &&
        (p as { move?: unknown }).move === "swap" &&
        typeof (p as { placeId?: unknown }).placeId === "string",
    ),
  );
}
