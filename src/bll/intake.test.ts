import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type IntakeMessage,
  initialState,
} from "../domain/trip/generate/intake.ts";
import { type PlanningDeps, planningTurn } from "./intake.ts";

const NOW = new Date("2026-10-07T08:00:00Z");
const state = initialState("2026-10-07");
const messages: IntakeMessage[] = [
  { role: "traveller", text: "Four days in Svaneti" },
];

const deps = (intake: PlanningDeps["intake"], used = 1): PlanningDeps => ({
  intake,
  sights: async () => ({}),
  count: async () => used,
  now: () => NOW,
});

const answer = {
  reply: "Four days in Svaneti. When would you like to start?",
  startDate: null,
  days: 4,
  places: ["svaneti"],
  start: null,
  finish: null,
  pace: null,
  dayEnds: null,
  interests: null,
  adults: null,
  children: null,
  mobility: null,
  budgetEur: null,
  ownCar: null,
  freeNights: null,
  notes: null,
  unsupported: [],
  sights: [],
  ready: false,
  suggestions: [],
  options: [],
};

describe("planningTurn", () => {
  test("the planner's answer, merged", async () => {
    const turn = await planningTurn(
      "u1",
      state,
      messages,
      deps(async () => answer),
    );
    assert.ok(turn.ok);
    assert.equal(turn.source, "model");
    assert.equal(turn.reply, answer.reply);
    assert.deepEqual(turn.state.constraints.places, ["svaneti"]);
  });

  test("an unreachable model still gets a turn", async () => {
    const turn = await planningTurn(
      "u1",
      state,
      messages,
      deps(async () => {
        throw new Error("503");
      }),
    );
    assert.ok(turn.ok);
    assert.equal(turn.source, "fallback");
    assert.equal(turn.state.constraints.days, 4);
    assert.deepEqual(turn.state.constraints.places, ["svaneti"]);
  });

  test("so does an answer of the wrong shape", async () => {
    const turn = await planningTurn(
      "u1",
      state,
      messages,
      deps(async () => ({ reply: "" })),
    );
    assert.ok(turn.ok);
    assert.equal(turn.source, "fallback");
  });

  test("past the limit, the model is not asked", async () => {
    let asked = false;
    const turn = await planningTurn(
      "u1",
      state,
      messages,
      deps(async () => {
        asked = true;
        return answer;
      }, 999),
    );
    assert.deepEqual(turn, { ok: false, reason: "rate-limited" });
    assert.equal(asked, false);
  });
});

describe("sights named in conversation", () => {
  const bodbe = {
    id: "7f3c1a52-0b8e-4c3e-9a1d-2f6b8e4d1c90",
    name: "Bodbe Monastery",
    place: "signagi",
  };

  test("are found and pinned, bringing their town onto the route", async () => {
    const asked: string[] = [];
    const turn = await planningTurn("u1", state, messages, {
      ...deps(async () => ({ ...answer, sights: ["Bodbe"] })),
      sightNamed: async (name) => {
        asked.push(name);
        return bodbe;
      },
    });
    assert.ok(turn.ok);
    assert.deepEqual(asked, ["Bodbe"]);
    assert.deepEqual(turn.state.constraints.mustSee, [bodbe]);
    assert.deepEqual(turn.state.constraints.places, ["svaneti", "signagi"]);
  });

  test("one that cannot be found, or fails to be looked up, changes nothing", async () => {
    const turn = await planningTurn("u1", state, messages, {
      ...deps(async () => ({ ...answer, sights: ["Nowhere", "Broken"] })),
      sightNamed: async (name) => {
        if (name === "Broken") throw new Error("down");
        return null;
      },
    });
    assert.ok(turn.ok);
    assert.deepEqual(turn.state.constraints.mustSee, []);
    assert.deepEqual(turn.state.constraints.places, ["svaneti"]);
  });
});
