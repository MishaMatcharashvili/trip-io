import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { askContext, readAnswer } from "./ask.ts";
import { kazbegiDoc, N, P } from "./test-fixtures.ts";

describe("askContext", () => {
  const context = askContext(
    kazbegiDoc(),
    new Map([
      [P.gergeti, { name: "Gergeti", category: "christian_place_of_worship" }],
    ]),
    [{ nodeId: N.hike, what: "rain 15:30–19:00" }],
  );

  test("one line per stop, grouped by day, in Tbilisi time", () => {
    assert.ok(context.includes("Day 2026-09-16:"));
    assert.ok(
      context.includes(
        "- 16:00 Gergeti Trinity hike (160 min, visit, christian place of worship, outdoors) [watch: rain 15:30–19:00]",
      ),
    );
  });

  test("no ids reach the model", () => {
    assert.ok(!context.includes(N.hike));
    assert.ok(!context.includes(P.gergeti));
  });
});

describe("readAnswer", () => {
  test("holds a reply to the schema", () => {
    assert.deepEqual(readAnswer({ answer: "Yes.", grounded: true }), {
      answer: "Yes.",
      grounded: true,
    });
    assert.equal(readAnswer({ answer: "" }), null);
  });
});
