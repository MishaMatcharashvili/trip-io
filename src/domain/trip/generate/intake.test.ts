import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { constraints } from "./constraints.ts";
import {
  applyEdit,
  fallbackTurn,
  INTAKE_MAX_QUESTIONS,
  type IntakeMessage,
  initialState,
  readIntake,
} from "./intake.ts";

const TODAY = "2026-10-07";

const unchanged = {
  reply: "Noted.",
  startDate: null,
  days: null,
  places: null,
  start: null,
  finish: null,
  pace: null,
  interests: null,
  adults: null,
  children: null,
  mobility: null,
  budgetEur: null,
  notes: null,
  unsupported: [],
  ready: false,
  suggestions: [],
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
      { ...unchanged, days: 3, places: ["kakheti"], adults: 2 },
      initialState(TODAY),
      TODAY,
    );
    assert.ok(turn);
    assert.equal(turn.state.constraints.days, 3);
    assert.deepEqual(turn.state.constraints.places, ["kakheti"]);
    assert.deepEqual(turn.state.constraints.party, { adults: 2, children: 0 });
    assert.deepEqual(turn.state.said.sort(), ["days", "party", "places"]);
  });

  test("a trip starts and finishes in Tbilisi until the planner says otherwise", () => {
    const first = readIntake(
      { ...unchanged, places: ["signagi"] },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(first?.state.constraints.start, "tbilisi");
    assert.equal(first?.state.constraints.finish, "tbilisi");
    assert.ok(!first?.state.said.includes("start"));

    // Said where it starts and not where it ends: it ends where it began.
    const second = readIntake(
      { ...unchanged, start: "kutaisi" },
      first?.state ?? initialState(TODAY),
      TODAY,
    );
    assert.equal(second?.state.constraints.start, "kutaisi");
    assert.equal(second?.state.constraints.finish, "kutaisi");
    assert.deepEqual(second?.state.said.sort(), ["places", "start"]);

    const third = readIntake(
      { ...unchanged, finish: "batumi" },
      second?.state ?? initialState(TODAY),
      TODAY,
    );
    assert.equal(third?.state.constraints.start, "kutaisi");
    assert.equal(third?.state.constraints.finish, "batumi");
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

  test("an empty route does not clear the places", () => {
    const turn = readIntake(
      { ...unchanged, places: [], unsupported: ["Sukhumi"] },
      initialState(TODAY),
      TODAY,
    );
    assert.ok(turn?.state.constraints.places.length);
    assert.deepEqual(turn?.unsupported, ["Sukhumi"]);
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
        { ...unchanged, places: ["atlantis"] },
        initialState(TODAY),
        TODAY,
      ),
      null,
    );
  });
});

describe("the route", () => {
  test("keeps its order and a round trip's return", () => {
    const turn = readIntake(
      {
        ...unchanged,
        places: ["tbilisi", "tbilisi", "kazbegi", "batumi", "tbilisi"],
      },
      initialState(TODAY),
      TODAY,
    );
    assert.deepEqual(turn?.state.constraints.places, [
      "tbilisi",
      "kazbegi",
      "batumi",
      "tbilisi",
    ]);
  });
});

describe("applyEdit", () => {
  test("a hand correction survives a later turn that does not touch it", () => {
    const edited = applyEdit(initialState(TODAY), { budgetEur: 1200 });
    const turn = readIntake({ ...unchanged, days: 10 }, edited, TODAY);
    assert.equal(turn?.state.constraints.budgetEur, 1200);
  });
});

