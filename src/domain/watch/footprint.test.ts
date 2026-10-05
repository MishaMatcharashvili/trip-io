import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  streetName,
  toFootprint,
} from "./footprint.ts";

const regions = ["Tbilisi", "Kazbegi"];

describe("streetName", () => {
  test("cuts the municipality and the road word", () => {
    assert.equal(streetName("Rustaveli Avenue, Tbilisi", regions), "rustaveli");
    assert.equal(streetName("Agmashenebeli Ave.", regions), "agmashenebeli");
    assert.equal(
      streetName("the Marjanishvili district street", regions),
      "marjanishvili",
    );
  });

  test("a landmark keeps its name", () => {
    assert.equal(streetName("Freedom Square, Tbilisi", regions), "freedom");
  });

  test("a place that names no street, or only a short word, is not searched", () => {
    assert.equal(streetName("Tbilisi", regions), null);
    assert.equal(streetName("Old Tbilisi", regions), null);
    assert.equal(streetName("Kura Street", regions), null);
    assert.equal(streetName("Narnia", regions), null);
  });
});

describe("toFootprint", () => {
  const cluster = { lon: 44.79, lat: 41.7, spreadM: 1500, places: 40 };

  test("uses the spread, within bounds", () => {
    assert.equal(toFootprint("rustaveli", cluster)?.radiusM, 1500);
    assert.equal(
      toFootprint("freedom", { ...cluster, spreadM: 70 })?.radiusM,
      MIN_RADIUS_M,
    );
  });

  test("too few places, or too spread out, is not believed", () => {
    assert.equal(toFootprint("x", { ...cluster, places: 4 }), null);
    assert.equal(
      toFootprint("x", { ...cluster, spreadM: MAX_RADIUS_M + 1 }),
      null,
    );
    assert.equal(toFootprint("x", null), null);
  });
});
