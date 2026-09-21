import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type BriefingDraft,
  type BriefingItem,
  bundle,
  type ComposeInput,
  checkDraft,
  composeBriefing,
  dayIndexOf,
  dayShape,
  fallbackBriefing,
  kindLabel,
  MAX_ITEMS,
  quietBriefing,
  readDraft,
  toneFor,
} from "./briefing.ts";
import type { Verdict } from "./judge.ts";

// The briefing is the first thing a traveller ever receives, so the tests here
// are about what it may not do: lose an item, invent evidence, or offer a
// change that has nothing to apply.

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  relevant: true,
  impact: "degrades",
  horizonHrs: 6,
  oneLine: "The Gergeti trail will be slick from mid-afternoon.",
  evidence: "open-meteo, taken 2026-10-04 06:00",
  proposals: [],
  confidence: 0.8,
  ...over,
});

let counter = 0;
const item = (over: Partial<BriefingItem> = {}): BriefingItem => {
  counter++;
  return {
    matchId: `match-${counter}`,
    eventId: `event-${counter}`,
    nodeId: `node-${counter}`,
    kind: "weather.rain",
    severity: "moderate",
    source: "open-meteo",
    score: 2,
    nodeTitle: "Gergeti Trinity hike",
    nodeStartsAt: "2026-10-04T10:00:00Z",
    verdict: verdict(),
    ...over,
  };
};

const day = {
  date: "2026-10-04",
  index: 3,
  stops: [
    {
      id: "node-a",
      title: "Breakfast",
      startsAt: "2026-10-04T05:00:00Z",
      durationMin: 60,
      indoor: true,
    },
    {
      id: "node-b",
      title: "Gergeti Trinity hike",
      startsAt: "2026-10-04T10:00:00Z",
      durationMin: 180,
      indoor: false,
    },
  ],
};

const input = (items: BriefingItem[]): ComposeInput => ({
  tripId: "trip-1",
  day,
  items,
  now: new Date("2026-10-04T03:30:00Z"),
});

const draft = (over: Partial<BriefingDraft> = {}): BriefingDraft => ({
  greeting: "Dry until mid-afternoon, and one thing worth moving.",
  lines: [
    { refs: [0], title: "Rain from 16:00", detail: "12 mm, easing by 19:00" },
  ],
  change: null,
  ...over,
});

describe("checkDraft", () => {
  test("accepts a draft that covers the bundle exactly", () => {
    const items = [item(), item()];
    const d = draft({
      lines: [{ refs: [0, 1], title: "Rain on both stops", detail: "12 mm" }],
    });
    assert.deepEqual(checkDraft(d, items), []);
  });

  test("refuses a draft that loses an item", () => {
    const items = [item(), item()];
    const reasons = checkDraft(draft(), items).map((r) => r.reason);
    assert.deepEqual(reasons, ["dropped-item"]);
  });

  test("refuses a ref the bundle does not have", () => {
    const reasons = checkDraft(
      draft({ lines: [{ refs: [4], title: "t", detail: "d" }] }),
      [item()],
    ).map((r) => r.reason);
    // Both, and in that order: the unknown ref, then the item nothing covered.
    assert.deepEqual(reasons, ["unknown-ref", "dropped-item"]);
  });

  test("refuses an item written about twice", () => {
    const reasons = checkDraft(
      draft({
        lines: [
          { refs: [0], title: "a", detail: "d" },
          { refs: [0], title: "b", detail: "d" },
        ],
      }),
      [item()],
    ).map((r) => r.reason);
    assert.deepEqual(reasons, ["duplicate-ref"]);
  });

  test("refuses a recommended change with nothing to apply", () => {
    const reasons = checkDraft(
      draft({ change: { ref: 0, sentence: "Move the hike earlier." } }),
      [item()],
    ).map((r) => r.reason);
    assert.deepEqual(reasons, ["change-without-proposal"]);
  });

  test("accepts a change on an item that proposes moves", () => {
    const items = [
      item({
        verdict: verdict({
          proposals: [
            {
              move: "shift",
              nodeId: "1b3f0a2e-0000-4000-8000-000000000001",
              byMinutes: -270,
            },
          ],
        }),
      }),
    ];
    const d = draft({
      change: { ref: 0, sentence: "Move the hike to 11:30." },
    });
    assert.deepEqual(checkDraft(d, items), []);
  });

  test("every reason is reported, not just the first", () => {
    const reasons = checkDraft(
      draft({
        lines: [{ refs: [9], title: "t", detail: "d" }],
        change: { ref: 9, sentence: "s" },
      }),
      [item()],
    ).map((r) => r.reason);
    assert.deepEqual(reasons, ["unknown-ref", "dropped-item", "unknown-ref"]);
  });
});

