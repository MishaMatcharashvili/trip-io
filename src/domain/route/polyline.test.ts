import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LonLat } from "../geo.ts";
import { decodePolyline, encodePolyline } from "./polyline.ts";

describe("decodePolyline", () => {
  // The worked example in Google's polyline algorithm documentation.
  test("reads Google's reference polyline, latitude first on the wire", () => {
    const path = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    assert.deepEqual(path, [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  test("returns longitude first: Tbilisi is 44.8, 41.7, not 41.7, 44.8", () => {
    const tbilisi: LonLat = [44.8271, 41.7151];
    const [decoded] = decodePolyline(encodePolyline([tbilisi]));
    assert.deepEqual(decoded, tbilisi);
    assert.ok(decoded[0] > decoded[1]);
  });

  test("round-trips a bendy road with negative and repeated deltas", () => {
    const road: LonLat[] = [
      [44.82712, 41.71512],
      [44.82698, 41.71533],
      [44.82698, 41.71533],
      [44.83001, 41.7101],
      [44.80112, 41.69878],
    ];
    assert.deepEqual(decodePolyline(encodePolyline(road)), road);
  });

  test("an empty string is an empty path", () => {
    assert.deepEqual(decodePolyline(""), []);
  });

  test("refuses a truncated or corrupt polyline instead of guessing", () => {
    const whole = encodePolyline([[44.8, 41.7]]);
    assert.throws(() => decodePolyline(whole.slice(0, -1)));
    assert.throws(() => decodePolyline("_p~iF"));
    assert.throws(() => decodePolyline("\u0001\u0002"));
  });
});
