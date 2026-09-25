import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CLOCK_TIME, capForDays, tripDays } from "./settings.ts";

describe("the interrupt budget", () => {
  test("is 3-5 for a week, as planned", () => {
    const cap = capForDays(7);
    assert.ok(cap >= 3 && cap <= 5, `${cap} is between 3 and 5`);
  });

  test("never leaves a short trip with nothing to spend", () => {
    assert.equal(capForDays(1), 2);
    assert.equal(capForDays(2), 2);
  });

  test("does not grow without limit", () => {
    assert.equal(capForDays(30), 6);
    assert.equal(capForDays(365), 6);
  });
});

describe("trip length", () => {
  test("counts the days a trip spans", () => {
    assert.equal(tripDays("2026-10-04T00:00:00Z", "2026-10-11T00:00:00Z"), 7);
  });

  test("a single day is one day, not zero", () => {
    assert.equal(tripDays("2026-10-04T09:00:00Z", "2026-10-04T20:00:00Z"), 1);
  });
});

describe("clock times", () => {
  test("HH:MM on a 24-hour clock, nothing else", () => {
    for (const ok of ["00:00", "07:30", "22:00", "23:59"]) {
      assert.ok(CLOCK_TIME.test(ok), ok);
    }
    for (const bad of ["24:00", "7:30", "07:60", "07:30:00", "noon"]) {
      assert.ok(!CLOCK_TIME.test(bad), bad);
    }
  });
});
