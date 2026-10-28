import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Candidate, Plan } from "./plan.ts";
import {
  driveLabel,
  longDrives,
  ROAD_STOP_DRIVE_MIN,
  unbrokenDrives,
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

  test("a short hop is not broken", () => {
    // Tbilisi to Mtskheta is half an hour.
    assert.deepEqual(
      longDrives({ start: "tbilisi", places: ["mtskheta"], finish: "tbilisi" }),
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

describe("drives with no stop on the way", () => {
  const roadStop = (
    id: string,
    group: Candidate["group"],
    name: string,
  ): Candidate => ({
    id,
    name,
    category: group === "food" ? "restaurant" : "fort",
    group,
    tier: "verified",
    lonLat: [44.108, 41.986],
    openingHours: null,
    outdoor: false,
    area: "tbilisi > kutaisi",
    areas: [],
    roads: ["tbilisi > kutaisi"],
  });
  const places = new Map(
    [
      roadStop("fort", "heritage", "Gori Fortress"),
      roadStop("lunch", "food", "Roadside restaurant"),
    ].map((p) => [p.id, p]),
  );
  const oneWay = { start: "tbilisi", places: ["kutaisi"], finish: "kutaisi" };
  const plan = (placeId: string | null): Plan => ({
    days: [
      {
        day: 1,
        theme: "To Kutaisi",
        stayId: null,
        stops: placeId
          ? [{ placeId, slot: "morning", kind: "visit", durationMin: 60 }]
          : [],
      },
    ],
  });

  test("four hours to Kutaisi without a break is sent back, naming where to stop", () => {
    const [problem] = unbrokenDrives(plan(null), places, oneWay);
    assert.match(problem.message, /drive from Tbilisi to Kutaisi/);
    assert.match(problem.message, /"Gori Fortress"/);
    // Lunch is not what the road is known for.
    assert.doesNotMatch(problem.message, /Roadside restaurant/);
  });

  test("a stop on that road is a break", () => {
    assert.deepEqual(unbrokenDrives(plan("fort"), places, oneWay), []);
  });

  test("with nowhere to stop, there is nothing to ask for", () => {
    assert.deepEqual(unbrokenDrives(plan(null), new Map(), oneWay), []);
  });

  test("a drive short enough to sit through is not sent back", () => {
    // Tbilisi to Sighnaghi is about two hours.
    assert.deepEqual(
      unbrokenDrives(plan(null), places, {
        start: "tbilisi",
        places: ["signagi"],
        finish: "signagi",
      }),
      [],
    );
  });
});