describe("composeBriefing", () => {
  test("takes the facts from the item and the prose from the draft", () => {
    const items = [item()];
    const briefing = composeBriefing(
      input(items),
      draft({
        lines: [{ refs: [0], title: "Rain from 16:00", detail: "12 mm" }],
      }),
    );

    assert.equal(briefing.lines[0].title, "Rain from 16:00");
    // Evidence is never model-written: it is copied off the checked verdict.
    assert.deepEqual(briefing.lines[0].evidence, [items[0].verdict.evidence]);
    assert.deepEqual(briefing.lines[0].matchIds, [items[0].matchId]);
    assert.equal(briefing.quiet, false);
    assert.deepEqual(briefing.matchIds, [items[0].matchId]);
  });

  test("a merged line carries both items' evidence, deduped", () => {
    const items = [
      item({
        verdict: verdict({ evidence: "open-meteo, taken 2026-10-04 06:00" }),
      }),
      item({
        verdict: verdict({ evidence: "open-meteo, taken 2026-10-04 06:00" }),
      }),
    ];
    const briefing = composeBriefing(
      input(items),
      draft({ lines: [{ refs: [0, 1], title: "Rain", detail: "both stops" }] }),
    );
    assert.equal(briefing.lines[0].evidence.length, 1);
    assert.equal(briefing.lines[0].matchIds.length, 2);
  });

  test("a merged line takes the worst tone of what it covers", () => {
    const items = [
      item({ verdict: verdict({ impact: "improves" }) }),
      item({ verdict: verdict({ impact: "blocks" }) }),
    ];
    const briefing = composeBriefing(
      input(items),
      draft({ lines: [{ refs: [0, 1], title: "Rain", detail: "d" }] }),
    );
    assert.equal(briefing.lines[0].tone, "alert");
  });

  test("the change carries the judge's proposals, not the model's words for them", () => {
    const proposals: Verdict["proposals"] = [
      { move: "drop", nodeId: "1b3f0a2e-0000-4000-8000-000000000002" },
    ];
    const items = [item({ verdict: verdict({ proposals }) })];
    const briefing = composeBriefing(
      input(items),
      draft({ change: { ref: 0, sentence: "Skip the ridge today." } }),
    );
    assert.deepEqual(briefing.change?.proposals, proposals);
    assert.equal(briefing.change?.evidence, items[0].verdict.evidence);
  });
});

describe("readDraft", () => {
  test("falls back rather than going silent on a malformed answer", () => {
    const items = [item()];
    const result = readDraft({ nonsense: true }, input(items));
    assert.equal(result.ok, false);
    assert.equal(result.rejections[0].reason, "malformed");
    // The day still gets a briefing, and every sentence in it was the judge's.
    assert.equal(result.briefing.lines[0].title, items[0].verdict.oneLine);
    assert.deepEqual(result.briefing.matchIds, [items[0].matchId]);
  });

  test("falls back when a guard refuses the draft", () => {
    const result = readDraft(draft(), input([item(), item()]));
    assert.equal(result.ok, false);
    assert.equal(result.rejections[0].reason, "dropped-item");
    assert.equal(result.briefing.lines.length, 2);
  });

  test("passes a clean draft through", () => {
    const result = readDraft(draft(), input([item()]));
    assert.equal(result.ok, true);
    assert.equal(result.briefing.greeting, draft().greeting);
  });
});

describe("the quiet day", () => {
  test("is a briefing, not a silence", () => {
    const briefing = quietBriefing({
      tripId: "trip-1",
      day,
      now: new Date("2026-10-04T03:30:00Z"),
    });
    assert.equal(briefing.quiet, true);
    assert.equal(briefing.lines.length, 1);
    assert.equal(briefing.lines[0].tone, "ok");
    assert.deepEqual(briefing.matchIds, []);
    assert.equal(briefing.change, null);
    // It claims exactly the coverage the system has and no more.
    assert.match(briefing.lines[0].detail, /One source watched overnight/);
  });
});

describe("fallbackBriefing", () => {
  test("recommends the highest-scoring change that has moves", () => {
    const items = [
      item({
        score: 1,
        verdict: verdict({
          proposals: [
            { move: "drop", nodeId: "1b3f0a2e-0000-4000-8000-000000000003" },
          ],
        }),
      }),
      item({
        score: 9,
        verdict: verdict({
          proposals: [
            { move: "drop", nodeId: "1b3f0a2e-0000-4000-8000-000000000004" },
          ],
        }),
      }),
      item({ score: 20 }),
    ];
    const briefing = fallbackBriefing(input(items));
    assert.equal(briefing.change?.matchId, items[1].matchId);
  });

  test("offers no change when nothing proposes one", () => {
    assert.equal(fallbackBriefing(input([item()])).change, null);
  });
});

describe("bundle", () => {
  test("caps the day and keeps the worst", () => {
    const items = Array.from({ length: MAX_ITEMS + 2 }, (_, i) =>
      item({ score: i }),
    );
    const { taken, overflow } = bundle(items);
    assert.equal(taken.length, MAX_ITEMS);
    assert.equal(overflow.length, 2);
    // What waits for tomorrow is the mildest thing, never the soonest.
    assert.ok(taken.every((t) => overflow.every((o) => t.score >= o.score)));
  });
});

describe("small pure helpers", () => {
  test("dayIndexOf counts from the trip's first Tbilisi date, inclusively", () => {
    assert.equal(dayIndexOf("2026-10-02T06:00:00Z", "2026-10-02"), 1);
    assert.equal(dayIndexOf("2026-10-02T06:00:00Z", "2026-10-04"), 3);
    // A trip starting late enough to be tomorrow in Tbilisi already has.
    assert.equal(dayIndexOf("2026-10-01T21:00:00Z", "2026-10-02"), 1);
  });

  test("dayShape says only what is on the day", () => {
    assert.equal(dayShape({ ...day, stops: [] }), "Nothing scheduled today.");
    assert.equal(dayShape(day), "2 stops today, 09:00 to 14:00.");
    assert.equal(
      dayShape({ ...day, stops: [day.stops[0]] }),
      "One stop today, at 09:00.",
    );
  });

  test("tone gives colour its three jobs and no fourth", () => {
    assert.equal(toneFor("blocks"), "alert");
    assert.equal(toneFor("degrades"), "alert");
    assert.equal(toneFor("improves"), "agent");
    assert.equal(toneFor("none"), "ok");
  });

  test("kindLabel names the detector, not its namespace", () => {
    assert.equal(kindLabel("weather.thunderstorm"), "Weather");
  });
});
