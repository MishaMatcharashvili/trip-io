import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PlaceTier } from "../catalogue/tier.ts";
import {
  checkVerdict,
  readVerdict,
  type Verdict,
  type VerdictContext,
} from "./judge.ts";

// The four guards, each written because a model reliably produces the shape it
// refuses. These are the tests that protect the traveller from the prompt.

const CURATED = "11111111-1111-4111-8111-111111111111";
const VERIFIED = "22222222-2222-4222-8222-222222222222";
const RAW = "33333333-3333-4333-8333-333333333333";
const INVENTED = "44444444-4444-4444-8444-444444444444";

const ctx = (over: Partial<VerdictContext> = {}): VerdictContext => ({
  tiers: new Map<string, PlaceTier>([
    [CURATED, "curated"],
    [VERIFIED, "verified"],
    [RAW, "raw"],
  ]),
  source: "open-meteo",
  ...over,
});

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 3,
  oneLine: "Rain at the Gergeti trailhead all afternoon.",
  evidence: "open-meteo forecast, taken 2026-10-04 06:00",
  proposals: [],
  confidence: 0.82,
  ...over,
});

const NODE = "55555555-5555-4555-8555-555555555555";

const moveTo = (placeId: string) => [
  { move: "swap" as const, nodeId: NODE, placeId, indoor: true },
];

const reasons = (v: Verdict, c = ctx()) =>
  checkVerdict(v, c).map((r) => r.reason);

describe("the judge's guards", () => {
  test("a well-formed verdict passes", () => {
    assert.deepEqual(reasons(verdict()), []);
  });

  test("reject relevant-with-no-impact: the helpful-but-empty shape", () => {
    assert.deepEqual(reasons(verdict({ impact: "none" })), ["empty-helpful"]);
  });

  test("an irrelevant verdict is allowed to have no impact", () => {
    assert.deepEqual(reasons(verdict({ relevant: false, impact: "none" })), []);
  });

  test("reject a place that is not in the catalogue", () => {
    assert.deepEqual(reasons(verdict({ proposals: moveTo(INVENTED) })), [
      "unknown-place",
    ]);
  });

  test("reject a raw place: an intervention may name curated or verified", () => {
    assert.deepEqual(reasons(verdict({ proposals: moveTo(RAW) })), [
      "place-tier",
    ]);
  });

  test("a verified place is proposable — that is what the tier is for", () => {
    assert.deepEqual(reasons(verdict({ proposals: moveTo(VERIFIED) })), []);
    assert.deepEqual(reasons(verdict({ proposals: moveTo(CURATED) })), []);
  });

  test("reject empty evidence", () => {
    assert.deepEqual(reasons(verdict({ evidence: "   " })), [
      "evidence-missing",
    ]);
  });

  test("reject evidence with no timestamp", () => {
    assert.deepEqual(
      reasons(verdict({ evidence: "the open-meteo forecast" })),
      ["evidence-undated"],
    );
  });

  test("reject evidence that does not name its source", () => {
    assert.deepEqual(
      reasons(verdict({ evidence: "forecast taken at 06:00" })),
      ["evidence-unsourced"],
    );
  });

  test("a clock time is a timestamp too", () => {
    assert.deepEqual(
      reasons(verdict({ evidence: "open-meteo, 06:00 today" })),
      [],
    );
  });

  test("every reason is returned, not just the first", () => {
    // A prompt edit that breaks two things at once must not hide one of them.
    assert.deepEqual(
      reasons(
        verdict({ impact: "none", proposals: moveTo(INVENTED), evidence: "" }),
      ).sort(),
      ["empty-helpful", "evidence-missing", "unknown-place"],
    );
  });
});

describe("reading a verdict", () => {
  test("a malformed verdict is one rejection, with the reason kept", () => {
    const result = readVerdict({ relevant: true }, ctx());
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.ok === false && result.rejections.map((r) => r.reason),
      ["malformed"],
    );
    assert.equal(result.ok === false && result.verdict, null);
  });

  test("confidence outside 0..1 is malformed, not clamped", () => {
    const result = readVerdict({ ...verdict(), confidence: 1.4 }, ctx());
    assert.equal(result.ok, false);
  });

  test("a rejected verdict is kept, so the rejection can be audited", () => {
    const result = readVerdict(verdict({ impact: "none" }), ctx());
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.verdict !== null);
  });

  test("a good verdict comes back decoded", () => {
    const result = readVerdict(verdict(), ctx());
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.verdict.impact, "degrades");
  });
});
