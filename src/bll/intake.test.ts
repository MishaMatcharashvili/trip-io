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
  count: async () => used,
  now: () => NOW,
});

const answer = {
  reply: "Four days in Svaneti. When would you like to start?",
  startDate: null,
  days: 4,
  places: ["svaneti"],
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
