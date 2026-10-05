import { createHash } from "node:crypto";

// The six kill criteria as arithmetic (docs/implementation-plan.md §10), and
// the two other things the Phase 9 dashboard reads: what the model calls cost,
// and which verdicts a person should audit next.
//
// Pure on purpose. A threshold that lives in a SQL query or a React component
// is a threshold that gets argued with on the day the number is bad; here it
// has a test and a name, and was written before there was any data.

export type Band = "continue" | "watch" | "stop" | "insufficient";

// ---------------------------------------------------------------------------
// Bands

export type ProportionCriterion = {
  /** `higher`: more is better (acted on, opens). `lower`: less is better (mutes, false positives). */
  direction: "higher" | "lower";
  /** The line past which the signal says continue. */
  continueAt: number;
  /** The line past which it says stop. */
  stopAt: number;
  /** Below this many observations the answer is `insufficient`, never `stop`. */
  floor: number;
};

export type CountCriterion = {
  continueMin: number;
  continueMax: number;
  stopBelow: number;
  /** Trips needed before a mean per trip means anything. */
  floorTrips: number;
};

export const CRITERIA = {
  actedOn: {
    direction: "higher",
    continueAt: 0.4,
    stopAt: 0.15,
    floor: 20,
  },
  muted: { direction: "lower", continueAt: 0.1, stopAt: 0.25, floor: 20 },
  briefingOpened: {
    direction: "higher",
    continueAt: 0.5,
    stopAt: 0.2,
    floor: 20,
  },
  falsePositive: {
    direction: "lower",
    continueAt: 0.15,
    stopAt: 0.35,
    floor: 30,
  },
  wouldPay: { direction: "higher", continueAt: 0.25, stopAt: 0.08, floor: 20 },
  perTrip: { continueMin: 4, continueMax: 8, stopBelow: 2, floorTrips: 5 },
} as const satisfies Record<string, ProportionCriterion | CountCriterion>;

/** 90% two-sided. */
const Z = 1.645;

/**
 * Wilson score interval for `successes` of `n`. It is used rather than the
 * plain proportion because the samples here are small, and 2 of 3 must not
 * read as a confident 67%. Unlike the normal approximation it stays inside
 * 0..1 and does not collapse to a point at 0 or n.
 */
export function wilson(
  successes: number,
  n: number,
): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

/**
 * `continue` or `stop` only when the whole interval is past the line; an
 * interval that straddles one is `watch`. A sample under the floor is
 * `insufficient`, because "stop" said on six observations is a decision made
 * by noise.
 */
export function bandProportion(
  successes: number,
  n: number,
  c: ProportionCriterion,
): Band {
  if (n < c.floor) return "insufficient";
  const { low, high } = wilson(successes, n);
  if (c.direction === "higher") {
    if (low >= c.continueAt) return "continue";
    if (high < c.stopAt) return "stop";
    return "watch";
  }
  if (high < c.continueAt) return "continue";
  if (low > c.stopAt) return "stop";
  return "watch";
}

/**
 * Interventions per trip. Over the band is `watch` and not `continue`: a judge
 * that finds nine things worth saying about a week is more likely chatty than
 * thorough, and the kill line is only written for the other end.
 */
export function bandCount(
  mean: number,
  trips: number,
  c: CountCriterion,
): Band {
  if (trips < c.floorTrips) return "insufficient";
  if (mean < c.stopBelow) return "stop";
  if (mean >= c.continueMin && mean <= c.continueMax) return "continue";
  return "watch";
}

/** The 4–8 band is stated for a week; a three-day trip cannot meet it unscaled. */
export const perSevenDays = (count: number, days: number): number =>
  days > 0 ? (count * 7) / days : 0;

// ---------------------------------------------------------------------------
// Families

/** `weather.rain` -> `weather`. The unit the audit and graduation work in. */
export const familyOf = (kind: string): string => kind.split(".")[0];

// ---------------------------------------------------------------------------
// The audit queue

