import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { roadSeason } from "./road-season.ts";

describe("roadSeason", () => {
  const military = (month: number) =>
    roadSeason(month).find((r) => r.slug === "military-road");

  test("winter on the Military Road is its worst hazard, in coral", () => {
    assert.deepEqual(military(1), {
      slug: "military-road",
      name: "Georgian Military Road",
      tone: "alert",
      status: "avalanche risk · high",
    });
  });

  test("a month with nothing seasonal says so, in green", () => {
    const quiet = roadSeason(9).filter((r) => r.tone === "ok");
    assert.ok(quiet.length > 0);
  });

  test("every corridor is listed, every month", () => {
    for (let m = 1; m <= 12; m++) assert.equal(roadSeason(m).length, 12);
  });
});
