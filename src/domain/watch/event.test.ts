import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  eventKinds,
  nodeKindsFor,
  radiusFor,
  staleAfterHours,
  weatherKinds,
} from "./event.ts";

describe("every kind has a decision made about it", () => {
  test("a radius, and a stale window, for each", () => {
    for (const kind of eventKinds) {
      assert.ok(radiusFor(kind) > 0, kind);
      assert.ok(staleAfterHours(kind) >= 6, kind);
    }
  });

  test("only the weather is re-forecast hourly", () => {
    for (const kind of eventKinds) {
      const hourly = (weatherKinds as readonly string[]).includes(kind);
      assert.equal(staleAfterHours(kind), hourly ? 6 : 72, kind);
    }
  });

  test("an opening-hours event is matched to the place, not the district", () => {
    assert.ok(radiusFor("hours.closed") < radiusFor("event.closure"));
  });

  test("a train is about a drive, as a road is", () => {
    assert.deepEqual(nodeKindsFor("rail.cancelled"), ["transfer"]);
    assert.equal(nodeKindsFor("event.festival"), null);
  });
});
