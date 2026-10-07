import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { constraints } from "./constraints.ts";
import {
  applyEdit,
  fallbackTurn,
  type IntakeMessage,
  initialState,
  readIntake,
} from "./intake.ts";

const TODAY = "2026-10-07";

const unchanged = {
  reply: "Noted.",
  startDate: null,
  days: null,
  areas: null,
  pace: null,
  interests: null,
  adults: null,
  children: null,
  mobility: null,
  budgetEur: null,
  notes: null,
  unsupported: [],
  ready: false,
};

const said = (text: string): IntakeMessage[] => [{ role: "traveller", text }];

describe("initialState", () => {
  test("is a valid request with nothing said", () => {
    const state = initialState(TODAY);
    assert.deepEqual(state.said, []);
    assert.ok(constraints.safeParse(state.constraints).success);
  });
});

describe("readIntake", () => {
  test("merges what changed and marks it said", () => {
    const turn = readIntake(
      { ...unchanged, days: 3, areas: ["kakheti"], adults: 2 },
      initialState(TODAY),
      TODAY,
    );
    assert.ok(turn);
    assert.equal(turn.state.constraints.days, 3);
    assert.deepEqual(turn.state.constraints.areas, ["kakheti"]);
    assert.deepEqual(turn.state.constraints.party, { adults: 2, children: 0 });
    assert.deepEqual(turn.state.said.sort(), ["areas", "days", "party"]);
  });

  test("an unsaid budget follows the days and the party", () => {
    const turn = readIntake(
      { ...unchanged, days: 3, adults: 2 },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(turn?.state.constraints.budgetEur, 90 * 3 * 2);
  });

  test("a stated budget is left alone when the days change", () => {
    const first = readIntake(
      { ...unchanged, budgetEur: 700 },
      initialState(TODAY),
      TODAY,
    );
    assert.ok(first);
    const second = readIntake({ ...unchanged, days: 9 }, first.state, TODAY);
    assert.equal(second?.state.constraints.budgetEur, 700);
  });

  test("null leaves a field, and what was said, as it was", () => {
    const state = applyEdit(initialState(TODAY), { days: 6 });
    const turn = readIntake(unchanged, state, TODAY);
    assert.deepEqual(turn?.state, state);
  });

  test("clamps what is out of range", () => {
    const turn = readIntake(
      { ...unchanged, days: 60, adults: 0, budgetEur: -5 },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(turn?.state.constraints.days, 21);
    assert.equal(turn?.state.constraints.party.adults, 1);
    assert.equal(turn?.state.constraints.budgetEur, 0);
  });

  test("ignores a start date that is past or not a date", () => {
    const before = initialState(TODAY);
    for (const startDate of ["2026-10-01", "next Tuesday", "2026-13-40"]) {
      const turn = readIntake({ ...unchanged, startDate }, before, TODAY);
      assert.equal(
        turn?.state.constraints.startDate,
        before.constraints.startDate,
      );
      assert.ok(!turn?.state.said.includes("startDate"));
    }
  });

  test("an empty list of areas does not clear them", () => {
    const turn = readIntake(
      { ...unchanged, areas: [], unsupported: ["Batumi"] },
      initialState(TODAY),
      TODAY,
    );
    assert.ok(turn?.state.constraints.areas.length);
    assert.deepEqual(turn?.unsupported, ["Batumi"]);
  });

  test("notes replace the notes, cut to their limit", () => {
    const turn = readIntake(
      { ...unchanged, notes: `vegetarian ${"x".repeat(600)}` },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(turn?.state.constraints.notes.length, 500);
  });

  test("an answer of the wrong shape is refused", () => {
    assert.equal(readIntake({ reply: "hi" }, initialState(TODAY), TODAY), null);
    assert.equal(
      readIntake(
        { ...unchanged, areas: ["batumi"] },
        initialState(TODAY),
        TODAY,
      ),
      null,
    );
  });
});

describe("applyEdit", () => {
  test("a hand correction survives a later turn that does not touch it", () => {
    const edited = applyEdit(initialState(TODAY), { budgetEur: 1200 });
    const turn = readIntake({ ...unchanged, days: 10 }, edited, TODAY);
    assert.equal(turn?.state.constraints.budgetEur, 1200);
  });
});

describe("fallbackTurn", () => {
  test("reads the latest message onto the state", () => {
    const turn = fallbackTurn(
      said("Long weekend in Kakheti with my partner"),
      initialState(TODAY),
      TODAY,
    );
    assert.equal(turn.state.constraints.days, 3);
    assert.deepEqual(turn.state.constraints.areas, ["kakheti"]);
    assert.ok(turn.ready);
    assert.ok(constraints.safeParse(turn.state.constraints).success);
  });

  test("says what it assumed and what it covers", () => {
    const turn = fallbackTurn(
      said("somewhere warm"),
      initialState(TODAY),
      TODAY,
    );
    assert.match(turn.reply, /I assumed the region/);
    assert.match(turn.reply, /Tbilisi, Kazbegi, Kakheti and Svaneti/);
    assert.ok(!turn.ready);
  });

  test("a later message does not undo an earlier one", () => {
    const first = fallbackTurn(
      said("7 days in Svaneti"),
      initialState(TODAY),
      TODAY,
    );
    const second = fallbackTurn(
      [
        ...said("7 days in Svaneti"),
        { role: "planner", text: first.reply },
        { role: "traveller", text: "relaxed pace please" },
      ],
      first.state,
      TODAY,
    );
    assert.equal(second.state.constraints.days, 7);
    assert.deepEqual(second.state.constraints.areas, ["svaneti"]);
    assert.equal(second.state.constraints.pace, "relaxed");
  });

  test("keeps the traveller's words as notes", () => {
    const turn = fallbackTurn(
      said("4 days, vegetarian, no long drives"),
      initialState(TODAY),
      TODAY,
    );
    assert.match(turn.state.constraints.notes, /vegetarian/);
  });
});
