import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cacheKey } from "./cache-key.ts";
import {
  type Constraints,
  constraints,
  MAX_MUST_SEE,
  pinSight,
  routeOf,
  sightsOnRoute,
} from "./constraints.ts";

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
  mustSee: [],
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

const bodbe = {
  id: "7f3c1a52-0b8e-4c3e-9a1d-2f6b8e4d1c90",
  name: "Bodbe Monastery",
  place: "signagi",
};

describe("pinSight", () => {
  test("a sight brings its destination onto the route", () => {
    const pinned = pinSight({ ...base, places: ["tbilisi"] }, bodbe);
    assert.deepEqual(pinned.places, ["tbilisi", "signagi"]);
    assert.deepEqual(pinned.mustSee, [bodbe]);
  });

  test("a sight in a place already on the route leaves the route alone", () => {
    const pinned = pinSight({ ...base, places: ["signagi"] }, bodbe);
    assert.deepEqual(pinned.places, ["signagi"]);
  });

  test("a sight pinned twice is pinned once", () => {
    const once = pinSight(base, bodbe);
    assert.equal(pinSight(once, bodbe), once);
  });

  test("a full list of sights or a full route is left as it was", () => {
    const sight = (i: number) => ({
      ...bodbe,
      id: `7f3c1a52-0b8e-4c3e-9a1d-2f6b8e4d1c${String(i).padStart(2, "0")}`,
    });
    const full = {
      ...base,
      mustSee: Array.from({ length: MAX_MUST_SEE }, (_, i) => sight(i)),
    };
    assert.equal(pinSight(full, sight(99)), full);
    const longRoute = {
      ...base,
      places: [
        "tbilisi",
        "kazbegi",
        "kutaisi",
        "mestia",
        "batumi",
        "borjomi",
        "gori",
        "telavi",
      ],
    };
    assert.equal(pinSight(longRoute, bodbe), longRoute);
  });

  test("a request written before must-sees existed still parses", () => {
    const { mustSee: _, ...old } = base;
    assert.deepEqual(constraints.parse(old).mustSee, []);
  });
});

describe("sightsOnRoute", () => {
  test("lets go of a sight whose destination left the route", () => {
    const pinned = pinSight(base, bodbe);
    assert.deepEqual(sightsOnRoute(pinned), [bodbe]);
    assert.deepEqual(sightsOnRoute({ ...pinned, places: ["tbilisi"] }), []);
  });
});
