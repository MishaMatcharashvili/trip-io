import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { constraints } from "./constraints.ts";
import { understand } from "./request.ts";

const TODAY = "2026-09-26";

describe("understand", () => {
  test("the canvas's example sentence", () => {
    const { constraints: c, said } = understand(
      "7 days in Georgia, €700 budget, nature + monasteries, traveling with my father.",
      TODAY,
    );
    assert.equal(c.days, 7);
    assert.equal(c.budgetEur, 700);
    assert.deepEqual(c.interests, ["nature", "heritage"]);
    assert.deepEqual(c.party, { adults: 2, children: 0 });
    assert.equal(c.mobility, "low");
    assert.equal(c.pace, "relaxed");
    assert.ok(!said.includes("startDate"));
    assert.ok(constraints.safeParse(c).success);
  });

  test("areas from place names and what they are known for", () => {
    const { constraints: c } = understand(
      "Long weekend in Kakheti with my partner, lots of wine",
      TODAY,
    );
    assert.equal(c.days, 3);
    assert.deepEqual(c.areas, ["kakheti"]);
    assert.deepEqual(c.interests, ["food"]);
    assert.deepEqual(c.party, { adults: 2, children: 0 });
  });

  test("dates, nights, word numbers and lari", () => {
    const { constraints: c } = understand(
      "four nights in Svaneti from 12 October, 2000 GEL, packed",
      TODAY,
    );
    assert.equal(c.days, 5);
    assert.equal(c.startDate, "2026-10-12");
    assert.equal(c.budgetEur, 680);
    assert.equal(c.pace, "packed");
    assert.deepEqual(c.areas, ["svaneti"]);
  });

  test("a month already past this year means next year", () => {
    const { constraints: c } = understand("a week in May", TODAY);
    assert.equal(c.startDate, "2027-05-01");
    assert.equal(c.days, 7);
  });

  test("nothing said is all defaults, and says so", () => {
    const { constraints: c, said } = understand("somewhere nice", TODAY);
    assert.deepEqual(said, []);
    assert.equal(c.startDate, "2026-10-10");
    assert.ok(constraints.safeParse(c).success);
  });

  test("a place that shares letters with a month is not a date", () => {
    const { said } = understand("three days in Marneuli", TODAY);
    assert.ok(!said.includes("startDate"));
  });

  test("a family", () => {
    const { constraints: c } = understand("family trip with 2 kids", TODAY);
    assert.deepEqual(c.party, { adults: 2, children: 2 });
  });
});
