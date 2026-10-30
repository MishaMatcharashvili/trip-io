import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { candidates, P } from "../test-fixtures.ts";
import {
  MAX_MUSEUMS_A_DAY,
  misplaced,
  museumHeavy,
  offInterest,
} from "./balance.ts";
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

describe("misplaced", () => {
  const coffee: Candidate = {
    ...(candidates.get(P.cafe5047) as Candidate),
    id: "40000000-0000-4000-8000-000000000001",
    name: "Coffee Hub",
    category: "coffee_shop",
  };
  const stage: Candidate = {
    ...(candidates.get(P.museum) as Candidate),
    id: "40000000-0000-4000-8000-000000000002",
    name: "Ensemble Kutaisi",
    category: "theatre_venue",
  };
  const pool = new Map([...candidates, [coffee.id, coffee], [stage.id, stage]]);
  const c = { interests: [], startDate: "2026-11-11" };

  test("lunch at a coffee shop, and a theatre nobody asked for", () => {
    const found = misplaced(
      day(
        { ...visit(coffee.id), slot: "midday", kind: "meal" },
        visit(stage.id),
      ),
      pool,
      c,
    );
    assert.equal(found.length, 2);
    assert.match(found[0].message, /midday meal is at "Coffee Hub"/);
    assert.match(found[1].message, /"Ensemble Kutaisi" is a stage/);
  });

  test("a coffee is a visit, and a café a meal", () => {
    const plan = day(visit(coffee.id), {
      ...visit(P.cafe5047),
      slot: "midday",
      kind: "meal",
    });
    assert.deepEqual(misplaced(plan, pool, c), []);
  });

  test("a traveller who chose culture goes to the theatre in the evening", () => {
    const culture = { ...c, interests: ["culture" as const] };
    assert.match(
      misplaced(day(visit(stage.id)), pool, culture)[0]?.message ?? "",
      /visited in the afternoon/,
    );
    assert.deepEqual(
      misplaced(day({ ...visit(stage.id), slot: "evening" }), pool, culture),
      [],
    );
  });
});

describe("offInterest", () => {
  const heritage = {
    interests: ["heritage" as const],
    startDate: "2026-09-14",
    mustSee: [],
  };

  test("a day of museums for a traveller who chose heritage, with churches to spare", () => {
    const [found] = offInterest(twoMuseums, places, heritage);
    assert.match(found.message, /only 0 of 2 visits are heritage/);
    assert.match(found.message, /Gergeti Trinity Church/);
  });

  test("half the day on what they chose is enough", () => {
    const mixed = day(visit(P.gergeti), visit(museum(1).id));
    assert.deepEqual(offInterest(mixed, places, heritage), []);
  });

  test("nothing chosen, nothing asked", () => {
    assert.deepEqual(
      offInterest(twoMuseums, places, { ...heritage, interests: [] }),
      [],
    );
  });

  test("a must-see is wanted, whatever kind of place it is", () => {
    const asked = {
      ...heritage,
      mustSee: [{ id: museum(1).id }, { id: museum(2).id }],
    };
    assert.deepEqual(offInterest(twoMuseums, places, asked), []);
  });

  test("a town with nothing of the kind is never asked for it", () => {
    assert.deepEqual(
      offInterest(twoMuseums, places, { ...heritage, interests: ["nature"] }),
      [],
    );
  });
});
