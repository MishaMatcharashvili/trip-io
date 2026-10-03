import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Day } from "../data/trip.ts";
import { chipsFor, hrefFor } from "./day-strip-model.ts";

const day = (over: Partial<Day>): Day => ({
  id: "3",
  index: 3,
  stamp: "D3 · TUE 16",
  title: "Tuesday 16 Sep",
  route: "Gudauri → Kazbegi",
  summary: "x",
  checkpoints: [],
  shape: [],
  watch: { tone: "ok", label: "Watching" },
  state: "future",
  ...over,
});

describe("chipsFor", () => {
  const days = [
    day({
      id: "1",
      index: 1,
      stamp: "D1 · SUN 14",
      state: "past",
      route: "Tbilisi",
    }),
    day({ id: "2", index: 2, stamp: "D2 · MON 15 · TODAY", state: "today" }),
    day({
      id: "3",
      stamp: "D3 · TUE 16",
      watch: { tone: "alert", label: "1 to check" },
    }),
  ];

  test("begins with the whole trip, then one chip per day", () => {
    const chips = chipsFor(days);
    assert.deepEqual(
      chips.map((c) => c.id),
      ["all", "1", "2", "3"],
    );
    assert.equal(chips[0].top, "All");
  });

  test("a day is its weekday over its date, read from its stamp", () => {
    const [, one, two, three] = chipsFor(days);
    assert.deepEqual([one.top, one.bottom], ["Sun", "14"]);
    assert.deepEqual([two.top, two.bottom], ["Mon", "15"]);
    assert.deepEqual([three.top, three.bottom], ["Tue", "16"]);
  });

  test("today is marked, whatever else is on the stamp", () => {
    const chips = chipsFor(days);
    assert.equal(chips.find((c) => c.id === "2")?.today, true);
    assert.equal(chips.find((c) => c.id === "3")?.today, false);
  });

  test("a day with something to decide carries the one coral dot", () => {
    const chips = chipsFor(days);
    assert.equal(chips.find((c) => c.id === "3")?.trouble, true);
    assert.equal(chips.find((c) => c.id === "1")?.trouble, false);
  });

  test("the label says everything the chip abbreviates", () => {
    const chips = chipsFor(days);
    assert.match(
      chips.find((c) => c.id === "3")?.label ?? "",
      /Day 3.*Tuesday 16.*Gudauri → Kazbegi/,
    );
    assert.match(chips[0].label, /whole trip/i);
  });

  test("a stamp it cannot read falls back to the day's number, not a blank", () => {
    const [, only] = chipsFor([day({ id: "9", index: 9, stamp: "???" })]);
    assert.equal(only.top, "Day");
    assert.equal(only.bottom, "9");
  });

  test("a trip with no days has only the whole-trip chip", () => {
    assert.deepEqual(
      chipsFor([]).map((c) => c.id),
      ["all"],
    );
  });
});

describe("hrefFor", () => {
  test("is the map with the day named, which the server reads", () => {
    assert.equal(hrefFor("t1", "3"), "/trips/t1?day=3");
    assert.equal(hrefFor("t1", "all"), "/trips/t1?day=all");
  });
});
