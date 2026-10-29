import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Constraints } from "./constraints.ts";
import {
  advice,
  assess,
  assessAsked,
  reasons,
  routeLegs,
} from "./feasibility.ts";

const trip = (over: Partial<Constraints> = {}): Constraints => ({
  startDate: "2026-07-10",
  days: 7,
  places: ["tbilisi", "kazbegi"],
  start: "tbilisi",
  finish: "tbilisi",
  pace: "moderate",
  dayEnds: "20:00",
  interests: [],
  party: { adults: 2, children: 0 },
  mobility: "moderate",
  budgetEur: 1400,
  ownCar: false,
  freeNights: 0,
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

  test("a round trip to one place is a day trip: the start and finish are drives, not days", () => {
    const roundTrip = trip({
      days: 1,
      places: ["signagi"],
      start: "tbilisi",
      finish: "tbilisi",
    });
    const a = assess(roundTrip);
    assert.ok(a.possible, reasons(a).join(" "));
    // About two hours each way is worth saying, not refusing.
    assert.equal(a.days.level, "tight");
    assert.ok(assess({ ...roundTrip, days: 2 }).possible);
  });

  test("a one-way trip to one place fits in a day", () => {
    const oneWay = trip({
      days: 1,
      places: ["signagi"],
      start: "tbilisi",
      finish: "signagi",
    });
    assert.ok(assess(oneWay).possible);
  });

  test("a place that is also the start still needs its own day", () => {
    const a = assess(
      trip({ days: 1, places: ["tbilisi", "signagi"], finish: "signagi" }),
    );
    assert.equal(a.days.level, "impossible");
    assert.match(a.days.why ?? "", /Tbilisi → Sighnaghi.* 2 stops in 1 day/);
  });

  test("a drive that eats the whole day needs a day of its own", () => {
    const places = ["batumi", "lagodekhi"];
    assert.ok(routeLegs(places)[0].minutes > 8 * 60);
    const ends = { start: "batumi", finish: "lagodekhi" };
    const a = assess(trip({ days: 2, places, ...ends }));
    assert.equal(a.days.level, "impossible");
    assert.match(a.days.why ?? "", /Batumi to Lagodekhi/);
    assert.equal(
      assess(trip({ days: 3, places, ...ends })).days.level,
      "tight",
    );
  });

  test("a lot of road for the days is said, not refused", () => {
    const a = assess(
      trip({ days: 3, places: ["tbilisi", "mestia", "batumi"] }),
    );
    assert.equal(a.days.level, "tight");
    assert.match(a.days.note, /of driving/);
    assert.ok(a.possible);
  });

  test("a budget under what a day costs is advice, never a refusal", () => {
    const a = assess(trip({ budgetEur: 100 }));
    assert.equal(a.budget.level, "tight");
    assert.ok(a.possible);
    assert.deepEqual(reasons(a), []);
    assert.match(a.budget.note, /Usually at least €4\d0/);
    const [said] = advice(a);
    assert.match(said ?? "", /€100 for 2 people over 7 days/);
    assert.match(said ?? "", /tends to need about €4\d0/);
    assert.match(said ?? "", /If you have a car or somewhere free to stay/);
  });

  test("a thin budget is tight; a child costs less than an adult", () => {
    assert.equal(assess(trip({ budgetEur: 500 })).budget.level, "tight");
    const family = trip({
      budgetEur: 700,
      party: { adults: 2, children: 2 },
      places: ["tbilisi"],
    });
    assert.equal(assess(family).budget.advice, undefined);
    assert.ok(
      assess({ ...family, party: { adults: 4, children: 0 } }).budget.advice,
    );
  });

  test("transport between far places counts against the budget", () => {
    const near = trip({ days: 4, budgetEur: 250, places: ["tbilisi"] });
    assert.equal(assess(near).budget.advice, undefined);
    assert.ok(
      assess({ ...near, places: ["tbilisi", "mestia", "batumi", "tbilisi"] })
        .budget.advice,
    );
  });

  test("a car of their own and free nights bring the sum down", () => {
    const big = trip({
      days: 2,
      budgetEur: 160,
      places: ["signagi"],
      party: { adults: 7, children: 0 },
    });
    const least = (c: Constraints) =>
      Number(assess(c).budget.note.replace(/\D/g, ""));
    const usual = least(big);
    const driving = least({ ...big, ownCar: true });
    const staying = least({ ...big, ownCar: true, freeNights: 2 });
    assert.ok(driving < usual);
    assert.ok(staying < driving);
    assert.match(
      assess({ ...big, ownCar: true, freeNights: 2 }).budget.advice ?? "",
      /even with your own car and 2 free nights/,
    );
  });

  test("a budget that covers the floor once free nights are counted says nothing", () => {
    const c = trip({ days: 4, budgetEur: 200, places: ["tbilisi"] });
    assert.ok(assess(c).budget.advice);
    assert.equal(assess({ ...c, freeNights: 4 }).budget.advice, undefined);
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

  test("a place the planner could not take is refused, known or not", () => {
    const known = assessAsked(trip(), ["Sukhumi"]);
    assert.equal(known.possible, false);
    const unknown = assessAsked(trip(), ["Atlantis"]);
    assert.match(reasons(unknown)[0] ?? "", /inside Georgia/);
    assert.equal(assessAsked(trip()).possible, assess(trip()).possible);
  });
});
