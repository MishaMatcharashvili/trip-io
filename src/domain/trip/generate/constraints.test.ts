import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cacheKey } from "./cache-key.ts";
import { type Constraints, constraints } from "./constraints.ts";

const base: Constraints = {
  startDate: "2026-10-21",
  days: 5,
  areas: ["tbilisi-core", "kazbegi-corridor"],
  pace: "moderate",
  interests: [],
  party: { adults: 1, children: 0 },
  mobility: "moderate",
  budgetEur: 450,
  notes: "",
};

describe("constraints", () => {
  test("a request written before notes existed still parses", () => {
    const { notes: _, ...old } = base;
    assert.equal(constraints.parse(old).notes, "");
  });
});

describe("cacheKey", () => {
  test("different wishes never share a cached plan", () => {
    assert.notEqual(
      cacheKey(base),
      cacheKey({ ...base, notes: "vegetarian, no long drives" }),
    );
  });

  test("the same wishes, spaced or cased differently, do", () => {
    assert.equal(
      cacheKey({ ...base, notes: "Vegetarian,  no long drives " }),
      cacheKey({ ...base, notes: "vegetarian, no long drives" }),
    );
  });

  test("exact dates within a month do not change the key", () => {
    assert.equal(
      cacheKey(base),
      cacheKey({ ...base, startDate: "2026-10-03" }),
    );
  });
});
