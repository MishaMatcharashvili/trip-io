import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CIVIL, HORIZON, sunWindow } from "./sun.ts";

const minutesApart = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) / 60_000;

describe("sunWindow", () => {
  test("matches published sunrise and sunset for London on 1 Jan 2000", () => {
    // 08:06 and 16:02 UTC (timeanddate.com).
    const w = sunWindow("2000-01-01", [-0.1276, 51.5072], HORIZON);
    assert.ok(w);
    assert.ok(minutesApart(w.rise, new Date("2000-01-01T08:06:00Z")) < 3);
    assert.ok(minutesApart(w.set, new Date("2000-01-01T16:02:00Z")) < 3);
  });

  test("Kazbegi in mid-September: civil dusk after sunset, on the right date", () => {
    const at = [44.6436, 42.6568] as [number, number];
    const sun = sunWindow("2026-09-16", at, HORIZON);
    const civil = sunWindow("2026-09-16", at, CIVIL);
    assert.ok(sun && civil);
    // Day length a few weeks before the equinox at 42.7°N: ~12h30.
    const dayHours = (sun.set.getTime() - sun.rise.getTime()) / 3_600_000;
    assert.ok(dayHours > 12.2 && dayHours < 12.8, `day length ${dayHours}`);
    // Civil twilight is ~25–30 minutes at this latitude.
    const twilight = minutesApart(civil.set, sun.set);
    assert.ok(twilight > 22 && twilight < 34, `twilight ${twilight}`);
    // Sunset lands in the local evening of the same date (UTC+4).
    assert.equal(sun.set.toISOString().slice(0, 10), "2026-09-16");
    const localHour = (sun.set.getUTCHours() + 4) % 24;
    assert.ok(localHour === 18 || localHour === 19, `sunset hour ${localHour}`);
  });

  test("summer days are longer than winter days", () => {
    const tbilisi = [44.79, 41.715] as [number, number];
    const june = sunWindow("2026-06-21", tbilisi, HORIZON);
    const dec = sunWindow("2026-12-21", tbilisi, HORIZON);
    assert.ok(june && dec);
    const len = (w: { rise: Date; set: Date }) =>
      w.set.getTime() - w.rise.getTime();
    assert.ok(len(june) > len(dec) + 5 * 3_600_000);
  });

  test("null in polar night", () => {
    assert.equal(sunWindow("2026-12-21", [15, 80], CIVIL), null);
  });
});
