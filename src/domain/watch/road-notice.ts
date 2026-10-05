import { z } from "zod";
import { corridors } from "../catalogue/corridors.ts";
import { quoteIsInSource } from "./extraction.ts";
import { htmlToText } from "./feed.ts";
import type { RoadCondition } from "./road.ts";

// The Roads Department's own notices (api.georoad.gov.ge, the feed behind
// georoad.ge/restrictions), read by a model — the road-automation spike.
//
// The question Phase 8 asks is whether automation can reproduce what an
// operator would enter by hand on the twelve corridors. The department already
// publishes the facts: a title, a body, a dated status (restricted, restored,
// partial). What a model adds is only the part a person does by eye — which of
// the twelve roads is this, and is it shut or merely restricted — and both can
// be checked: the corridor against a hand-labelled set, and the condition
// against the department's own status code. A claim that contradicts the
// status ("restored" read as a closure) is refused outright.

/** georoad's `restriction_status`, as the API sends it (a string). */
export const noticeStatuses = {
  "1": "restriction",
  "2": "restored",
  "3": "partial",
} as const;
export type NoticeStatus = (typeof noticeStatuses)[keyof typeof noticeStatuses];

export type RoadNotice = {
  id: number;
  slug: string;
  publishedAt: string;
  status: NoticeStatus;
  /** Georgian, as published. */
  title: string;
  /** Georgian plain text. */
  body: string;
};

const apiNotice = z.object({
  id: z.number(),
  slug: z.string(),
  publish_date: z.string(),
  restriction_status: z.string(),
  translates: z
    .array(
      z.object({
        language: z.string(),
        title: z.string(),
        content: z.string().nullable(),
      }),
    )
    .min(1),
});

/** Pure: the API's JSON page to notices. A row that does not parse is skipped. */
export function parseNotices(json: unknown): RoadNotice[] {
  const rows = (json as { items?: { data?: unknown[] } })?.items?.data ?? [];
  return rows.flatMap((row) => {
    const parsed = apiNotice.safeParse(row);
    if (!parsed.success) return [];
    const n = parsed.data;
    const status =
      noticeStatuses[n.restriction_status as keyof typeof noticeStatuses];
    const text =
      n.translates.find((t) => t.language === "ka") ?? n.translates[0];
    const published = Date.parse(`${n.publish_date.replace(" ", "T")}+04:00`);
    if (!status || Number.isNaN(published)) return [];
    return [
      {
        id: n.id,
        slug: n.slug,
        publishedAt: new Date(published).toISOString(),
        status,
        title: text.title.trim(),
        body: htmlToText(text.content ?? ""),
      },
    ];
  });
}

/** What the model reads. The title leads; the status is stated, not guessed. */
export const noticeText = (n: RoadNotice): string =>
  `${n.title}\n\n${n.body}`.trim();

export const noticeUrl = (n: RoadNotice): string =>
  `https://georoad.ge/ka/restriction/${n.slug}`;

// ---------------------------------------------------------------------------
// The model's answer

export const corridorSlugs = corridors.map((c) => c.slug) as [
  string,
  ...string[],
];

export const claimConditions = [
  "closed",
  "restricted",
  "delays",
  "reopened",
  "none",
] as const;

export const roadClaim = z.object({
  /** One of the twelve, or null when the road is not one of them. */
  corridor: z.string().nullable(),
  /** `none` when the notice is not about the road at all (a water-supply notice). */
  condition: z.enum(claimConditions),
  /** The sentence the claim rests on, copied exactly. */
  // A sentence in Georgian is long; the cap is only against a model pasting the
  // whole notice back.
  quote: z.string().max(1000),
});
export type RoadClaim = z.infer<typeof roadClaim>;

export type ClaimRejection =
  | "malformed"
  | "quote-not-in-source"
  | "unknown-corridor"
  | "contradicts-status";

