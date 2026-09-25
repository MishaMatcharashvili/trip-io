import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  nodeKindsFor,
  radiusFor,
  roadKinds,
  staleAfterHours,
} from "./event.ts";
import { eventSummary } from "./interrupt.ts";
import { checkVerdict } from "./judge.ts";
import {
  CONFIDENCE,
  describeReport,
  onApproval,
  ROAD_SOURCE,
  type RoadReportInput,
  reportWindow,
  roadEventDraft,
  roadReportInput,
} from "./road.ts";

// Detector #2: a report typed into a Telegram form, and what it becomes.

const closure: RoadReportInput = {
  corridorSlug: "military-road",
  condition: "closed",
  hazard: "avalanche",
  duration: "6h",
};

/** 10:00 in Tbilisi. */
const MORNING = new Date("2026-12-04T06:00:00Z");

describe("the form's input", () => {
  test("names a corridor we curate, and nothing free-text", () => {
    assert.ok(roadReportInput.safeParse(closure).success);
    assert.ok(
      !roadReportInput.safeParse({ ...closure, corridorSlug: "route-66" })
        .success,
    );
    assert.ok(
      !roadReportInput.safeParse({ ...closure, hazard: "dragons" }).success,
    );
  });

  test("a reopening carries no hazard", () => {
    assert.ok(
      !roadReportInput.safeParse({ ...closure, condition: "reopened" }).success,
    );
    assert.ok(
      roadReportInput.safeParse({
        ...closure,
        condition: "reopened",
        hazard: null,
      }).success,
    );
  });

  test("is described the same way wherever it is shown", () => {
    assert.equal(
      describeReport(closure),
      "Georgian Military Road — closed (avalanche), about 6 hours",
    );
    assert.equal(
      describeReport({
        ...closure,
        condition: "reopened",
        hazard: null,
      }),
      "Georgian Military Road — open again",
    );
  });
});

describe("the window", () => {
  test("runs from the moment it was sent", () => {
    assert.deepEqual(reportWindow("2h", MORNING), {
      validFrom: "2026-12-04T06:00:00.000Z",
      validTo: "2026-12-04T08:00:00.000Z",
    });
  });

  test("'rest of today' ends at midnight in Tbilisi, not in UTC", () => {
    assert.equal(
      reportWindow("today", MORNING).validTo,
      "2026-12-04T20:00:00.000Z",
    );
  });

  test("'rest of today' sent at 23:30 still lasts an hour", () => {
    const late = new Date("2026-12-04T19:30:00Z"); // 23:30 Tbilisi
    assert.equal(
      reportWindow("today", late).validTo,
      "2026-12-04T20:30:00.000Z",
    );
  });

  test("approved after it closed, it is history, not news", () => {
    const window = reportWindow("2h", MORNING);
    assert.equal(
      onApproval(window, new Date("2026-12-04T07:00:00Z")),
      "published",
    );
    assert.equal(
      onApproval(window, new Date("2026-12-04T09:00:00Z")),
      "expired",
    );
  });
});

describe("the event", () => {
  const draft = (trust: "operator" | "community", report = closure) =>
    roadEventDraft({
      report,
      trust,
      window: reportWindow(report.duration, MORNING),
      reportedAt: MORNING.toISOString(),
    });

  test("a closure is severe, and names its corridor for the matcher and the card", () => {
    const event = draft("operator");
    assert.equal(event?.kind, "road.closure");
    assert.equal(event?.severity, "severe");
    assert.equal(event?.source, ROAD_SOURCE);
    assert.equal(event?.payload.corridor, "military-road");
  });

  test("an operator's report and a vouched-for stranger's are both above the interrupt floor, and not equal", () => {
    assert.equal(draft("operator")?.confidence, CONFIDENCE.operator);
    assert.equal(draft("community")?.confidence, CONFIDENCE.community);
    assert.ok(CONFIDENCE.community >= 0.7);
    assert.ok(CONFIDENCE.operator > CONFIDENCE.community);
  });

  test("a reopening writes no event", () => {
    assert.equal(
      draft("operator", { ...closure, condition: "reopened", hazard: null }),
      null,
    );
  });

  test("the card reads the road and the cause from the payload", () => {
    const event = draft("operator");
    assert.ok(event);
    assert.equal(
      eventSummary({
        kind: event.kind,
        validFrom: event.validFrom,
        validTo: event.validTo,
        payload: event.payload,
      }),
      "Road closed (avalanche) · Georgian Military Road · reported for 10:00–16:00",
    );
  });

  test("a judge's evidence citing it passes the source guard", () => {
    const rejections = checkVerdict(
      {
        relevant: true,
        impact: "blocks",
        horizonHrs: 1,
        oneLine: "The pass is shut above Gudauri — Kazbegi waits for tomorrow.",
        evidence: "road-report, 2026-12-04 10:00",
        proposals: [],
        confidence: 0.9,
      },
      { tiers: new Map(), source: ROAD_SOURCE },
    );
    assert.deepEqual(rejections, []);
  });
});

describe("matching a road event", () => {
  test("matches drives, not stops", () => {
    for (const kind of roadKinds) {
      assert.deepEqual(nodeKindsFor(kind), ["transfer"]);
    }
    assert.equal(nodeKindsFor("weather.rain"), null);
  });

  test("is not dropped as stale while its window is open", () => {
    // Nothing re-observes a report. Its window is the longest the form offers.
    for (const kind of roadKinds) {
      assert.ok(staleAfterHours(kind) >= 72);
      assert.ok(radiusFor(kind) > 0);
    }
    assert.equal(staleAfterHours("weather.rain"), 6);
  });
});
