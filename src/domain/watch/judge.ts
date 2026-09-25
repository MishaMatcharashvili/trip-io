import { z } from "zod";
import type { PlaceTier } from "../catalogue/tier.ts";
import type { NodeKind, Pace } from "../trip/document.ts";
import type { EventKind, Severity } from "./event.ts";
import { type Proposal, placeIdsInProposals, proposal } from "./proposal.ts";

// Stage 4: the only model call in the pipeline, and the only one that runs per
// matched pair rather than per region. Everything expensive about the product
// is downstream of this file being right.
//
// The guards below are validators, not prompt instructions. A prompt asks; a
// validator refuses. `docs/implementation-plan.md` §7 lists four, and each one
// exists because of a specific failure mode a model reliably has:
//
//   relevant + impact "none"   the shape it produces when it wants to be
//                              helpful and has nothing to say
//   an unknown place_id        the shape it produces when the right answer
//                              isn't in the candidates it was given
//   evidence without a source  a claim the traveller cannot check
//   a confident interrupt      see route.ts, which enforces the fourth
//
// A rejected verdict is logged with its reason, never silently dropped:
// rejection-reason frequency is the earliest signal that a prompt edit went
// wrong.

export const impacts = ["blocks", "degrades", "improves", "none"] as const;
export type Impact = (typeof impacts)[number];

export const verdict = z.object({
  relevant: z.boolean(),
  impact: z.enum(impacts),
  /** Hours until the traveller would have to act. The router's interrupt test. */
  horizonHrs: z
    .number()
    .min(0)
    .max(24 * 14),
  /** What the traveller reads. One sentence, framed as a choice, not an alarm. */
  oneLine: z.string().min(1).max(240),
  /** Source and timestamp, always shown beside the one-liner. */
  evidence: z.string().min(1).max(240),
  /** The coherent-day proposal, accepted or rejected as a unit. May be empty. */
  proposals: z.array(proposal).max(20),
  confidence: z.number().min(0).max(1),
});
export type Verdict = z.infer<typeof verdict>;

/** What the judge is shown. Nothing else about the trip reaches the model. */
export type JudgeInput = {
  event: {
    kind: EventKind;
    severity: Severity;
    confidence: number;
    validFrom: string;
    validTo: string;
    source: string;
    observedAt: string;
    payload: Record<string, unknown>;
  };
  node: {
    id: string;
    kind: NodeKind;
    title: string;
    placeName: string | null;
    startsAt: string;
    durationMin: number;
    indoor: boolean;
    /** Set on transfers along one of the 12 curated corridors. */
    corridorSlug?: string;
  };
  trip: {
    party: Record<string, unknown>;
    pace: Pace;
    prefs: Record<string, unknown>;
    /** The rest of that day, so a proposal can be coherent rather than local. */
    day: {
      id: string;
      title: string;
      startsAt: string;
      durationMin: number;
      indoor: boolean;
    }[];
  };
  /** Alternatives the judge may propose. Nothing outside this list is allowed. */
  alternatives: {
    placeId: string;
    name: string;
    category: string;
    indoor: boolean;
    distanceM: number;
  }[];
  sent: { countSoFar: number; cap: number; lastSentAt: string | null };
};

/**
 * The port. `src/infra/openai-judge.ts` is the only implementation, and it
 * returns whatever the model said: the guards below are what turn that into a
 * verdict, so a rejection is recorded with its reason rather than thrown.
 */
export type Judge = (input: JudgeInput) => Promise<unknown>;

export const rejectionReasons = [
  "malformed",
  "empty-helpful",
  "unknown-place",
  "place-tier",
  "evidence-missing",
  "evidence-undated",
  "evidence-unsourced",
] as const;
export type RejectionReason = (typeof rejectionReasons)[number];

export type Rejection = { reason: RejectionReason; detail: string };

/** Tiers an intervention may name, per the catalogue's own rule. */
export const JUDGE_TIERS: readonly PlaceTier[] = ["curated", "verified"];

export type VerdictContext = {
  /** Every place id the ops mention, with the tier it actually has. */
  tiers: ReadonlyMap<string, PlaceTier>;
  /** The event's source, which the evidence line has to name. */
  source: string;
};

// A date (2026-10-04), or a clock time (14:00). Either pins the claim to a
// moment; neither can be produced by a model that is guessing generically.
const DATED = /\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b/;

/**
 * The guards, in one place. Returns every reason a verdict fails rather than
 * the first: when a prompt change breaks two things at once, one rejection
 * reason in the log would hide the other.
 */
export function checkVerdict(value: Verdict, ctx: VerdictContext): Rejection[] {
  const rejections: Rejection[] = [];

  if (value.relevant && value.impact === "none") {
    rejections.push({
      reason: "empty-helpful",
      detail: "relevant with no impact — the helpful-but-empty shape",
    });
  }

  for (const placeId of placeIdsInProposals(value.proposals as Proposal[])) {
    const tier = ctx.tiers.get(placeId);
    if (!tier) {
      rejections.push({
        reason: "unknown-place",
        detail: `${placeId} is not in the catalogue`,
      });
    } else if (!JUDGE_TIERS.includes(tier)) {
      rejections.push({
        reason: "place-tier",
        detail: `${placeId} is ${tier}; an intervention may name ${JUDGE_TIERS.join(" or ")}`,
      });
    }
  }

  const evidence = value.evidence.trim();
  if (evidence.length === 0) {
    rejections.push({
      reason: "evidence-missing",
      detail: "evidence is empty",
    });
  } else {
    if (!DATED.test(evidence)) {
      rejections.push({
        reason: "evidence-undated",
        detail: "evidence carries no date or time",
      });
    }
    if (!evidence.toLowerCase().includes(ctx.source.toLowerCase())) {
      rejections.push({
        reason: "evidence-unsourced",
        detail: `evidence does not name ${ctx.source}`,
      });
    }
  }

  return rejections;
}

export type JudgeResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; rejections: Rejection[]; verdict: Verdict | null };

/**
 * Decode and check in one step: what the pipeline calls, and the only way a
 * verdict is allowed to reach the router.
 */
export function readVerdict(raw: unknown, ctx: VerdictContext): JudgeResult {
  const parsed = verdict.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      verdict: null,
      rejections: [
        {
          reason: "malformed",
          detail: parsed.error.issues
            .map((i) => `${i.path.join("/")}: ${i.message}`)
            .join("; "),
        },
      ],
    };
  }

  const rejections = checkVerdict(parsed.data, ctx);
  return rejections.length > 0
    ? { ok: false, verdict: parsed.data, rejections }
    : { ok: true, verdict: parsed.data };
}