export type VettedClaim = {
  corridor: string | null;
  /** `reopened` when the department says it is restored; otherwise the model's. */
  condition: RoadCondition | "none";
};

/**
 * Two readings of the same notice must agree: the department's status code and
 * the model's reading of the prose. Where they do not, the claim is refused and
 * the notice goes to a person, because one of them is wrong and a wrong
 * "reopened" ends real events. The first run of this spike found the department
 * itself coding a notice "restored" whose text says trailers *will be*
 * restricted (notice 5244), so neither signal is trusted over the other.
 */
export function vetRoadClaim(
  raw: unknown,
  ctx: { text: string; status: NoticeStatus },
): { ok: true; claim: VettedClaim } | { ok: false; reason: ClaimRejection } {
  const parsed = roadClaim.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  const c = parsed.data;

  if (c.condition !== "none" && !quoteIsInSource(c.quote, ctx.text)) {
    return { ok: false, reason: "quote-not-in-source" };
  }
  if (c.corridor !== null && !corridorSlugs.includes(c.corridor)) {
    return { ok: false, reason: "unknown-corridor" };
  }
  if (c.condition === "none") {
    return { ok: true, claim: { corridor: c.corridor, condition: "none" } };
  }
  if ((ctx.status === "restored") !== (c.condition === "reopened")) {
    return { ok: false, reason: "contradicts-status" };
  }
  if (ctx.status === "restriction" && c.condition === "delays") {
    return { ok: false, reason: "contradicts-status" };
  }
  if (ctx.status === "partial" && c.condition === "closed") {
    return { ok: false, reason: "contradicts-status" };
  }
  return { ok: true, claim: { corridor: c.corridor, condition: c.condition } };
}

// ---------------------------------------------------------------------------
// Scoring against a hand-labelled set

export type GoldLabel = {
  id: number;
  /** Acceptable corridors for the notice; `null` means "none of the twelve". */
  corridor: readonly (string | null)[];
  /** Null when the notice is not about a road and no claim is the right answer. */
  condition: RoadCondition | "none";
};

export type Prediction = {
  id: number;
  /** Null when the claim was refused or the model never answered. */
  claim: VettedClaim | null;
  rejection?: ClaimRejection;
};

export type SpikeScore = {
  total: number;
  corridorCorrect: number;
  /** Notices whose condition is graded: the ones on a corridor. */
  conditionScored: number;
  conditionCorrect: number;
  /** Notices that reach one of the twelve roads, by the gold set. */
  onCorridor: number;
  /** Of those, the corridor found. */
  recalled: number;
  /** Of the claims put on a corridor, the ones the gold set agrees with. */
  claimedOnCorridor: number;
  claimedCorrectly: number;
  rejected: number;
  misses: { id: number; want: GoldLabel; got: Prediction }[];
};

export function scoreSpike(
  gold: readonly GoldLabel[],
  predictions: readonly Prediction[],
): SpikeScore {
  const byId = new Map(predictions.map((p) => [p.id, p]));
  const score: SpikeScore = {
    total: gold.length,
    corridorCorrect: 0,
    conditionScored: 0,
    conditionCorrect: 0,
    onCorridor: 0,
    recalled: 0,
    claimedOnCorridor: 0,
    claimedCorrectly: 0,
    rejected: 0,
    misses: [],
  };

  for (const want of gold) {
    const got = byId.get(want.id) ?? { id: want.id, claim: null };
    const wantsRoad = want.corridor.some((c) => c !== null);
    if (wantsRoad) score.onCorridor++;
    if (!got.claim) score.rejected++;

    const corridorOk = got.claim
      ? want.corridor.includes(got.claim.corridor)
      : false;
    const conditionOk = got.claim
      ? got.claim.condition === want.condition
      : false;

    if (got.claim?.corridor != null) {
      score.claimedOnCorridor++;
      if (corridorOk) score.claimedCorrectly++;
    }
    if (wantsRoad && corridorOk) score.recalled++;
    if (corridorOk) score.corridorCorrect++;
    // The condition only matters where an event would be written, on a corridor.
    // A wrong condition on a road we do not watch changes nothing, so counting
    // it would grade the model on something that can never reach a traveller.
    if (wantsRoad) score.conditionScored++;
    if (wantsRoad && conditionOk) score.conditionCorrect++;
    if (!corridorOk || (wantsRoad && !conditionOk)) {
      score.misses.push({ id: want.id, want, got });
    }
  }
  return score;
}

