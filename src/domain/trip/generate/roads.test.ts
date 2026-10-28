import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { driveLabel, longDrives, ROAD_STOP_DRIVE_MIN } from "./roads.ts";

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
