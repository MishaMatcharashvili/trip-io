import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bandCount,
  bandProportion,
  CRITERIA,
  familyOf,
  interleaveByFamily,
  MODEL_PURPOSES,
  perSevenDays,
  priceFor,
  spendUsd,
  wilson,
} from "./kill-criteria.ts";

describe("the Wilson interval", () => {
  test("matches known values", () => {
    // 10 of 20 at 90%: the textbook interval is about 0.33 to 0.67.
    const { low, high } = wilson(10, 20);
    assert.ok(Math.abs(low - 0.33) < 0.02, `low ${low}`);
    assert.ok(Math.abs(high - 0.67) < 0.02, `high ${high}`);
  });

  test("does not collapse to a point at 0 or n", () => {
    assert.ok(wilson(0, 20).high > 0.05);
    assert.ok(wilson(20, 20).low < 0.95);
  });

  test("an empty sample says nothing", () => {
    assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
  });

  test("narrows as the sample grows", () => {
    const small = wilson(5, 10);
    const large = wilson(50, 100);
    assert.ok(large.high - large.low < small.high - small.low);
  });
});

describe("banding a proportion where higher is better", () => {
  const acted = CRITERIA.actedOn;

  test("below the floor is never a verdict", () => {
    assert.equal(bandProportion(0, 5, acted), "insufficient");
    assert.equal(bandProportion(5, 5, acted), "insufficient");
  });

  test("continue only when the whole interval clears the line", () => {
    assert.equal(bandProportion(90, 100, acted), "continue");
    // 45% of 20 is above the 40% line, but the interval reaches below it.
    assert.equal(bandProportion(9, 20, acted), "watch");
  });

  test("stop only when the whole interval is under the stop line", () => {
    assert.equal(bandProportion(1, 100, acted), "stop");
    // 2 of 20 is 10%, under 15%, but the interval reaches above it.
    assert.equal(bandProportion(2, 20, acted), "watch");
  });
});

describe("banding a proportion where lower is better", () => {
  test("a mute rate under 10% across the interval continues", () => {
    assert.equal(bandProportion(1, 100, CRITERIA.muted), "continue");
  });

  test("over 25% across the interval stops", () => {
    assert.equal(bandProportion(60, 100, CRITERIA.muted), "stop");
  });

  test("a false-positive rate that straddles a line is watched, not decided", () => {
    assert.equal(bandProportion(5, 30, CRITERIA.falsePositive), "watch");
  });
});

describe("banding interventions per trip", () => {
  const perTrip = CRITERIA.perTrip;

  test("needs trips before it says anything", () => {
    assert.equal(bandCount(6, 2, perTrip), "insufficient");
  });

  test("4 to 8 continues, under 2 stops, between is watched", () => {
    assert.equal(bandCount(4, 10, perTrip), "continue");
    assert.equal(bandCount(8, 10, perTrip), "continue");
    assert.equal(bandCount(1.9, 10, perTrip), "stop");
    assert.equal(bandCount(2, 10, perTrip), "watch");
    assert.equal(bandCount(3.9, 10, perTrip), "watch");
  });

  test("a talkative judge is watched, not applauded", () => {
    assert.equal(bandCount(9, 10, perTrip), "watch");
  });
});

describe("normalising to a seven-day trip", () => {
  test("scales a count by trip length", () => {
    assert.equal(perSevenDays(3, 3), 7);
    assert.equal(perSevenDays(4, 14), 2);
    assert.equal(perSevenDays(5, 7), 5);
  });

  test("a trip of no days is not a division by zero", () => {
    assert.equal(perSevenDays(3, 0), 0);
  });
});

describe("detector families", () => {
  test("are the prefix of the event kind", () => {
    assert.equal(familyOf("weather.rain"), "weather");
    assert.equal(familyOf("safety.demonstration"), "safety");
    assert.equal(familyOf("hours.closed"), "hours");
  });
});

describe("the audit queue", () => {
  const c = (matchId: string, family: string) => ({ matchId, family });

  test("is the same on every load", () => {
    const rows = [c("a", "weather"), c("b", "weather"), c("c", "events")];
    assert.deepEqual(interleaveByFamily(rows), interleaveByFamily([...rows]));
    assert.deepEqual(
      interleaveByFamily(rows),
      interleaveByFamily([...rows].reverse()),
    );
  });

  test("reaches a small family while a large one is still full", () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => c(`w${i}`, "weather")),
      c("e1", "events"),
      c("s1", "safety"),
    ];
    const firstThree = interleaveByFamily(rows)
      .slice(0, 3)
      .map((r) => r.family);
    assert.deepEqual([...firstThree].sort(), ["events", "safety", "weather"]);
  });

  test("loses and repeats nothing", () => {
    const rows = [c("a", "x"), c("b", "x"), c("c", "y"), c("d", "z")];
    const out = interleaveByFamily(rows);
    assert.deepEqual(out.map((r) => r.matchId).sort(), ["a", "b", "c", "d"]);
  });
});

describe("what a model call cost", () => {
  const prices = {
    inputPerMillion: 1,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 4,
  };

  test("cached input is cheaper and is part of the input count", () => {
    const usd = spendUsd(
      {
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 500_000,
      },
      prices,
    );
    // 600k fresh at 1, 400k cached at 0.1, 500k out at 4.
    assert.ok(Math.abs((usd as number) - (0.6 + 0.04 + 2)) < 1e-9);
  });

  test("reasoning tokens are already inside the output count", () => {
    const base = {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    };
    assert.equal(
      spendUsd(base, prices),
      spendUsd({ ...base, reasoningTokens: 900_000 }, prices),
    );
  });

  test("without a price there is no number, not a zero", () => {
    assert.equal(
      spendUsd({ inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 }, null),
      null,
    );
  });

  test("the pinned model has no price until someone supplies it", () => {
    assert.equal(priceFor("gpt-5.4-mini"), null);
  });
});

describe("model-call purposes", () => {
  test("cover every caller of the model", () => {
    assert.deepEqual([...MODEL_PURPOSES].sort(), [
      "ask",
      "briefing",
      "compose",
      "extract",
      "judge",
      "road",
      "suggest",
      "translate",
    ]);
  });
});
