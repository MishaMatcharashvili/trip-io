import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corridors } from "../../domain/catalogue/corridors.ts";
import {
  reportDurations,
  roadConditions,
  roadHazards,
  roadReportInput,
} from "../../domain/watch/road.ts";
import {
  type Callback,
  decode,
  encode,
  type FormState,
  nextStep,
  screen,
  toInput,
} from "./form.ts";

// The road form as data: every button's callback carries the answers so far,
// so the webhook needs no session — which only works if the codec round-trips
// and refuses what it did not write.

const idx = <T>(list: readonly T[], value: T) => list.indexOf(value);
const MILITARY = idx(
  corridors.map((c) => c.slug),
  "military-road",
);
const CLOSED = idx(roadConditions, "closed");
const DELAYS = idx(roadConditions, "delays");
const HAZARD = idx(roadConditions, "hazard");
const REOPENED = idx(roadConditions, "reopened");
const AVALANCHE = idx(roadHazards, "avalanche");
const SIX_HOURS = idx(reportDurations, "6h");

describe("the codec", () => {
  test("every callback the form can write, it can read back", () => {
    const callbacks: Callback[] = [
      { type: "form", state: {} },
      { type: "form", state: { corridor: MILITARY } },
      { type: "form", state: { corridor: MILITARY, condition: CLOSED } },
      {
        type: "form",
        state: { corridor: MILITARY, condition: CLOSED, hazard: null },
      },
      {
        type: "send",
        state: {
          corridor: MILITARY,
          condition: CLOSED,
          hazard: AVALANCHE,
          duration: SIX_HOURS,
        },
      },
      { type: "send", state: { corridor: 0, condition: REOPENED } },
      { type: "cancel" },
      {
        type: "moderate",
        decision: "approve",
        reportId: "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b",
      },
    ];
    for (const callback of callbacks) {
      assert.deepEqual(decode(encode(callback)), callback, encode(callback));
    }
  });

  test("a question skipped is not read as the first answer", () => {
    // A delay asks no cause, so its hazard field is empty — `Number("")` is 0,
    // which would have been an avalanche.
    const state: FormState = { corridor: 0, condition: DELAYS, duration: 1 };
    assert.equal(encode({ type: "send", state }), `s:0:${DELAYS}::1`);
    assert.deepEqual(decode(encode({ type: "send", state })), {
      type: "send",
      state,
    });
  });

  test("the longest callback fits Telegram's 64 bytes", () => {
    const longest = [
      encode({
        type: "send",
        state: { corridor: 11, condition: 4, hazard: 9, duration: 4 },
      }),
      encode({
        type: "moderate",
        decision: "reject",
        reportId: "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b",
      }),
    ];
    for (const data of longest) assert.ok(Buffer.byteLength(data) <= 64, data);
  });

  test("anything it did not write is refused, not guessed at", () => {
    for (const data of [
      "",
      "f:99",
      "f:0:77",
      "f:0:0:x",
      "s:0:0:0:99",
      "m:a:not-a-uuid",
      "m:z:0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b",
      "q:1",
    ]) {
      assert.equal(decode(data), null, data);
    }
  });
});

describe("the steps", () => {
  test("a closure asks why, then for how long", () => {
    const state: FormState = { corridor: MILITARY, condition: CLOSED };
    assert.equal(nextStep(state), "hazard");
    assert.equal(nextStep({ ...state, hazard: null }), "duration");
    assert.equal(
      nextStep({ ...state, hazard: null, duration: SIX_HOURS }),
      "confirm",
    );
  });

  test("a delay skips the cause; a reopening skips everything", () => {
    assert.equal(nextStep({ corridor: 0, condition: DELAYS }), "duration");
    assert.equal(nextStep({ corridor: 0, condition: REOPENED }), "confirm");
  });

  test("a hazard report has to say which hazard", () => {
    const buttons = screen({ corridor: 0, condition: HAZARD }).buttons.flat();
    assert.ok(!buttons.some((b) => b.text === "Don't know"));
    const closed = screen({ corridor: 0, condition: CLOSED }).buttons.flat();
    assert.ok(closed.some((b) => b.text === "Don't know"));
  });

  test("a finished form is the domain's input, and valid", () => {
    const input = toInput({
      corridor: MILITARY,
      condition: CLOSED,
      hazard: AVALANCHE,
      duration: SIX_HOURS,
    });
    assert.deepEqual(input, {
      corridorSlug: "military-road",
      condition: "closed",
      hazard: "avalanche",
      duration: "6h",
    });
    assert.ok(roadReportInput.safeParse(input).success);
    assert.ok(
      roadReportInput.safeParse(toInput({ corridor: 0, condition: REOPENED }))
        .success,
    );
    assert.equal(toInput({ corridor: 0 }), null);
  });

  test("every button on every screen decodes", () => {
    const states: FormState[] = [
      {},
      { corridor: 0 },
      { corridor: 0, condition: CLOSED },
      { corridor: 0, condition: DELAYS },
      { corridor: 0, condition: CLOSED, hazard: 0, duration: 0 },
    ];
    for (const state of states) {
      for (const button of screen(state).buttons.flat()) {
        assert.ok(decode(button.data), `${button.text}: ${button.data}`);
      }
    }
  });
});
