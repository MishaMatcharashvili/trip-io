import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { settledValue, typedValue } from "./number-draft.ts";

const adults = { min: 1, max: 12 };

describe("typedValue", () => {
  test("an empty box passes nothing on, so it can stay empty", () => {
    assert.equal(typedValue("", adults), null);
  });

  test("a number in range is passed on as it is typed", () => {
    assert.equal(typedValue("4", adults), 4);
    assert.equal(typedValue("12", adults), 12);
  });

  test("a number out of range waits for the field to be left", () => {
    assert.equal(typedValue("0", adults), null);
    assert.equal(typedValue("40", adults), null);
  });

  test("half-typed text is not a number", () => {
    assert.equal(typedValue("-", adults), null);
    assert.equal(typedValue("1.", adults), null);
  });
});

describe("settledValue", () => {
  test("an empty box goes back to the last good value", () => {
    assert.equal(settledValue("", adults, 3), 3);
  });

  test("out of range is clamped when the field is left", () => {
    assert.equal(settledValue("0", adults, 3), 1);
    assert.equal(settledValue("40", adults, 3), 12);
  });

  test("zero children is a real answer", () => {
    assert.equal(settledValue("0", { min: 0, max: 12 }, 2), 0);
  });
});
