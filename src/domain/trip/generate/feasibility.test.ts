import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Constraints } from "./constraints.ts";
import { assess, reasons, routeLegs } from "./feasibility.ts";

const trip = (over: Partial<Constraints> = {}): Constraints => ({
  startDate: "2026-07-10",
  days: 7,
  places: ["tbilisi", "kazbegi"],
  pace: "moderate",
  interests: [],
  party: { adults: 2, children: 0 },
  mobility: "moderate",
  budgetEur: 1400,
  notes: "",
  ...over,
});

describe("assess", () => {
  test("an ordinary trip is possible, and says nothing", () => {
    const a = assess(trip());
    assert.ok(a.possible);
    assert.deepEqual(reasons(a), []);
    assert.equal(a.budget.level, "ok");
  });

  test("more places than days cannot be done", () => {
    const a = assess(
      trip({ days: 2, places: ["tbilisi", "kutaisi", "batumi"] }),
    );
    assert.equal(a.days.level, "impossible");
    assert.match(a.days.why ?? "", /3 stops in 2 days/);
    assert.ok(!a.possible);
  });

  test("a drive that eats the whole day needs a day of its own", () => {
    const places = ["batumi", "lagodekhi"];
    assert.ok(routeLegs(places)[0].minutes > 8 * 60);
    const a = assess(trip({ days: 2, places }));
    assert.equal(a.days.level, "impossible");
    assert.match(a.days.why ?? "", /Batumi to Lagodekhi/);
    assert.equal(assess(trip({ days: 3, places })).days.level, "tight");
  });

  test("a lot of road for the days is said, not refused", () => {
    const a = assess(
      trip({ days: 3, places: ["tbilisi", "mestia", "batumi"] }),
    );
    assert.equal(a.days.level, "tight");
    assert.match(a.days.note, /of driving/);
    assert.ok(a.possible);
  });

  test("a budget under what a day costs is refused, with the sum that works", () => {
    const a = assess(trip({ budgetEur: 100 }));
    assert.equal(a.budget.level, "impossible");
    assert.match(a.budget.why ?? "", /€100 for 2 people over 7 days/);
    assert.match(a.budget.why ?? "", /Raise the budget to €4\d0/);
    assert.match(a.budget.why ?? "", /cut the trip to 2 days|€30/);
  });

  test("a thin budget is tight; a child costs less than an adult", () => {
    assert.equal(assess(trip({ budgetEur: 500 })).budget.level, "tight");
    const family = trip({
      budgetEur: 700,
      party: { adults: 2, children: 2 },
      places: ["tbilisi"],
    });
    assert.equal(assess(family).budget.level, "tight");
    assert.equal(
      assess({ ...family, party: { adults: 4, children: 0 } }).budget.level,
      "impossible",
    );
  });

  test("transport between far places counts against the budget", () => {
    const near = trip({ days: 4, budgetEur: 250, places: ["tbilisi"] });
    assert.equal(assess(near).budget.level, "tight");
    assert.equal(
      assess({ ...near, places: ["tbilisi", "mestia", "batumi", "tbilisi"] })
        .budget.level,
      "impossible",
    );
  });

  test("a place the season closes is refused for those months only", () => {
    const winter = assess(
      trip({ startDate: "2027-02-01", places: ["tbilisi", "tusheti"] }),
    );
    assert.equal(winter.places.level, "impossible");
    assert.match(winter.places.why ?? "", /Abano Pass/);
    assert.equal(
      assess(trip({ places: ["tbilisi", "tusheti"] })).places.level,
      "ok",
    );
  });

  test("a place out of reach is refused with its reason", () => {
    const a = assess(trip(), [{ name: "Sukhumi", why: "no way in" }]);
    assert.equal(a.places.level, "impossible");
    assert.deepEqual(reasons(a).length, 1);
  });
});
