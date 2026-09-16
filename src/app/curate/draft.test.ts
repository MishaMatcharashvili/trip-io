import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildPlaceInput, emptyDraft, type PlaceDraft } from "./draft.ts";

const filled = (patch: Partial<PlaceDraft> = {}): PlaceDraft => ({
  ...emptyDraft(),
  name: "Fabrika",
  category: "cafe",
  position: "41.7093, 44.8027",
  ...patch,
});

describe("buildPlaceInput", () => {
  test("an untouched draft reports every missing field", () => {
    const result = buildPlaceInput(emptyDraft());
    assert.equal(result.ok, false);
    assert.deepEqual(
      Object.keys((result as { errors: object }).errors).sort(),
      ["category", "hours", "name", "position"],
    );
  });

  test("unset hours are an error, never an implicit 'closed'", () => {
    const result = buildPlaceInput(filled());
    assert.equal(result.ok, false);
    assert.ok((result as { errors: { hours?: string } }).errors.hours);
  });

  test("a blank day is an error; 'closed' is explicit", () => {
    const days = {
      mon: "closed",
      tue: "10-22",
      wed: "10-22",
      thu: "10-22",
      fri: "10-22",
      sat: "10:00-02:00",
      sun: "",
    };
    const blank = buildPlaceInput(
      filled({ hours: { kind: "weekly", days, months: [], note: "" } }),
    );
    assert.equal(blank.ok, false);
    assert.deepEqual(Object.keys((blank as { errors: object }).errors), [
      "sun",
    ]);

    const ok = buildPlaceInput(
      filled({
        hours: {
          kind: "weekly",
          days: { ...days, sun: "12-22" },
          months: [],
          note: "",
        },
      }),
    );
    assert.ok(ok.ok);
    assert.deepEqual(ok.value.openingHours, {
      kind: "weekly",
      days: {
        mon: [],
        tue: [{ open: "10:00", close: "22:00" }],
        wed: [{ open: "10:00", close: "22:00" }],
        thu: [{ open: "10:00", close: "22:00" }],
        fri: [{ open: "10:00", close: "22:00" }],
        sat: [{ open: "10:00", close: "02:00" }],
        sun: [{ open: "12:00", close: "22:00" }],
      },
      months: undefined,
      note: undefined,
    });
    assert.deepEqual([ok.value.lon, ok.value.lat], [44.8027, 41.7093]);
    assert.equal(ok.value.nameKa, null);
  });

  test("always-open with a season sorts the months", () => {
    const result = buildPlaceInput(
      filled({
        category: "lake",
        hours: {
          kind: "always",
          days: emptyDraft().hours.days,
          months: [9, 6, 8, 7],
          note: " road closes in October ",
        },
      }),
    );
    assert.ok(result.ok);
    assert.deepEqual(result.value.openingHours, {
      kind: "always",
      months: [6, 7, 8, 9],
      note: "road closes in October",
    });
  });
});
