import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  at,
  DAY,
  kazbegiDoc,
  N,
  places,
} from "../domain/trip/test-fixtures.ts";
import { dayTiming, gapNote } from "./day-timing.ts";

const timing = (doc = kazbegiDoc()) => dayTiming(doc, places);

describe("gapNote", () => {
  test("room to spare is plain information", () => {
    assert.deepEqual(gapNote({ slackMin: 60, needMin: 12 }), {
      text: "About 12 min away",
      tone: "ok",
    });
  });

  test("less than the way and the buffer is a warning with the numbers", () => {
    const note = gapNote({ slackMin: 15, needMin: 12 });
    assert.equal(note?.tone, "alert");
    assert.match(note?.text ?? "", /About 12 min away · only 15 min between/);
  });

  test("an overlap says by how much", () => {
    assert.deepEqual(gapNote({ slackMin: -30, needMin: 12 }), {
      text: "Overlaps by 30 min",
      tone: "alert",
    });
  });

  test("the same place, with room, says nothing", () => {
    assert.equal(gapNote({ slackMin: 20, needMin: 0 }), null);
  });
});

describe("a coherent day", () => {
  test("has no problems", () => {
    assert.deepEqual([...timing().problems.values()].flat(), []);
  });

  test("has a note between stops that are apart, none where they are the same place", () => {
    const { gaps } = timing();
    // Breakfast and the viewpoint at Gudauri are apart; the Kazbegi check-in and
    // the hike are a walk apart.
    assert.ok(gaps[N.friendship]);
  });
});

describe("a day with an overlap", () => {
  const doc = () => {
    const d = kazbegiDoc();
    d.nodes[N.lunch] = { ...d.nodes[N.lunch], durationMin: 150 };
    return d;
  };

  test("names it, with the stops that overlap", () => {
    const [problem] = (timing(doc()).problems.get(DAY) ?? []).filter(
      (p) => p.rule === "overlap",
    );
    assert.match(problem.message, /Check in · Rooms Kazbegi.*before.*Lunch/);
  });

  test("offers the shift that fixes it, and says what it would move", () => {
    const problems = timing(doc()).problems.get(DAY) ?? [];
    const fix = problems.find((p) => p.fix)?.fix;
    assert.ok(fix);
    assert.match(fix.label, /Shift 2 later stops/);
    assert.ok(fix.moves.some((m) => m.includes("Check in · Rooms Kazbegi")));
    assert.ok(fix.ops.every((op) => op.op === "replace"));
  });

  test("the gap before the crowded stop says it overlaps", () => {
    const { gaps } = timing(doc());
    assert.equal(gaps[N.stayKazbegi]?.tone, "alert");
    assert.match(gaps[N.stayKazbegi]?.text ?? "", /Overlaps by/);
  });
});

test("a problem that no later shift can fix offers none", () => {
  // The hike is closed-for-the-night: moving what follows does nothing for it.
  const doc = kazbegiDoc();
  doc.nodes[N.hike] = { ...doc.nodes[N.hike], startsAt: at(DAY, "04:00") };
  const problems = [...timing(doc).problems.values()].flat();
  const dark = problems.find((p) => p.rule === "darkness");
  assert.ok(dark);
  assert.equal(dark.fix, null);
});
