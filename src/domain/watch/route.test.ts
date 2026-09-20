import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EventKind } from "./event.ts";
import type { Verdict } from "./judge.ts";
import {
  INTERRUPT_ELIGIBLE,
  INTERRUPT_MIN_CONFIDENCE,
  inQuietHours,
  type RouteInput,
  route,
} from "./route.ts";

// The decision to wake someone up, and the reason for every decision not to.

const RAIN: EventKind = "weather.rain";
const graduated = new Set<EventKind>([RAIN]);

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  relevant: true,
  impact: "blocks",
  horizonHrs: 1,
  oneLine: "The Gergeti trail will be washed out by mid-morning.",
  evidence: "open-meteo, taken 2026-10-04 06:00",
  ops: [],
  confidence: 0.9,
  ...over,
});

/** Midday in Tbilisi, well clear of any plausible quiet window. */
const NOON = new Date("2026-10-04T08:00:00Z");

const input = (over: Partial<RouteInput> = {}): RouteInput => ({
  verdict: verdict(),
  kind: RAIN,
  eventConfidence: 0.9,
  ledger: { sentSoFar: 0, cap: 4 },
  watch: { channels: ["push", "briefing"], quietHours: null },
  now: NOON,
  interruptEligible: graduated,
  ...over,
});

describe("routing", () => {
  test("an urgent, confident, in-budget verdict interrupts", () => {
    assert.deepEqual(route(input()), { route: "interrupt", reason: "urgent" });
  });

  test("an irrelevant verdict is dropped, not filed", () => {
    assert.deepEqual(route(input({ verdict: verdict({ relevant: false }) })), {
      route: "drop",
      reason: "not-relevant",
    });
  });

  test("relevant with no impact is dropped even if the validator let it through", () => {
    assert.deepEqual(route(input({ verdict: verdict({ impact: "none" }) })), {
      route: "drop",
      reason: "no-impact",
    });
  });

  test("beyond two hours, tomorrow morning is soon enough", () => {
    assert.deepEqual(route(input({ verdict: verdict({ horizonHrs: 5 }) })), {
      route: "briefing",
      reason: "beyond-horizon",
    });
  });

  test("an unconfident verdict never interrupts", () => {
    const result = route(
      input({
        verdict: verdict({ confidence: INTERRUPT_MIN_CONFIDENCE - 0.01 }),
      }),
    );
    assert.deepEqual(result, { route: "briefing", reason: "low-confidence" });
  });

  test("a confident model cannot talk past an unconfident forecast", () => {
    // The model never sees the detector's lead-time confidence, so this is the
    // only place a certain-sounding guess about the day after tomorrow is caught.
    assert.deepEqual(
      route(
        input({ verdict: verdict({ confidence: 0.99 }), eventConfidence: 0.6 }),
      ),
      { route: "briefing", reason: "low-confidence" },
    );
  });

  test("a spent budget downgrades rather than drops", () => {
    assert.deepEqual(route(input({ ledger: { sentSoFar: 4, cap: 4 } })), {
      route: "briefing",
      reason: "budget-spent",
    });
  });

  test("quiet hours downgrade too — the disruption is still real at 08:00", () => {
    assert.deepEqual(
      route(
        input({
          now: new Date("2026-10-03T23:30:00Z"), // 03:30 Tbilisi
          watch: {
            channels: ["push"],
            quietHours: { start: "22:00", end: "08:00" },
          },
        }),
      ),
      { route: "briefing", reason: "quiet-hours" },
    );
  });

  test("a traveller with no push channel gets the briefing", () => {
    assert.deepEqual(
      route(input({ watch: { channels: ["briefing"], quietHours: null } })),
      { route: "briefing", reason: "no-interrupt-channel" },
    );
  });

  test("a detector that has not graduated cannot interrupt at all", () => {
    assert.deepEqual(route(input({ interruptEligible: new Set() })), {
      route: "briefing",
      reason: "briefing-only-detector",
    });
  });

  test("no detector has graduated yet — nothing delivered in Phase 3 can wake anyone", () => {
    assert.equal(INTERRUPT_ELIGIBLE.size, 0);
    assert.equal(
      route({ ...input(), interruptEligible: undefined }).route,
      "briefing",
    );
  });

  test("never interrupts below the confidence floor, whatever else is true", () => {
    // The fourth validator from the implementation plan, as an invariant over
    // the whole input space rather than one case.
    for (const confidence of [0, 0.3, 0.5, 0.69, 0.7, 0.95]) {
      for (const eventConfidence of [0.4, 0.69, 0.7, 1]) {
        const result = route(
          input({ verdict: verdict({ confidence }), eventConfidence }),
        );
        if (result.route === "interrupt") {
          assert.ok(
            Math.min(confidence, eventConfidence) >= INTERRUPT_MIN_CONFIDENCE,
            `interrupted at ${confidence}/${eventConfidence}`,
          );
        }
      }
    }
  });
});

describe("quiet hours", () => {
  const night = { start: "22:00", end: "08:00" };

  test("wrap past midnight", () => {
    // 22:00, 02:00 and 07:59 Tbilisi are all quiet; 08:00 and 21:00 are not.
    assert.equal(inQuietHours(new Date("2026-10-04T18:00:00Z"), night), true);
    assert.equal(inQuietHours(new Date("2026-10-04T22:00:00Z"), night), true);
    assert.equal(inQuietHours(new Date("2026-10-04T03:59:00Z"), night), true);
    assert.equal(inQuietHours(new Date("2026-10-04T04:00:00Z"), night), false);
    assert.equal(inQuietHours(new Date("2026-10-04T17:00:00Z"), night), false);
  });

  test("a same-day window does not", () => {
    const siesta = { start: "13:00", end: "16:00" };
    assert.equal(inQuietHours(new Date("2026-10-04T10:00:00Z"), siesta), true);
    assert.equal(inQuietHours(new Date("2026-10-04T12:00:00Z"), siesta), false);
  });

  test("are read on the trip's clock, not the server's", () => {
    // 23:00 UTC is 03:00 in Tbilisi: quiet, though a UTC server would disagree.
    assert.equal(inQuietHours(new Date("2026-10-04T23:00:00Z"), night), true);
  });

  test("an unset window is never quiet", () => {
    assert.equal(inQuietHours(new Date("2026-10-04T23:00:00Z"), null), false);
  });
});
