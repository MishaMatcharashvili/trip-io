import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cacheKey } from "./cache-key.ts";
import { type Constraints, constraints, routeOf } from "./constraints.ts";

const base: Constraints = {
  startDate: "2026-10-21",
  days: 5,
  places: ["tbilisi", "kazbegi"],
  start: "tbilisi",
  finish: "tbilisi",
  pace: "moderate",
  dayEnds: "20:00",
  interests: [],
  party: { adults: 1, children: 0 },
  mobility: "moderate",
  budgetEur: 450,
  ownCar: false,
  freeNights: 0,
  notes: "",
};

describe("constraints", () => {
  test("a request written before notes existed still parses", () => {
    const { notes: _, ...old } = base;
    assert.equal(constraints.parse(old).notes, "");
  });

  test("a request written before start and finish existed starts and finishes in Tbilisi", () => {
    const { start: _s, finish: _f, ...old } = base;
    const parsed = constraints.parse({ ...old, places: ["signagi"] });
    assert.equal(parsed.start, "tbilisi");
    assert.equal(parsed.finish, "tbilisi");
  });
});

describe("routeOf", () => {
  test("is the start, the places and the finish, in that order", () => {
    assert.deepEqual(
      routeOf({ start: "tbilisi", places: ["signagi"], finish: "tbilisi" }),
      ["tbilisi", "signagi", "tbilisi"],
    );
  });

  test("does not drive from a place to itself", () => {
    assert.deepEqual(routeOf(base), ["tbilisi", "kazbegi", "tbilisi"]);
    assert.deepEqual(
      routeOf({ start: "batumi", places: ["batumi"], finish: "batumi" }),
      ["batumi"],
    );
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

  test("the same places from another start or to another finish are another trip", () => {
    assert.notEqual(cacheKey(base), cacheKey({ ...base, start: "batumi" }));
    assert.notEqual(cacheKey(base), cacheKey({ ...base, finish: "kutaisi" }));
  });

  test("exact dates within a month do not change the key", () => {
    assert.equal(
      cacheKey(base),
      cacheKey({ ...base, startDate: "2026-10-03" }),
    );
  });
});
