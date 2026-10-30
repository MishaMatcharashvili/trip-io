import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sightCategory } from "./sight-search.ts";

describe("sightCategory", () => {
  test("a monastery's church is a place of worship, not just an attraction", () => {
    assert.equal(
      sightCategory([
        "tourist_attraction",
        "church",
        "place_of_worship",
        "point_of_interest",
        "establishment",
      ]),
      "christian_place_of_worship",
    );
  });

  test("an attraction with nothing more specific is still a sight", () => {
    assert.equal(
      sightCategory(["tourist_attraction", "point_of_interest"]),
      "historic_site",
    );
  });

  test("a hotel is never a sight, whatever else it is called", () => {
    assert.equal(sightCategory(["lodging", "tourist_attraction"]), null);
  });

  test("a bare point of interest is not enough", () => {
    assert.equal(sightCategory(["point_of_interest", "establishment"]), null);
  });
});
