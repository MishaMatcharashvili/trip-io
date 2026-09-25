import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkDelivery,
  type DeliveryInput,
  expiresAt,
  isMute,
  makeOffer,
  mayRecord,
  offer,
  outcomes,
  PUSH_TITLE_MAX,
  pushMessage,
} from "./interrupt.ts";
import type { Verdict } from "./judge.ts";

// The second look at a verdict the router already sent to `interrupt`: the one
// that spends the budget, and so the one that has to be right under a race.

const HIKE = "4b1a3f3e-8a51-4d0e-9a3f-0c6a4f1d2e11";
const LUNCH = "7c2d9e10-1f4b-4a8e-b1c2-3d4e5f6a7b8c";
const MATCH = "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b";

/** Midday in Tbilisi, well clear of any plausible quiet window. */
const NOON = new Date("2026-10-04T08:00:00Z");

const input = (over: Partial<DeliveryInput> = {}): DeliveryInput => ({
  now: NOON,
  event: { validTo: "2026-10-04T14:00:00Z" },
  node: { startsAt: "2026-10-04T09:00:00Z", durationMin: 180 },
  covered: false,
  ledger: { sentSoFar: 0, cap: 4 },
  watch: { channels: ["push", "briefing"], quietHours: null },
  devices: 1,
  coherent: true,
  ...over,
});

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 1.5,
  oneLine:
    "Rain reaches the Gergeti trail at 14:00 — the morning is still dry.",
  evidence: "open-meteo, taken 2026-10-04 07:00",
  proposals: [{ move: "shift", nodeId: HIKE, byMinutes: -120 }],
  confidence: 0.85,
  ...over,
});

const clocks = new Map([
  [HIKE, { startsAt: "2026-10-04T10:00:00Z" }],
  [LUNCH, { startsAt: "2026-10-04T09:00:00Z" }],
]);

describe("delivery", () => {
  test("an urgent verdict with budget, a device and a coherent change is sent", () => {
    assert.deepEqual(checkDelivery(input()), { deliver: true });
  });

  test("the last slot is still a slot; past it the verdict goes to the briefing", () => {
    assert.deepEqual(
      checkDelivery(input({ ledger: { sentSoFar: 3, cap: 4 } })),
      { deliver: true },
    );
    assert.deepEqual(
      checkDelivery(input({ ledger: { sentSoFar: 4, cap: 4 } })),
      { deliver: false, route: "briefing", reason: "budget-spent" },
    );
  });

  test("an event that is over is dropped, not saved for the morning", () => {
    assert.deepEqual(
      checkDelivery(input({ event: { validTo: "2026-10-04T07:59:00Z" } })),
      { deliver: false, route: "drop", reason: "event-over" },
    );
  });

  test("a stop in progress can still be interrupted; a finished one cannot", () => {
    // Started an hour ago, two hours left: a road closing mid-drive.
    assert.deepEqual(
      checkDelivery(
        input({ node: { startsAt: "2026-10-04T07:00:00Z", durationMin: 180 } }),
      ),
      { deliver: true },
    );
    assert.deepEqual(
      checkDelivery(
        input({ node: { startsAt: "2026-10-04T06:00:00Z", durationMin: 120 } }),
      ),
      { deliver: false, route: "drop", reason: "too-late" },
    );
  });

  test("one event is one interrupt, however many stops it touches", () => {
    assert.deepEqual(checkDelivery(input({ covered: true })), {
      deliver: false,
      route: "interrupt",
      reason: "covered",
    });
  });

  test("a covered event reports covered, not the budget it would have hit", () => {
    assert.deepEqual(
      checkDelivery(input({ covered: true, ledger: { sentSoFar: 4, cap: 4 } })),
      { deliver: false, route: "interrupt", reason: "covered" },
    );
  });

  test("the clock crossing into quiet hours since judging is caught at send time", () => {
    assert.deepEqual(
      checkDelivery(
        input({
          now: new Date("2026-10-03T19:30:00Z"), // 23:30 Tbilisi
          node: { startsAt: "2026-10-03T19:00:00Z", durationMin: 180 },
          event: { validTo: "2026-10-04T02:00:00Z" },
          watch: {
            channels: ["push"],
            quietHours: { start: "22:00", end: "08:00" },
          },
        }),
      ),
      { deliver: false, route: "briefing", reason: "quiet-hours" },
    );
  });

  test("push switched off since judging goes to the briefing", () => {
    assert.deepEqual(
      checkDelivery(
        input({ watch: { channels: ["briefing"], quietHours: null } }),
      ),
      { deliver: false, route: "briefing", reason: "no-interrupt-channel" },
    );
  });

  test("push on with no phone registered goes to the briefing", () => {
    assert.deepEqual(checkDelivery(input({ devices: 0 })), {
      deliver: false,
      route: "briefing",
      reason: "no-device",
    });
  });

  test("a change that would break the day is never pushed", () => {
    assert.deepEqual(checkDelivery(input({ coherent: false })), {
      deliver: false,
      route: "briefing",
      reason: "incoherent-proposal",
    });
  });

  test("never delivers over budget, whatever else is true", () => {
    for (const sentSoFar of [0, 2, 3, 4, 5, 9]) {
      for (const cap of [2, 4, 6]) {
        for (const devices of [0, 1, 3]) {
          const decision = checkDelivery(
            input({ ledger: { sentSoFar, cap }, devices }),
          );
          if (decision.deliver) {
            assert.ok(sentSoFar < cap, `delivered at ${sentSoFar}/${cap}`);
          }
        }
      }
    }
  });
});

