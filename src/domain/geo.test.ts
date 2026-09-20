import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { haversineM, type LonLat, parseLatLon, simplifyLine } from "./geo.ts";

describe("haversineM", () => {
  test("one degree of latitude is ~111.2 km", () => {
    assert.equal(Math.round(haversineM([44, 41], [44, 42])), 111_195);
  });

  test("zero for the same point", () => {
    assert.equal(haversineM([44.8, 41.7], [44.8, 41.7]), 0);
  });
});

describe("simplifyLine", () => {
  test("collapses collinear points to the endpoints", () => {
    const line: LonLat[] = [
      [44, 41],
      [44.001, 41],
      [44.002, 41],
      [44.003, 41],
    ];
    assert.deepEqual(simplifyLine(line, 5), [line[0], line[3]]);
  });

  test("keeps a bend larger than the tolerance", () => {
    // ~111 m north of the straight line between its neighbours.
    const line: LonLat[] = [
      [44, 41],
      [44.005, 41.001],
      [44.01, 41],
    ];
    assert.equal(simplifyLine(line, 25).length, 3);
    assert.equal(simplifyLine(line, 200).length, 2);
  });

  test("keeps a hairpin that doubles back past the segment end", () => {
    // Goes out 1 km east, then comes back to 200 m from the start. The far point
    // is on the start–end line's extension, so only segment distance sees it.
    const line: LonLat[] = [
      [44, 41],
      [44.012, 41],
      [44.0024, 41],
    ];
    assert.deepEqual(simplifyLine(line, 25), line);
  });
});

describe("parseLatLon", () => {
  test("reads Google Maps' lat, lon order", () => {
    assert.deepEqual(parseLatLon("41.6938, 44.8015"), [44.8015, 41.6938]);
    assert.deepEqual(parseLatLon(" 42.657 44.644 "), [44.644, 42.657]);
  });

  test("rejects points outside Georgia, including a swapped pair", () => {
    assert.equal(parseLatLon("44.8015, 41.6938"), null);
    assert.equal(parseLatLon("48.85, 2.35"), null);
  });

  test("rejects junk", () => {
    assert.equal(parseLatLon("Tbilisi"), null);
    assert.equal(parseLatLon(""), null);
  });
});
