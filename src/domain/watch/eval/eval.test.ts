import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PlaceTier } from "../../catalogue/tier.ts";
import type { Verdict } from "../judge.ts";
import { byBand, type EvalFixture, fixtures } from "./fixtures.ts";
import { alarmWordsIn, scoreFixture, summarise } from "./score.ts";

// The corpus, and the scorer that reads it. The scorer is tested against
// answers written here rather than a model's, because a harness that only runs
// when a key is set is a harness nobody runs.

const tiers = (fixture: EvalFixture) =>
  new Map<string, PlaceTier>(
    fixture.input.alternatives.map((a) => [a.placeId, "verified" as PlaceTier]),
  );

const answer = (
  fixture: EvalFixture,
  over: Partial<Verdict> = {},
): Verdict => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 2,
  oneLine:
    "The trail will be slick until two — the monastery reads well in rain.",
  evidence: `open-meteo forecast, taken ${fixture.input.event.observedAt}`,
  proposals: [],
  confidence: 0.85,
  ...over,
});

describe("the corpus", () => {
  test("is thirty fixtures, ten of each band", () => {
    assert.equal(fixtures.length, 30);
    assert.equal(byBand("fire").length, 10);
    assert.equal(byBand("quiet").length, 10);
    assert.equal(byBand("ambiguous").length, 10);
  });

  test("every fixture is named once", () => {
    assert.equal(new Set(fixtures.map((f) => f.id)).size, fixtures.length);
  });

  test("every fixture records why it expects what it expects", () => {
    // Especially the ambiguous ten, where the reasoning is the expectation.
    for (const f of fixtures) {
      assert.ok(f.expect.why.length > 40, `${f.id} has no reasoning recorded`);
    }
  });

  test("the definite bands assert relevance; the ambiguous band does not", () => {
    for (const f of byBand("fire")) assert.equal(f.expect.relevant, true);
    for (const f of byBand("quiet")) assert.equal(f.expect.relevant, false);
    for (const f of byBand("ambiguous")) {
      assert.equal(f.expect.relevant, undefined, `${f.id} pretends to be easy`);
    }
  });

  test("every alternative is a distinct catalogue id", () => {
    const ids = fixtures.flatMap((f) =>
      f.input.alternatives.map((a) => a.placeId),
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  test("the event always overlaps the stop it is matched against", () => {
    // Otherwise the match query would never have produced the pair, and the
    // fixture would be testing a situation the system cannot reach.
    for (const f of fixtures) {
      const nodeFrom = Date.parse(f.input.node.startsAt);
      const nodeTo = nodeFrom + f.input.node.durationMin * 60_000;
      assert.ok(
        Date.parse(f.input.event.validFrom) < nodeTo &&
          Date.parse(f.input.event.validTo) > nodeFrom,
        `${f.id}: event and stop do not overlap`,
      );
    }
  });
});

describe("scoring an answer", () => {
  const fire = byBand("fire")[0];
  const quietOne = byBand("quiet")[0];
  const ambiguousOne = byBand("ambiguous")[0];

  test("a good answer to a fire fixture passes", () => {
    const result = scoreFixture(fire, answer(fire), { tiers: tiers(fire) });
    assert.deepEqual(result.failures, []);
  });

  test("silence on a fire fixture is a false negative", () => {
    const result = scoreFixture(
      fire,
      answer(fire, { relevant: false, impact: "none" }),
      { tiers: tiers(fire) },
    );
    assert.ok(result.failures.some((f) => f.startsWith("relevant:")));
    assert.equal(summarise([result]).falseNegatives, 1);
  });

  test("firing on a quiet fixture is the false positive that decides the product", () => {
    const result = scoreFixture(quietOne, answer(quietOne), {
      tiers: tiers(quietOne),
    });
    const summary = summarise([result]);
    assert.equal(summary.falsePositives, 1);
    assert.equal(summary.falsePositiveRate, 1);
  });

  test("the wrong impact is counted apart from the wrong relevance", () => {
    const result = scoreFixture(fire, answer(fire, { impact: "improves" }), {
      tiers: tiers(fire),
    });
    assert.ok(result.failures.some((f) => f.startsWith("impact:")));
    assert.equal(summarise([result]).impactAccuracy, 0);
  });

  test("an alarm word fails a fixture of any band", () => {
    const alarming = answer(ambiguousOne, {
      oneLine: "WARNING: dangerous rain expected at your lunch stop.",
    });
    const result = scoreFixture(ambiguousOne, alarming, {
      tiers: tiers(ambiguousOne),
    });
    assert.deepEqual(result.alarmWords.sort(), [
      "danger",
      "dangerous",
      "warning",
    ]);
    assert.ok(result.failures.some((f) => f.startsWith("alarm framing:")));
  });

  test("an ambiguous fixture accepts either reading of relevance", () => {
    for (const relevant of [true, false]) {
      const result = scoreFixture(
        ambiguousOne,
        answer(ambiguousOne, {
          relevant,
          impact: relevant ? "degrades" : "none",
        }),
        { tiers: tiers(ambiguousOne) },
      );
      assert.deepEqual(result.failures, [], `relevant: ${relevant}`);
    }
  });

  test("proposing a change to a trip it called unaffected is always wrong", () => {
    const result = scoreFixture(
      quietOne,
      answer(quietOne, {
        relevant: false,
        impact: "none",
        proposals: [{ move: "drop", nodeId: quietOne.input.node.id }],
      }),
      { tiers: tiers(quietOne) },
    );
    assert.ok(
      result.failures.includes(
        "proposed a change to a trip it said was unaffected",
      ),
    );
  });

  test("a guard rejection is carried into the score with its reason", () => {
    const result = scoreFixture(
      fire,
      answer(fire, { evidence: "it will rain" }),
      { tiers: tiers(fire) },
    );
    const summary = summarise([result]);
    assert.equal(summary.rejectionsByReason["evidence-undated"], 1);
    assert.equal(summary.rejectionsByReason["evidence-unsourced"], 1);
    assert.equal(summary.passed, 0);
  });

  test("an invented place is caught even when the sentence is perfect", () => {
    const result = scoreFixture(
      fire,
      answer(fire, {
        proposals: [
          {
            move: "swap",
            nodeId: fire.input.node.id,
            placeId: "99999999-9999-4999-8999-999999999999",
            indoor: true,
          },
        ],
      }),
      { tiers: tiers(fire) },
    );
    assert.equal(summarise([result]).rejectionsByReason["unknown-place"], 1);
  });

  test("a summary counts each band separately", () => {
    const results = [
      scoreFixture(fire, answer(fire), { tiers: tiers(fire) }),
      scoreFixture(
        quietOne,
        answer(quietOne, { relevant: false, impact: "none" }),
        {
          tiers: tiers(quietOne),
        },
      ),
    ];
    const summary = summarise(results);
    assert.equal(summary.total, 2);
    assert.equal(summary.passed, 2);
    assert.deepEqual(summary.byBand.fire, { total: 1, passed: 1 });
    assert.deepEqual(summary.byBand.quiet, { total: 1, passed: 1 });
  });
});

describe("framing", () => {
  test("catches the words that turn a suggestion into an alarm", () => {
    assert.deepEqual(alarmWordsIn("Severe weather alert"), [
      "alert",
      "severe weather",
    ]);
  });

  test("leaves an ordinary sentence alone", () => {
    assert.deepEqual(
      alarmWordsIn("Rain until two — the cellar tasting runs all afternoon."),
      [],
    );
  });
});