describe("suggestions from the model", () => {
  const ask = (suggestions: string[], ready = false, asked = 0) =>
    readIntake(
      { ...unchanged, days: 3, places: ["kakheti"], ready, suggestions },
      initialState(TODAY),
      TODAY,
      asked,
    );

  test("are trimmed, distinct, short and at most four", () => {
    const turn = ask([
      "  Couple ",
      "couple",
      "",
      "x".repeat(41),
      "Family with kids",
      "Solo",
      "Friends",
      "Parents",
    ]);
    assert.deepEqual(turn?.suggestions, [
      "Couple",
      "Family with kids",
      "Solo",
      "Friends",
    ]);
  });

  test("are dropped when the planner has nothing left to ask", () => {
    assert.deepEqual(
      ask(["Couple"], false, INTAKE_MAX_QUESTIONS - 1)?.suggestions,
      [],
    );
  });

  test("the question budget makes it ready, once the essentials are said", () => {
    assert.equal(
      ask(["Couple"], false, INTAKE_MAX_QUESTIONS - 2)?.ready,
      false,
    );
    const last = ask(["Couple"], false, INTAKE_MAX_QUESTIONS - 1);
    assert.equal(last?.ready, true);
    assert.deepEqual(last?.suggestions, []);
  });

  test("the model cannot call a trip ready before it knows what the traveller enjoys", () => {
    assert.equal(ask([], true)?.ready, false);
    const told = readIntake(
      {
        ...unchanged,
        days: 3,
        places: ["kakheti"],
        interests: ["food", "nature"],
        ready: true,
      },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(told?.ready, true);
    // "Anything" is an answer: no interests, said.
    const anything = readIntake(
      {
        ...unchanged,
        days: 3,
        places: ["kakheti"],
        interests: [],
        ready: true,
      },
      initialState(TODAY),
      TODAY,
    );
    assert.equal(anything?.ready, true);
  });

  test("the budget does not declare a trip ready that has no places", () => {
    const turn = readIntake(
      { ...unchanged, suggestions: ["Couple"] },
      initialState(TODAY),
      TODAY,
      INTAKE_MAX_QUESTIONS,
    );
    assert.equal(turn?.ready, false);
  });
});

describe("fallbackTurn", () => {
  test("reads the latest message onto the state", () => {
    const turn = fallbackTurn(
      said("Long weekend in Kakheti with my partner, back by 7"),
      initialState(TODAY),
      TODAY,
    );
    assert.equal(turn.state.constraints.dayEnds, "19:00");
    assert.ok(turn.state.said.includes("dayEnds"));
    assert.equal(turn.state.constraints.days, 3);
    assert.deepEqual(turn.state.constraints.places, ["kakheti"]);
    assert.ok(constraints.safeParse(turn.state.constraints).success);
  });

  test("asks the next detail it lacks, with answers to tap, then stops asking", () => {
    // The places, the length and who is coming are said; interests are not.
    const first = fallbackTurn(
      said("Long weekend in Kakheti with my partner"),
      initialState(TODAY),
      TODAY,
    );
    assert.ok(!first.ready);
    assert.match(first.reply, /What do you like most/);
    assert.deepEqual(first.suggestions, [
      "Food and wine",
      "Hiking and nature",
      "Monasteries and history",
      "Museums and art",
    ]);

    const all = fallbackTurn(
      said("Long weekend in Kakheti with my partner, relaxed, wine and hiking"),
      initialState(TODAY),
      TODAY,
    );
    assert.ok(all.ready);
    assert.deepEqual(all.suggestions, []);
  });

  test("no question is asked before the places and the length are known", () => {
    const turn = fallbackTurn(
      said("somewhere nice"),
      initialState(TODAY),
      TODAY,
    );
    assert.deepEqual(turn.suggestions, []);
  });

  test("it stops asking after its budget of replies", () => {
    const talk: IntakeMessage[] = Array.from(
      { length: INTAKE_MAX_QUESTIONS - 1 },
      () => [
        { role: "traveller" as const, text: "ok" },
        { role: "planner" as const, text: "Which?" },
      ],
    ).flat();
    const turn = fallbackTurn(
      [...talk, { role: "traveller", text: "3 days in Kakheti" }],
      initialState(TODAY),
      TODAY,
    );
    assert.ok(turn.ready);
    assert.deepEqual(turn.suggestions, []);
  });

  test("says what it assumed, and what cannot be part of the trip", () => {
    const turn = fallbackTurn(
      said("somewhere warm, maybe Sukhumi"),
      initialState(TODAY),
      TODAY,
    );
    assert.match(turn.reply, /I assumed the places/);
    assert.match(turn.reply, /Sukhumi can’t be part of it/);
    assert.deepEqual(turn.unsupported, ["Sukhumi"]);
    assert.ok(!turn.ready);
  });

  test("the words say where it starts, and the reply says the whole route", () => {
    const turn = fallbackTurn(
      said("Tbilisi - Sighnaghi - Tbilisi, 2 days"),
      initialState(TODAY),
      TODAY,
    );
    assert.deepEqual(turn.state.constraints.places, ["signagi"]);
    assert.match(turn.reply, /Tbilisi → Sighnaghi → Tbilisi/);
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
    assert.deepEqual(second.state.constraints.places, ["svaneti"]);
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
