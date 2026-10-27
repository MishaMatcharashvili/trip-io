import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legStates, routeEnds } from "./route-states.ts";

describe("legStates", () => {
  test("behind is done, the first not yet covered is current, the rest ahead", () => {
    assert.deepEqual(legStates([true, true, false, false], true), [
      "done",
      "done",
      "current",
      "ahead",
    ]);
  });

  test("a trip not begun has nothing current", () => {
    assert.deepEqual(legStates([false, false], false), ["ahead", "ahead"]);
  });

  test("a trip that is over has nothing current either", () => {
    assert.deepEqual(legStates([true, true], true), ["done", "done"]);
  });

  test("no legs, no states", () => {
    assert.deepEqual(legStates([], true), []);
  });
});

describe("routeEnds", () => {
  const tbilisi: [number, number] = [44.79, 41.72];
  const mtskheta: [number, number] = [44.72, 41.85];

  test("the first leg's first point starts it, the last leg's last point finishes it", () => {
    const ends = routeEnds([
      [tbilisi, [44.75, 41.8]],
      [[44.75, 41.8], mtskheta],
    ]);
    assert.deepEqual(
      ends.map((e) => [e.kind, e.at]),
      [
        ["start", tbilisi],
        ["finish", mtskheta],
      ],
    );
  });

  test("a road that comes back to where it began is one end, not two", () => {
    const ends = routeEnds([
      [tbilisi, mtskheta],
      [mtskheta, [44.7901, 41.7201]],
    ]);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].kind, "round");
    assert.equal(ends[0].label, "Start · Finish");
  });

  test("empty legs are skipped, and no road has no ends", () => {
    assert.deepEqual(routeEnds([]), []);
    assert.deepEqual(routeEnds([[], []]), []);
    assert.equal(routeEnds([[], [tbilisi, mtskheta], []]).length, 2);
  });
});