/**
 * Orders candidates for hand audit: one from each family in turn, smallest
 * family first, each family's own order fixed by a hash of the match id.
 *
 * Weather is nearly all the verdicts there are, so a queue in arrival order
 * would be all weather and the families that need auditing most — events, and
 * safety above all — would never surface. The hash makes the order the same on
 * every load and independent of input order, so nobody gets a re-roll of a
 * sample they did not like.
 */
export function interleaveByFamily<
  T extends { matchId: string; family: string },
>(candidates: readonly T[]): T[] {
  const rank = (id: string) => createHash("md5").update(id).digest("hex");
  const byFamily = new Map<string, T[]>();
  for (const c of candidates) {
    const list = byFamily.get(c.family) ?? [];
    list.push(c);
    byFamily.set(c.family, list);
  }
  const queues = [...byFamily.entries()]
    .map(([family, list]) => ({
      family,
      list: list.sort((a, b) => rank(a.matchId).localeCompare(rank(b.matchId))),
    }))
    .sort(
      (a, b) =>
        a.list.length - b.list.length || a.family.localeCompare(b.family),
    );

  const out: T[] = [];
  for (let i = 0; out.length < candidates.length; i++) {
    for (const q of queues) if (i < q.list.length) out.push(q.list[i]);
  }
  return out;
}

/** Why a verdict was wrong to send. The reasons say which guard to write next. */
export const AUDIT_REASONS = [
  "not-relevant",
  "wrong-place",
  "already-over",
  "alarmist",
  "other",
] as const;
export type AuditReason = (typeof AUDIT_REASONS)[number];

/** A week on briefing-only, as `INTERRUPT_ELIGIBLE`'s own rule states it. */
export const GRADUATION_DAYS = 7;

/**
 * Whether a family has earned a place in `INTERRUPT_ELIGIBLE`: a week of
 * running, and a false-positive rate whose whole interval is under the
 * continue line. It is a hint beside the numbers and edits nothing — the set is
 * changed by a person, in review, with a reason (src/domain/watch/route.ts).
 * Safety is never ready, whatever its numbers say: `NEVER_INTERRUPT` is a
 * second lock for it, and a dashboard that says "ready" about it would be
 * arguing with that lock.
 */
export function readyToGraduate(input: {
  family: string;
  daysLive: number;
  audited: number;
  wrong: number;
}): boolean {
  if (input.family === "safety") return false;
  return (
    input.daysLive >= GRADUATION_DAYS &&
    bandProportion(input.wrong, input.audited, CRITERIA.falsePositive) ===
      "continue"
  );
}

// ---------------------------------------------------------------------------
// Model spend

/** Every caller of the model, closed so a typo is a type error and not a new row in the report. */
export const MODEL_PURPOSES = [
  "judge",
  "briefing",
  "compose",
  "extract",
  "translate",
  "ask",
  "suggest",
  "road",
] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

export type Usage = {
  inputTokens: number;
  /** A subset of `inputTokens`, billed at the cached rate. */
  cachedInputTokens: number;
  /** Includes reasoning tokens: they are billed as output. */
  outputTokens: number;
  /** Informational only. Already inside `outputTokens`. */
  reasoningTokens?: number;
};

export type Price = {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
};

/**
 * Tokens are stored and dollars are computed here, because prices change and
 * are not ours. A model with no entry has no price: the page shows tokens and
 * says so, which is better than a spend figure that is silently zero.
 *
 * `gpt-5.4-mini` is `null` until its rates are read off OpenAI's pricing page
 * and written in — not guessed.
 */
const PRICES: Record<string, Price | null> = {
  "gpt-5.4-mini": null,
};

export const priceFor = (model: string): Price | null => PRICES[model] ?? null;

export function spendUsd(usage: Usage, price: Price | null): number | null {
  if (!price) return null;
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (fresh * price.inputPerMillion +
      usage.cachedInputTokens * price.cachedInputPerMillion +
      usage.outputTokens * price.outputPerMillion) /
    1_000_000
  );
}