describe("offers", () => {
  test("moves become absolute ops against the day as it was offered", () => {
    const made = makeOffer({
      matchId: MATCH,
      nodeId: HIKE,
      kind: "weather.rain",
      verdict: verdict(),
      clocks,
    });
    assert.deepEqual(made.ops, [
      {
        op: "replace",
        path: `/nodes/${HIKE}/startsAt`,
        value: "2026-10-04T08:00:00.000Z",
      },
    ]);
    assert.equal(made.proposals.length, 1);
    assert.ok(offer.safeParse(made).success, "an offer round-trips its schema");
  });

  test("a proposal naming a stop the trip no longer has offers nothing to apply", () => {
    const made = makeOffer({
      matchId: MATCH,
      nodeId: HIKE,
      kind: "weather.rain",
      verdict: verdict({
        proposals: [
          { move: "shift", nodeId: HIKE, byMinutes: -120 },
          {
            move: "shift",
            nodeId: "11111111-2222-4333-8444-555555555555",
            byMinutes: 60,
          },
        ],
      }),
      clocks,
    });
    // Half a cascade is worse than none.
    assert.deepEqual(made.ops, []);
    assert.deepEqual(made.proposals, []);
  });

  test("a briefing item that was not the nominated change carries no moves", () => {
    const made = makeOffer({
      matchId: MATCH,
      nodeId: HIKE,
      kind: "weather.rain",
      verdict: verdict(),
      clocks,
      actionable: false,
    });
    assert.deepEqual(made.ops, []);
    assert.deepEqual(made.proposals, []);
    assert.equal(made.oneLine, verdict().oneLine);
  });
});

describe("the push", () => {
  const made = makeOffer({
    matchId: MATCH,
    nodeId: HIKE,
    kind: "weather.rain",
    verdict: verdict(),
    clocks,
  });

  test("the title names the stop and its time; the body is the judge's sentence", () => {
    const message = pushMessage({
      offer: made,
      stop: { title: "Gergeti hike", startsAt: "2026-10-04T10:00:00Z" },
      url: "https://trip.io/trips/t/alerts/i",
      interventionId: "i",
    });
    assert.equal(message.title, "Weather · Gergeti hike at 14:00");
    assert.equal(message.body, made.oneLine);
  });

  test("a long stop name is clipped, not the time", () => {
    const message = pushMessage({
      offer: made,
      stop: {
        title:
          "Holy Trinity Church above Stepantsminda, via the long ridge path",
        startsAt: "2026-10-04T10:00:00Z",
      },
      url: "u",
      interventionId: "i",
    });
    assert.ok(message.title.length <= PUSH_TITLE_MAX);
    assert.ok(message.title.endsWith("…"));
  });
});

describe("outcomes", () => {
  test("a push expires at the end of its horizon; a briefing item when its stop starts", () => {
    const sent = new Date("2026-10-04T08:00:00Z");
    assert.equal(
      expiresAt("push", sent, { horizonHrs: 1.5 }, "2026-10-04T12:00:00Z"),
      "2026-10-04T09:30:00.000Z",
    );
    assert.equal(
      expiresAt("briefing", sent, { horizonHrs: 30 }, "2026-10-04T12:00:00Z"),
      "2026-10-04T12:00:00.000Z",
    );
  });

  test("the traveller's answer is final; the sweep's guess is not", () => {
    for (const next of outcomes) assert.ok(mayRecord(null, next));
    assert.ok(mayRecord("ignored", "accepted"), "a late accept overrules");
    assert.ok(mayRecord("ignored", "dismissed"));
    assert.ok(!mayRecord("ignored", "ignored"), "the sweep runs once");
    for (const settled of ["accepted", "dismissed", "muted"] as const) {
      for (const next of outcomes) {
        assert.ok(!mayRecord(settled, next), `${settled} → ${next}`);
      }
    }
  });

  test("turning push off mid-trip is a mute; before the trip it is a preference", () => {
    const window = {
      activeFrom: "2026-10-01T00:00:00Z",
      activeTo: "2026-10-08T00:00:00Z",
    };
    assert.ok(
      isMute({
        before: ["push", "briefing"],
        after: ["briefing"],
        now: NOON,
        ...window,
      }),
    );
    assert.ok(
      !isMute({
        before: ["push", "briefing"],
        after: ["briefing"],
        now: new Date("2026-09-20T08:00:00Z"),
        ...window,
      }),
    );
    assert.ok(
      !isMute({ before: ["briefing"], after: ["push"], now: NOON, ...window }),
    );
  });
});
