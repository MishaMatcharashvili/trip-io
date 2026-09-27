import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { haversineM, type LonLat } from "../geo.ts";
import { roadLegs, splitLine, straightLegs } from "./legs.ts";

const lengthOf = (line: LonLat[]) =>
  line.slice(1).reduce((s, p, i) => s + haversineM(line[i], p), 0);

describe("straightLegs", () => {
  test("one leg between each pair of consecutive points", () => {
    const a: LonLat = [44, 41];
    const b: LonLat = [44.1, 41];
    const c: LonLat = [44.2, 41.1];
    assert.deepEqual(straightLegs([a, b, c]), [
      [a, b],
      [b, c],
    ]);
  });

  test("no legs for a single stop", () => {
    assert.deepEqual(straightLegs([[44, 41]]), []);
  });
});

describe("splitLine", () => {
  // Due east, 0.1° a step: four equal segments.
  const line: LonLat[] = [
    [44.0, 41],
    [44.1, 41],
    [44.2, 41],
    [44.3, 41],
    [44.4, 41],
  ];

  test("cuts at vertices when the lengths land on them", () => {
    const quarter = lengthOf(line) / 4;
    const legs = splitLine(line, [quarter, quarter * 3]);
    assert.deepEqual(legs, [line.slice(0, 2), line.slice(1)]);
  });

  test("interpolates a cut between vertices", () => {
    const half = lengthOf(line) / 2;
    const [first, second] = splitLine(line, [half * 0.75, half * 1.25]);
    const cut = first[first.length - 1];
    assert.ok(Math.abs(cut[0] - 44.15) < 1e-6, `cut at ${cut[0]}`);
    assert.deepEqual(second[0], cut);
    assert.deepEqual(second[second.length - 1], line[4]);
  });

  test("scales the router's lengths to the line's own", () => {
    // The router says 1 km + 3 km; the line is much longer. Same fractions.
    const [first] = splitLine(line, [1000, 3000]);
    assert.deepEqual(first, line.slice(0, 2));
  });

  test("an out-and-back drive cuts at the far end, not the first pass", () => {
    // Up the valley to the monastery and back down past the same road.
    const out: LonLat[] = [
      [44.0, 41],
      [44.1, 41],
      [44.2, 41],
      [44.1, 41.0001],
      [44.0, 41.0001],
    ];
    const total = lengthOf(out);
    const [up, down] = splitLine(out, [total / 2, total / 2]);
    const cut = up[up.length - 1];
    assert.ok(Math.abs(cut[0] - 44.2) < 1e-6, `cut at ${cut[0]}`);
    assert.deepEqual(down[0], cut);
  });

  test("a zero-length leg (breakfast where you slept) is a point", () => {
    const legs = splitLine(line, [0, lengthOf(line)]);
    assert.deepEqual(legs[0], [line[0]]);
    assert.deepEqual(legs[1], line);
  });
});

describe("roadLegs", () => {
  test("ties each leg to its stops at both ends", () => {
    const stops: LonLat[] = [
      [44.0, 41.001],
      [44.4, 41.001],
    ];
    const road: LonLat[] = [
      [44.0, 41],
      [44.2, 41],
      [44.4, 41],
    ];
    const [leg] = roadLegs(stops, { line: road, legsM: [1] });
    assert.deepEqual(leg, [stops[0], ...road, stops[1]]);
  });
});
