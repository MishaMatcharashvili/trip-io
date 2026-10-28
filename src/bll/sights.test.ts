import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEdit, initialState } from "../domain/trip/generate/intake.ts";
import { sightsInPlay } from "./sights.ts";

const rows = [
  { name: "Bagrati Cathedral", category: "christian_place_of_worship" },
  { name: "Sataplia Nature Reserve", category: "nature_reserve" },
  { name: "Kutaisi State Historical Museum", category: "museum" },
  { name: "Chateau Khutsuri", category: "winery" },
  { name: "Bagrati Cathedral", category: "christian_place_of_worship" },
];

describe("sightsInPlay", () => {
  test("the places the latest message names, by what each sight is for", async () => {
    const asked: string[][] = [];
    const sights = await sightsInPlay(
      initialState("2026-10-28"),
      "one day trip to kutaisi",
      async (_match, categories) => {
        asked.push([...categories]);
        return rows;
      },
    );
    assert.deepEqual(sights, {
      Kutaisi: {
        heritage: ["Bagrati Cathedral"],
        nature: ["Sataplia Nature Reserve"],
        culture: ["Kutaisi State Historical Museum"],
        food: ["Chateau Khutsuri"],
      },
    });
    assert.ok(!asked[0]?.includes("restaurant"));
    assert.ok(!asked[0]?.includes("theatre_venue"));
  });

  test("the default route is nobody's, so there is nothing to recommend", async () => {
    const sights = await sightsInPlay(
      initialState("2026-10-28"),
      "a bit of everything",
      async () => rows,
    );
    assert.deepEqual(sights, {});
  });

  test("the route the traveller gave stays in play after the message that gave it", async () => {
    const state = applyEdit(initialState("2026-10-28"), {
      places: ["signagi"],
    });
    const sights = await sightsInPlay(state, "food and wine", async () => []);
    assert.deepEqual(Object.keys(sights), ["Sighnaghi"]);
  });
});
