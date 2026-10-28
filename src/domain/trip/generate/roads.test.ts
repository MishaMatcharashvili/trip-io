import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LonLat } from "../../geo.ts";
import { straightLineTravel } from "../travel.ts";
import type { Candidate } from "./plan.ts";
import {
  driveLabel,
  isBigStation,
  longDrives,
  ROAD_STOP_DRIVE_MIN,
  restStops,
} from "./roads.ts";

describe("long drives", () => {
  test("a day trip from Tbilisi to Kutaisi drives the road both ways", () => {
    const drives = longDrives({
      start: "tbilisi",
      places: ["kutaisi"],
      finish: "tbilisi",
    });
    assert.deepEqual(drives.map(driveLabel), [
      "tbilisi > kutaisi",
      "kutaisi > tbilisi",
    ]);
    assert.ok(drives.every((d) => d.minutes >= ROAD_STOP_DRIVE_MIN));
  });

  test("Tbilisi to Batumi is one long drive, and the way back another", () => {
    const drives = longDrives({
      start: "tbilisi",
      places: ["batumi"],
      finish: "tbilisi",
    });
    assert.equal(drives.length, 2);
  });

  test("a drive with no rest due is not long", () => {
    // Tbilisi to Sighnaghi is about two hours.
    assert.deepEqual(
      longDrives({ start: "tbilisi", places: ["signagi"], finish: "tbilisi" }),
      [],
    );
  });

  test("a trip that stays where it starts has no drives at all", () => {
    assert.deepEqual(
      longDrives({ start: "kazbegi", places: ["kazbegi"], finish: "kazbegi" }),
      [],
    );
  });

  test("the same road driven twice the same way is offered once", () => {
    const drives = longDrives({
      start: "tbilisi",
      places: ["kutaisi", "tbilisi", "kutaisi"],
      finish: "kutaisi",
    });
    assert.deepEqual(drives.map(driveLabel), [
      "tbilisi > kutaisi",
      "kutaisi > tbilisi",
    ]);
  });
});

describe("rest stops", () => {
  // Stations on the East–West Highway and on to Batumi, where the catalogue
  // has them.
  const station = (
    id: string,
    name: string,
    lonLat: LonLat,
    brand?: string,
  ): Candidate => ({
    id,
    name,
    category: "gas_station",
    group: "services",
    tier: "verified",
    lonLat,
    openingHours: null,
    outdoor: false,
    area: "",
    areas: [],
    ...(brand ? { brand } : {}),
  });
  const stations = [
    station("as24", "AS 24", [44.027, 42.016]),
    station("wissol-gori", "Wissol", [44.065, 42.016]),
    station("gulf-gori", "Gulf", [44.111, 41.994]),
    station("socar-zestaponi", "Socar Gas Station", [43.018, 42.117]),
    station("socar-argveta", "SOCAR", [42.933, 42.173]),
    station("gulf-samtredia", "Gulf", [42.293, 42.103]),
  ];
  const tbilisi: LonLat = [44.8, 41.695];
  const kutaisi: LonLat = [42.663, 42.26];
  const batumi: LonLat = [41.625, 41.624];
  const stops = (from: LonLat, to: LonLat, at = stations) =>
    restStops(from, to, at, straightLineTravel).map((s) => s.id);

  test("Tbilisi to Kutaisi stops once, at Gori, at a big brand's station", () => {
    assert.deepEqual(stops(tbilisi, kutaisi), ["wissol-gori"]);
  });

  test("Kutaisi to Tbilisi stops at Gori too: it is two hours from either end", () => {
    const [only, ...rest] = stops(kutaisi, tbilisi);
    assert.deepEqual(rest, []);
    assert.ok(only.endsWith("-gori"), only);
  });

  test("Tbilisi to Batumi stops about every two hours, in the order driven", () => {
    const ids = stops(tbilisi, batumi);
    assert.ok(ids.length >= 2, ids.join());
    assert.equal(ids[0], "wissol-gori");
    assert.ok(ids[1].startsWith("socar-"), ids.join());
  });

  test("a big brand is worth a little further, a pump by the road is not worse than nothing", () => {
    assert.deepEqual(
      stops(
        tbilisi,
        kutaisi,
        stations.filter((s) => s.id === "as24"),
      ),
      ["as24"],
    );
  });

  test("with no station where a rest falls due, the drive goes on", () => {
    assert.deepEqual(stops(tbilisi, kutaisi, [stations[3]]), []);
    assert.deepEqual(stops(tbilisi, kutaisi, []), []);
  });

  test("a station off the road being driven is not on the way", () => {
    // Sighnaghi's station is two hours from Tbilisi, in the other direction.
    const signagi = station("signagi", "Wissol", [45.92, 41.62]);
    assert.deepEqual(stops(tbilisi, kutaisi, [signagi]), []);
  });

  test("a chain is known by its brand when its name is a number", () => {
    assert.ok(isBigStation({ name: "Gori 1", brand: "Rompetrol" }));
    assert.ok(isBigStation({ name: "АЗС 16-A", brand: "ლუკოილი" }));
    assert.ok(!isBigStation({ name: "Goodlike" }));
  });

  test("a long drive is one that has a rest due", () => {
    assert.ok(ROAD_STOP_DRIVE_MIN >= 150);
  });
});
