import type { PlaceTier } from "../../catalogue/tier.ts";
import { type Rejection, readVerdict, type Verdict } from "../judge.ts";
import { type Routing, route } from "../route.ts";
import type { EvalFixture } from "./fixtures.ts";

// Scoring the corpus. Three numbers, tracked separately on purpose: a change
// that improves one while quietly ruining another is the exact failure the
// harness exists to catch, and a single blended score would hide it.
//
//   relevance   did it fire when it should, and stay quiet when it should?
//   impact      when it fired, did it classify blocks/degrades/improves right?
//   framing     did it offer a choice, or sound an alarm?
//
// The false-positive rate is the one that decides the product. A traveller
// forgives a missed warning; they do not forgive being interrupted for nothing.

/**
 * Words that turn a suggestion into an alarm. The concept's framing rule is
 * prompt-level, so this is how it is measured rather than hoped for.
 */
export const ALARM_WORDS = [
  "warning",
  "alert",
  "danger",
  "dangerous",
  "urgent",
  "beware",
  "caution",
  "emergency",
  "severe weather",
];

export const alarmWordsIn = (text: string): string[] => {
  const lower = text.toLowerCase();
  return ALARM_WORDS.filter((word) => lower.includes(word));
};

export type FixtureResult = {
  id: string;
  band: EvalFixture["expect"]["band"];
  verdict: Verdict | null;
  rejections: Rejection[];
  routing: Routing | null;
  /** Empty when the fixture's expectation was met. */
  failures: string[];
  alarmWords: string[];
};

export type ScoreContext = {
  /** Tiers for the alternatives a fixture offered. */
  tiers: ReadonlyMap<string, PlaceTier>;
};

/**
 * Score one answer against one fixture. An ambiguous fixture asserts only what
 * is indefensible — a `blocks` where nothing is blocked, an alarm word, an
 * invented place — because recording a right answer it does not have would make
 * the corpus measure the fixture author's opinion.
 */
export function scoreFixture(
  fixture: EvalFixture,
  raw: unknown,
  ctx: ScoreContext,
): FixtureResult {
  const read = readVerdict(raw, {
    tiers: ctx.tiers,
    source: fixture.input.event.source,
  });

  const failures: string[] = [];
  const verdict = read.ok ? read.verdict : read.verdict;
  const rejections = read.ok ? [] : read.rejections;

  for (const rejection of rejections) {
    failures.push(`rejected: ${rejection.reason} — ${rejection.detail}`);
  }
  if (!verdict) {
    return {
      id: fixture.id,
      band: fixture.expect.band,
      verdict: null,
      rejections,
      routing: null,
      failures,
      alarmWords: [],
    };
  }

  const { expect } = fixture;
  if (expect.relevant !== undefined && verdict.relevant !== expect.relevant) {
    failures.push(
      `relevant: expected ${expect.relevant}, got ${verdict.relevant}`,
    );
  }
  if (expect.impact?.length && verdict.relevant) {
    if (!expect.impact.includes(verdict.impact)) {
      failures.push(
        `impact: expected one of ${expect.impact.join("/")}, got ${verdict.impact}`,
      );
    }
  }

  // Holds for every band. An ambiguous fixture has no right answer, but it
  // still has wrong ones.
  const alarmWords = alarmWordsIn(verdict.oneLine);
  if (alarmWords.length > 0) {
    failures.push(`alarm framing: ${alarmWords.join(", ")}`);
  }
  if (!verdict.relevant && verdict.proposals.length > 0) {
    failures.push("proposed a change to a trip it said was unaffected");
  }

  const routing = route({
    verdict,
    kind: fixture.input.event.kind,
    eventConfidence: fixture.input.event.confidence,
    ledger: {
      sentSoFar: fixture.input.sent.countSoFar,
      cap: fixture.input.sent.cap,
    },
    watch: { channels: ["push", "briefing"], quietHours: null },
    now: new Date(fixture.now),
    // The corpus measures the judge, so the detector gate that would send
    // everything to the briefing in this phase is lifted here deliberately.
    interruptEligible: new Set([fixture.input.event.kind]),
  });
  if (expect.route && routing.route !== expect.route) {
    failures.push(`route: expected ${expect.route}, got ${routing.route}`);
  }

  return {
    id: fixture.id,
    band: expect.band,
    verdict,
    rejections,
    routing,
    failures,
    alarmWords,
  };
}

export type Summary = {
  total: number;
  passed: number;
  /** Quiet fixtures the judge fired on: the number that decides the product. */
  falsePositives: number;
  falsePositiveRate: number;
  /** Fire fixtures the judge stayed silent on. */
  falseNegatives: number;
  /** Of the fixtures that fired and had an expected impact, how many matched. */
  impactAccuracy: number | null;
  /** Verdicts that used an alarm word. */
  alarmFramed: number;
  /** Verdicts refused by a guard, by reason. */
  rejectionsByReason: Record<string, number>;
  byBand: Record<string, { total: number; passed: number }>;
};

export function summarise(results: readonly FixtureResult[]): Summary {
  const byBand: Summary["byBand"] = {};
  const rejectionsByReason: Record<string, number> = {};

  let passed = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let alarmFramed = 0;
  let impactJudged = 0;
  let impactRight = 0;

  for (const r of results) {
    byBand[r.band] ??= { total: 0, passed: 0 };
    const band = byBand[r.band];
    band.total++;
    if (r.failures.length === 0) {
      passed++;
      band.passed++;
    }
    for (const rejection of r.rejections) {
      rejectionsByReason[rejection.reason] =
        (rejectionsByReason[rejection.reason] ?? 0) + 1;
    }
    if (r.alarmWords.length > 0) alarmFramed++;
    if (r.band === "quiet" && r.verdict?.relevant) falsePositives++;
    if (r.band === "fire" && r.verdict && !r.verdict.relevant) {
      falseNegatives++;
    }
    if (r.band === "fire" && r.verdict?.relevant) {
      impactJudged++;
      if (!r.failures.some((f) => f.startsWith("impact:"))) impactRight++;
    }
  }

  const quiet = byBand.quiet?.total ?? 0;
  return {
    total: results.length,
    passed,
    falsePositives,
    falsePositiveRate: quiet === 0 ? 0 : falsePositives / quiet,
    falseNegatives,
    impactAccuracy: impactJudged === 0 ? null : impactRight / impactJudged,
    alarmFramed,
    rejectionsByReason,
    byBand,
  };
}
