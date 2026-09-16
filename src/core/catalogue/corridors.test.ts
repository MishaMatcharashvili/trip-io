import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { haversineM, inGeorgiaBbox, type LonLat } from "../geo.ts";
import { corridors, seasonRisk } from "./corridors.ts";

const geo = JSON.parse(
  readFileSync(new URL("./corridors.geo.json", import.meta.url), "utf8"),
) as {
  features: {
    properties: { slug: string; distanceM: number };
    geometry: { type: string; coordinates: LonLat[] };
  }[];
};

describe("corridors", () => {
  test("there are 12, with unique slugs", () => {
    assert.equal(corridors.length, 12);
    assert.equal(new Set(corridors.map((c) => c.slug)).size, 12);
  });

  test("season risk annotations are well-formed", () => {
    for (const c of corridors) {
      assert.doesNotThrow(() => seasonRisk.parse(c.seasonRisk), c.slug);
      assert.ok(c.seasonRisk.length > 0, `${c.slug} has no season risk`);
    }
  });

  test("the geometry file matches the definitions", () => {
    assert.deepEqual(
      geo.features.map((f) => f.properties.slug).sort(),
      corridors.map((c) => c.slug).sort(),
    );
  });

  for (const c of corridors) {
    test(`${c.slug}: routed line starts and ends at its waypoints, inside Georgia`, () => {
      const feature = geo.features.find((f) => f.properties.slug === c.slug);
      assert.ok(feature);
      const line = feature.geometry.coordinates;
      assert.equal(feature.geometry.type, "LineString");
      assert.ok(line.length >= 2);
      assert.ok(
        line.every(inGeorgiaBbox),
        "a vertex is outside Georgia's bbox",
      );

      const [, firstLon, firstLat] = c.waypoints[0];
      const [, lastLon, lastLat] = c.waypoints[c.waypoints.length - 1];
      assert.ok(haversineM(line[0], [firstLon, firstLat]) < 1000, "start");
      assert.ok(
        haversineM(line[line.length - 1], [lastLon, lastLat]) < 1000,
        "end",
      );

      // A route far longer than the straight-line hops between its waypoints
      // is a detour: the car profile first sent Lentekhi -> Ushguli round via
      // Mestia, 298 km for a 27 km hop (11x). Real mountain roads stay under
      // ~3x (the Zagari Pass itself is 2.7x).
      let straight = 0;
      for (let i = 1; i < c.waypoints.length; i++) {
        const [, aLon, aLat] = c.waypoints[i - 1];
        const [, bLon, bLat] = c.waypoints[i];
        straight += haversineM([aLon, aLat], [bLon, bLat]);
      }
      assert.ok(
        feature.properties.distanceM < straight * 4,
        `${Math.round(feature.properties.distanceM / 1000)} km routed vs ${Math.round(straight / 1000)} km straight`,
      );
    });
  }
});
