import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { destination } from "./destinations.ts";
import {
  asRated,
  geoOf,
  type Listing,
  listingQueries,
  parseRanking,
} from "./listings.ts";

const barbarestan: Listing = {
  id: "2425451",
  kind: "restaurant",
  destination: "tbilisi",
  name: "Barbarestan",
  lonLat: [44.8031, 41.7105],
  rating: 4.5,
  count: 2873,
  ranking: { rank: 12, of: 3104 },
  url: null,
};

describe("listingQueries", () => {
  test("a destination's restaurants and sights are read, by its name; its hotels are not", () => {
    const tbilisi = destination("tbilisi");
    assert.ok(tbilisi);
    const queries = listingQueries(tbilisi);
    assert.deepEqual(
      queries.map((q) => [q.kind, q.name, q.destination]).sort(),
      [
        ["attraction", "Tbilisi", "tbilisi"],
        ["restaurant", "Tbilisi", "tbilisi"],
      ],
    );
    assert.ok(queries.every((q) => q.max > 0));
  });
});

describe("parseRanking", () => {
  test("reads the line the site shows", () => {
    assert.deepEqual(parseRanking("#12 of 3,104 Restaurants in Tbilisi"), {
      rank: 12,
      of: 3104,
    });
  });

  test("nothing it cannot read", () => {
    assert.equal(parseRanking(null), null);
    assert.equal(parseRanking("Top rated"), null);
    assert.equal(parseRanking("#9 of 3 things"), null);
  });
});

describe("asRated", () => {
  test("keeps the rating, the reviews and the rank", () => {
    assert.deepEqual(asRated(barbarestan), {
      id: "2425451",
      names: ["Barbarestan"],
      lonLat: [44.8031, 41.7105],
      rating: { value: 4.5, count: 2873, rank: { rank: 12, of: 3104 } },
    });
  });

  test("a listing nobody has rated yet says nothing", () => {
    assert.equal(asRated({ ...barbarestan, rating: null }), null);
  });
});

describe("geoOf", () => {
  const link = (g: number, d: number, name: string, town: string) => ({
    url: `https://www.tripadvisor.com/Restaurant_Review-g${g}-d${d}-Reviews-${name}-${town}.html`,
  });

  test("a town's list names the town: its geo id and the name in its links", () => {
    assert.deepEqual(
      geoOf([
        link(294195, 1, "Olives_Restaurant", "Tbilisi"),
        link(294195, 2, "Barbarestan", "Tbilisi"),
        link(294195, 3, "Shavi-Lomi", "Tbilisi"),
        { url: null },
      ]),
      { id: "294195", slug: "Tbilisi" },
    );
  });

  test("a region's list, spread over its towns, has no one list to page", () => {
    assert.equal(
      geoOf([
        link(1, 1, "A", "Telavi_Kakheti_Region"),
        link(2, 2, "B", "Sighnaghi_Kakheti_Region"),
        link(3, 3, "C", "Kvareli_Kakheti_Region"),
      ]),
      null,
    );
  });

  test("nothing to go by, nothing found", () => {
    assert.equal(geoOf([]), null);
  });
});
