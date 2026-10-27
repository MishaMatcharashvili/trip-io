import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { candidates, P } from "../test-fixtures.ts";
import { MAX_MUSEUMS_A_DAY, museumHeavy } from "./balance.ts";
import type { Candidate, Plan, PlanStop } from "./plan.ts";

const museum = (n: number): Candidate => ({
  ...(candidates.get(P.museum) as Candidate),
  id: `30000000-0000-4000-8000-00000000000${n}`,
  name: `Museum ${n}`,
  category: n % 2 ? "museum" : "art_gallery",
  group: "culture",
});
const places = new Map([
  ...candidates,
  ...[1, 2, 3].map((n) => [museum(n).id, museum(n)] as const),
]);
const visit = (placeId: string): PlanStop => ({
  placeId,
  slot: "afternoon",
  kind: "visit",
  durationMin: 75,
});
const day = (...stops: PlanStop[]): Plan => ({
  days: [{ day: 2, theme: "Tbilisi", stayId: null, stops }],
});
const twoMuseums = day(visit(museum(1).id), visit(museum(2).id));

describe("museumHeavy", () => {
  test("two museums in a day, for a traveller who chose food and nature", () => {
    const [found, ...rest] = museumHeavy(twoMuseums, places, {
      interests: ["food", "nature"],
      startDate: "2026-10-01",
    });
    assert.equal(rest.length, 0);
    assert.equal(found.day, "2026-10-02");
    assert.match(found.message, /2 museums and galleries/);
    assert.match(found.message, /"Museum 1", "Museum 2"/);
    assert.match(found.message, /asked for food, nature, not museums/);
  });

  test("one a day is allowed, and a church is not a museum", () => {
    assert.equal(MAX_MUSEUMS_A_DAY, 1);
    const plan = day(visit(museum(1).id), visit(P.gergeti));
    assert.deepEqual(
      museumHeavy(plan, places, { interests: [], startDate: "2026-10-01" }),
      [],
    );
  });

  test("with no interests said, two museums are still too many", () => {
    const found = museumHeavy(twoMuseums, places, {
      interests: [],
      startDate: "2026-10-01",
    });
    assert.match(found[0].message, /has not said they want museums/);
  });

  test("a traveller who chose culture may fill a day with them", () => {
    const plan = day(...[1, 2, 3].map((n) => visit(museum(n).id)));
    assert.deepEqual(
      museumHeavy(plan, places, {
        interests: ["culture"],
        startDate: "2026-10-01",
      }),
      [],
    );
  });

  test("a museum café is a meal, not a museum visit", () => {
    const plan = day(visit(museum(1).id), {
      ...visit(museum(2).id),
      kind: "meal",
    });
    assert.deepEqual(
      museumHeavy(plan, places, { interests: [], startDate: "2026-10-01" }),
      [],
    );
  });
});
