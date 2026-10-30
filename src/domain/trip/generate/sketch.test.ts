import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Constraints } from "./constraints.ts";
import { shareDays, sketchTrip } from "./sketch.ts";

const trip = (over: Partial<Constraints> = {}): Constraints => ({
  startDate: "2026-11-02",
  days: 1,
  places: ["signagi"],
  start: "tbilisi",
  finish: "tbilisi",
  pace: "moderate",
  dayEnds: "20:00",
  interests: [],
  party: { adults: 2, children: 0 },
  mobility: "moderate",
  budgetEur: 300,
  ownCar: false,
  freeNights: 0,
  mustSee: [],
  notes: "",
  ...over,
});

describe("shareDays", () => {
  test("evenly, with the days left over going to the first places", () => {
    assert.deepEqual(shareDays(5, ["tbilisi", "kazbegi"]), [
      "tbilisi",
      "tbilisi",
      "tbilisi",
      "kazbegi",
      "kazbegi",
    ]);
  });

  test("fewer days than places leaves the last ones out", () => {
    assert.deepEqual(shareDays(1, ["tbilisi", "kazbegi"]), ["tbilisi"]);
  });
});

describe("sketchTrip", () => {
  test("a day trip drives out and back on its one day, and runs until it ends", () => {
    const s = sketchTrip(trip());
    assert.equal(s.days.length, 1);
    const [day] = s.days;
    assert.equal(day.place, "signagi");
    assert.deepEqual(
      day.drives.map((d) => [d.from, d.to]),
      [
        ["tbilisi", "signagi"],
        ["signagi", "tbilisi"],
      ],
    );
    assert.equal(day.starts, "09:00");
    assert.equal(day.ends, "20:00");
    assert.equal(
      s.driveMinutes,
      day.drives.reduce((sum, d) => sum + d.minutes, 0),
    );
  });

  test("a day in the place it starts from drives nowhere until it moves on", () => {
    const s = sketchTrip(
      trip({ days: 4, places: ["tbilisi", "kazbegi"], budgetEur: 720 }),
    );
    assert.deepEqual(
      s.days.map((d) => [d.date, d.place, d.drives.map((l) => l.to)]),
      [
        ["2026-11-02", "tbilisi", []],
        ["2026-11-03", "tbilisi", []],
        ["2026-11-04", "kazbegi", ["kazbegi"]],
        ["2026-11-05", "kazbegi", ["tbilisi"]],
      ],
    );
    assert.equal(s.perPersonDay, 90);
    assert.equal(s.people, 2);
  });

  test("the pace sets when the days start, and the request when they end", () => {
    const [day] = sketchTrip(trip({ pace: "packed", dayEnds: "22:00" })).days;
    assert.equal(day.starts, "08:00");
    assert.equal(day.ends, "22:00");
  });
});
