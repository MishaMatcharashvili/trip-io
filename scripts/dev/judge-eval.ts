// Runs the real judge over the thirty fixtures and scores it.
//
//   npm run judge:eval            all thirty
//   npm run judge:eval -- fire    one band only
//   npm run judge:eval -- -v      print every verdict, not just the failures
//
// Run it on every prompt edit and every model change. The three scores move
// independently on purpose: the first time a change that improves rain handling
// quietly makes the model chatty about wind, the relevance score will hold
// steady while the false-positive rate climbs, and that is the whole point.
//
// Needs OPENAI_API_KEY. Costs one model call per fixture.

import type { PlaceTier } from "../../src/domain/catalogue/tier.ts";
import {
  type Band,
  byBand,
  type EvalFixture,
  fixtures,
} from "../../src/domain/watch/eval/fixtures.ts";
import {
  type FixtureResult,
  scoreFixture,
  summarise,
} from "../../src/domain/watch/eval/score.ts";
import { MODEL } from "../../src/infra/openai.ts";
import { judgeWithOpenAI } from "../../src/infra/openai-judge.ts";

const args = process.argv.slice(2);
const verbose = args.includes("-v") || args.includes("--verbose");
const band = args.find((a): a is Band =>
  ["fire", "quiet", "ambiguous"].includes(a),
);

const corpus = band ? byBand(band) : fixtures;

/**
 * The alternatives a fixture offers are treated as `verified`, which is the
 * lowest tier the judge may name. A fixture that passes here would pass against
 * the catalogue.
 */
const tiersFor = (fixture: EvalFixture) =>
  new Map<string, PlaceTier>(
    fixture.input.alternatives.map((a) => [a.placeId, "verified" as PlaceTier]),
  );

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

console.log(`judging ${corpus.length} fixtures with ${MODEL}\n`);

const results: FixtureResult[] = [];
for (const fixture of corpus) {
  let result: FixtureResult;
  try {
    const raw = await judgeWithOpenAI(fixture.input);
    result = scoreFixture(fixture, raw, { tiers: tiersFor(fixture) });
  } catch (error) {
    result = {
      id: fixture.id,
      band: fixture.expect.band,
      verdict: null,
      rejections: [],
      routing: null,
      failures: [`call failed: ${(error as Error).message}`],
      alarmWords: [],
    };
  }
  results.push(result);

  const mark = result.failures.length === 0 ? "ok  " : "FAIL";
  console.log(`${mark} ${result.id}`);
  if (verbose && result.verdict) {
    console.log(`     ${result.verdict.impact} · ${result.verdict.oneLine}`);
    console.log(`     ${result.verdict.evidence}`);
    if (result.routing) {
      console.log(`     → ${result.routing.route} (${result.routing.reason})`);
    }
  }
  for (const failure of result.failures) console.log(`     ${failure}`);
}

const summary = summarise(results);

console.log(`\n── scores`);
console.log(`passed              ${summary.passed}/${summary.total}`);
console.log(
  `false positives     ${summary.falsePositives} (${pct(summary.falsePositiveRate)})` +
    `  — kill criteria: continue below 15%, stop above 35%`,
);
console.log(`false negatives     ${summary.falseNegatives}`);
console.log(
  `impact accuracy     ${
    summary.impactAccuracy === null ? "—" : pct(summary.impactAccuracy)
  }`,
);
console.log(`alarm framing       ${summary.alarmFramed}`);

if (Object.keys(summary.rejectionsByReason).length > 0) {
  console.log(`\n── verdicts refused by a guard`);
  for (const [reason, count] of Object.entries(summary.rejectionsByReason)) {
    console.log(`${reason.padEnd(20)} ${count}`);
  }
}

console.log(`\n── by band`);
for (const [name, score] of Object.entries(summary.byBand)) {
  console.log(`${name.padEnd(10)} ${score.passed}/${score.total}`);
}

// A non-zero exit makes this usable as a gate later, once there is a baseline
// worth gating on. There isn't yet — the first run is the baseline.
if (summary.falsePositiveRate > 0.35) {
  console.log(`\nfalse-positive rate above the stop line`);
  process.exit(1);
}
