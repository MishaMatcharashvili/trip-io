import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Candidate, Plan } from "./plan.ts";
import {
  breakDrives,
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

describe("breaking a drive the plan sits through", () => {
  const at = (
    id: string,
    group: Candidate["group"],
    where: { areas: string[] } | { roads: string[] },
  ): Candidate => ({
    id,
    name: id,
    category: group === "food" ? "restaurant" : "fort",
    group,
    tier: "verified",
    lonLat: [44.108, 41.986],
    openingHours: null,
    outdoor: false,
    area: "",
    areas: "areas" in where ? where.areas : [],
    ...("roads" in where ? { roads: where.roads } : {}),
  });
  const both = { roads: ["tbilisi > kutaisi", "kutaisi > tbilisi"] };
  const places = new Map(
    [
      at("lunch on the road", "food", both),
      at("fortress", "heritage", both),
      at("cave town", "heritage", both),
      at("cathedral", "heritage", { areas: ["kutaisi"] }),
      at("dinner", "food", { areas: ["kutaisi"] }),
    ].map((p) => [p.id, p]),
  );
  const roundTrip = {
    start: "tbilisi",
    places: ["kutaisi"],
    finish: "tbilisi",
  };
  const twoDays: Plan = {
    days: [1, 2].map((day) => ({
      day,
      theme: "Kutaisi",
      stayId: null,
      stops: [
        {
          placeId: "cathedral",
          slot: "afternoon",
          kind: "visit",
          durationMin: 60,
        },
        { placeId: "dinner", slot: "midday", kind: "meal", durationMin: 60 },
      ],
    })),
  };

  test("the way out stops first thing, and the way home last, at the road's first sight", () => {
    const broken = breakDrives(twoDays, places, roundTrip, () => true);
    const [out, home] = broken.days;
    assert.deepEqual(out.stops[0], {
      placeId: "fortress",
      slot: "morning",
      kind: "visit",
      durationMin: 60,
    });
    // And lunch on the way out is on the road, near it, not in Kutaisi.
    assert.deepEqual(
      out.stops.filter((s) => s.kind === "meal").map((s) => s.placeId),
      ["lunch on the road"],
    );
    // Not the fortress again: the cave town, after the day's stops.
    assert.deepEqual(home.stops.at(-1), {
      placeId: "cave town",
      slot: "afternoon",
      kind: "visit",
      durationMin: 60,
    });
  });

  test("lunch stays where it was when the sight fits only without moving it", () => {
    const broken = breakDrives(
      { days: [twoDays.days[0]] },
      places,
      { ...roundTrip, finish: "kutaisi" },
      (plan) =>
        !plan.days[0].stops.some((s) => s.placeId === "lunch on the road"),
    );
    assert.deepEqual(
      broken.days[0].stops.map((s) => s.placeId),
      ["fortress", "cathedral", "dinner"],
    );
  });

  test("a sight that does not fit is passed over for the next", () => {
    const broken = breakDrives(
      { days: [twoDays.days[0]] },
      places,
      { ...roundTrip, finish: "kutaisi" },
      (plan) => !plan.days[0].stops.some((s) => s.placeId === "fortress"),
    );
    assert.equal(broken.days[0].stops[0].placeId, "cave town");
  });

  test("when nothing fits, the plan is as it was", () => {
    assert.equal(
      breakDrives(twoDays, places, roundTrip, () => false),
      twoDays,
    );
  });

  test("a drive the composer already broke is left alone", () => {
    const stopped: Plan = {
      days: [
        {
          ...twoDays.days[0],
          stops: [
            {
              placeId: "cave town",
              slot: "morning",
              kind: "visit",
              durationMin: 45,
            },
            ...twoDays.days[0].stops,
          ],
        },
      ],
    };
    const tried: Plan[] = [];
    breakDrives(stopped, places, { ...roundTrip, finish: "kutaisi" }, (p) => {
      tried.push(p);
      return true;
    });
    assert.deepEqual(tried, []);
  });
});
