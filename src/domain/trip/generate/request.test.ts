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

  test("a start date already past is not a start date", () => {
    const { constraints: c, said } = understand(
      "5 days from 2020-01-01",
      TODAY,
    );
    assert.ok(!said.includes("startDate"));
    assert.ok(c.startDate > TODAY);
  });

  test("places from their names and what they are known for", () => {
    const { constraints: c } = understand(
      "Long weekend in Kakheti with my partner, lots of wine",
      TODAY,
    );
    assert.equal(c.days, 3);
    assert.deepEqual(c.places, ["kakheti"]);
    assert.deepEqual(c.interests, ["food"]);
    assert.deepEqual(c.party, { adults: 2, children: 0 });
  });

  test("anywhere in Georgia, in the order it is said", () => {
    const { constraints: c, said } = understand(
      "A week: Batumi, Kutaisi and Borjomi",
      TODAY,
    );
    assert.deepEqual(c.places, ["batumi", "kutaisi", "borjomi"]);
    assert.ok(said.includes("places"));
    assert.ok(constraints.safeParse(c).success);
  });

  test("the start and the finish, when the sentence names them", () => {
    const route = (text: string) => {
      const { places, start, finish } = understand(text, TODAY).constraints;
      return { start, places, finish };
    };
    assert.deepEqual(route("From Batumi to Tbilisi via Kutaisi"), {
      start: "batumi",
      places: ["kutaisi", "tbilisi"],
      finish: "tbilisi",
    });
    assert.deepEqual(route("Kazbegi and Kakheti, starting in Tbilisi"), {
      start: "tbilisi",
      places: ["kazbegi", "kakheti"],
      finish: "tbilisi",
    });
    assert.deepEqual(route("Borjomi, Vardzia, finishing in Batumi, 5 days"), {
      start: "tbilisi",
      places: ["borjomi", "vardzia"],
      finish: "batumi",
    });
  });

  test("a trip starts and finishes in Tbilisi unless the words say otherwise", () => {
    const { constraints: c, said } = understand(
      "A week: Batumi, Kutaisi and Borjomi",
      TODAY,
    );
    assert.equal(c.start, "tbilisi");
    assert.equal(c.finish, "tbilisi");
    assert.ok(!said.includes("start") && !said.includes("finish"));
  });

  test("a round trip starts and finishes in the same place, which is not a stop", () => {
    const route = (text: string) => {
      const { places, start, finish } = understand(text, TODAY).constraints;
      return { start, places, finish };
    };
    assert.deepEqual(route("Tbilisi, Kazbegi and back to Tbilisi"), {
      start: "tbilisi",
      places: ["kazbegi"],
      finish: "tbilisi",
    });
    assert.deepEqual(route("round trip from Tbilisi to Svaneti"), {
      start: "tbilisi",
      places: ["svaneti"],
      finish: "tbilisi",
    });
    for (const text of [
      "Tbilisi - Sighnaghi - Tbilisi",
      "tbilisi-sighnaghi-tbilisi",
      "Tbilisi → Sighnaghi → Tbilisi",
    ]) {
      assert.deepEqual(route(text), {
        start: "tbilisi",
        places: ["signagi"],
        finish: "tbilisi",
      });
    }
  });

  test("a journey starts where it begins, visits where it goes and finishes there", () => {
    for (const text of ["Tbilisi to Sighnaghi", "tbilisi-sighnaghi"]) {
      const { start, places, finish } = understand(text, TODAY).constraints;
      assert.equal(start, "tbilisi");
      assert.deepEqual(places, ["signagi"]);
      assert.equal(finish, "signagi");
    }
  });

  test("a name with a hyphen in it is one place, not a journey", () => {
    const { places } = understand(
      "4 days in Samtskhe-Javakheti",
      TODAY,
    ).constraints;
    assert.deepEqual(places, ["samtskhe-javakheti"]);
  });

  test("a place no trip can reach is refused, with the reason", () => {
    const { refused } = understand("Tbilisi and Sukhumi, 4 days", TODAY);
    assert.equal(refused.length, 1);
    assert.equal(refused[0].name, "Sukhumi");
  });

  test("what a place is known for, only when no place is named", () => {
    assert.deepEqual(understand("wine tasting", TODAY).constraints.places, [
      "kakheti",
    ]);
    assert.deepEqual(
      understand("mountains around Mestia", TODAY).constraints.places,
      ["mestia"],
    );
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
    assert.deepEqual(c.places, ["svaneti"]);
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