/**
 * Fixed before the data was read, so the result cannot be argued into place.
 * Corridor placement is what decides whether an event lands on the right
 * trips, so it carries the gate; a wrong condition on the right road is
 * tolerable in a briefing-only detector and is reported, not gated.
 */
export const DECISION = {
  minLabelled: 20,
  minRecall: 0.8,
  minPrecision: 0.9,
  minConditionAccuracy: 0.8,
} as const;

export type Verdict =
  | { decision: "insufficient-data"; why: string }
  | { decision: "automate"; why: string }
  | { decision: "stay-manual"; why: string };

export function decide(score: SpikeScore): Verdict {
  if (score.total < DECISION.minLabelled) {
    return {
      decision: "insufficient-data",
      why: `${score.total} labelled notices; the rule needs ${DECISION.minLabelled}.`,
    };
  }
  const recall = score.onCorridor ? score.recalled / score.onCorridor : 1;
  const precision = score.claimedOnCorridor
    ? score.claimedCorrectly / score.claimedOnCorridor
    : 1;
  const condition = score.conditionScored
    ? score.conditionCorrect / score.conditionScored
    : 1;
  const failing: string[] = [];
  if (recall < DECISION.minRecall)
    failing.push(`recall ${pct(recall)} < ${pct(DECISION.minRecall)}`);
  if (precision < DECISION.minPrecision)
    failing.push(`precision ${pct(precision)} < ${pct(DECISION.minPrecision)}`);
  if (condition < DECISION.minConditionAccuracy)
    failing.push(
      `condition ${pct(condition)} < ${pct(DECISION.minConditionAccuracy)}`,
    );
  return failing.length === 0
    ? {
        decision: "automate",
        why: `recall ${pct(recall)}, precision ${pct(precision)}, condition ${pct(condition)}`,
      }
    : { decision: "stay-manual", why: failing.join("; ") };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------------------
// From a vetted claim to something an operator can approve

/** Who a proposal is "from" in the queue, and in the ids that keep it unique. */
export const NOTICE_REPORTER_NAME = "Roads Department notice";
export const noticeReporterId = (n: Pick<RoadNotice, "id">): string =>
  `georoad:${n.id}`;
export const isNoticeReporter = (reporterId: string): boolean =>
  reporterId.startsWith("georoad:");

/**
 * How long a proposal stays worth approving, and so how long the event lives if
 * it is. The longest window the manual form offers: the notice rarely says
 * when a restriction ends, and a later "restored" notice, once approved, ends
 * it sooner. A reopening needs no window — it ends events, it does not start one.
 */
export const PROPOSAL_HOURS = 72;

export type Proposal = {
  corridorSlug: string;
  condition: RoadCondition;
  validFrom: string;
  validTo: string;
};

/**
 * Only a claim that lands on a corridor and says something about traffic is
 * worth an operator's tap; everything else (a road we do not watch, a water
 * supply notice) is stored and left alone.
 */
export function proposalFor(
  claim: VettedClaim,
  notice: Pick<RoadNotice, "publishedAt">,
): Proposal | null {
  if (claim.corridor === null || claim.condition === "none") return null;
  const from = Date.parse(notice.publishedAt);
  return {
    corridorSlug: claim.corridor,
    condition: claim.condition,
    validFrom: new Date(from).toISOString(),
    validTo: new Date(from + PROPOSAL_HOURS * 3_600_000).toISOString(),
  };
}
