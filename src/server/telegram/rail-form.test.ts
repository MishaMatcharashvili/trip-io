import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  decodeRail,
  encodeRail,
  railScreen,
  toRailInput,
} from "./rail-form.ts";

describe("the rail form codec", () => {
  test("round-trips every step", () => {
    for (const state of [
      {},
      { route: 1 },
      { route: 1, condition: 0 },
      { route: 3, condition: 1, duration: 2 },
    ]) {
      for (const type of ["rail-form", "rail-send"] as const) {
        const data = encodeRail({ type, state });
        assert.deepEqual(decodeRail(data), { type, state });
        assert.ok(Buffer.byteLength(data) <= 64);
      }
    }
  });

  test("anything out of range or out of shape is null", () => {
    assert.equal(decodeRail("rf:99"), null);
    assert.equal(decodeRail("rf:0:9"), null);
    assert.equal(decodeRail("rf:a"), null);
    assert.equal(decodeRail("f:0"), null);
    assert.equal(decodeRail("x"), null);
  });
});

describe("the rail form steps", () => {
  test("asks line, then condition, then duration, then confirms", () => {
    assert.match(railScreen({}).text, /Which line/);
    assert.match(railScreen({ route: 0 }).text, /what are the trains doing/);
    assert.match(railScreen({ route: 0, condition: 0 }).text, /For how long/);
    assert.match(
      railScreen({ route: 0, condition: 0, duration: 0 }).text,
      /Send this/,
    );
  });

  test("running normally skips the duration", () => {
    const state = { route: 0, condition: 2 };
    assert.deepEqual(toRailInput(state)?.condition, "running");
    assert.match(railScreen(state).text, /Send this/);
  });

  test("an unfinished form is not an input", () => {
    assert.equal(toRailInput({ route: 0 }), null);
    assert.equal(toRailInput({ route: 0, condition: 0 }), null);
  });
});
