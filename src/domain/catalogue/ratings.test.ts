import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MIN_REVIEWS,
  type RatedListing,
  rateCatalogue,
  ratingScore,
} from "./ratings.ts";

const listing = (
  id: string,
  name: string,
  lonLat: [number, number],
  value: number,
  count: number,
): RatedListing => ({ id, names: [name], lonLat, rating: { value, count } });

const ours = (id: string, name: string, lonLat: [number, number]) => ({
  id,
  name,
  nameKa: null,
  lonLat,
  category: "restaurant",
});

describe("ratings", () => {
  test("many reviews outweigh a perfect few", () => {
    assert.ok(
      ratingScore({ value: 4.7, count: 3_000 }) >
        ratingScore({ value: 5, count: 6 }),
    );
  });

  test("a listing is a catalogue place when the name and the pin agree", () => {
    const ratings = rateCatalogue(
      [
        ours("palaty", "Palaty", [42.7004, 42.2716]),
        ours("elsewhere", "Palaty", [42.8, 42.3]),
        ours("unrated", "Sisters", [42.701, 42.271]),
      ],
      [listing("g1", "Palaty Restaurant", [42.7005, 42.2717], 4.6, 2_400)],
    );
    assert.deepEqual([...ratings], [["palaty", { value: 4.6, count: 2_400 }]]);
  });

  test("one listing rates one place, the one whose name agrees best", () => {
    const ratings = rateCatalogue(
      [
        ours("argonavti", "Argonavti", [42.7001, 42.27]),
        ours("argo", "Argo", [42.7, 42.27]),
      ],
      [listing("g1", "Argo", [42.7, 42.27], 4.5, 500)],
    );
    assert.deepEqual([...ratings.keys()], ["argo"]);
  });

  test(`fewer than ${MIN_REVIEWS} reviews is no rating`, () => {
    const ratings = rateCatalogue(
      [ours("new", "Newly Opened", [42.7, 42.27])],
      [listing("g1", "Newly Opened", [42.7, 42.27], 5, MIN_REVIEWS - 1)],
    );
    assert.equal(ratings.size, 0);
  });
});
