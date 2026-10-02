import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LonLat } from "../geo.ts";
import {
  type Candidate,
  chooseMatch,
  nameKey,
  nameSimilarity,
  type PlaceIdentity,
  searchCategory,
} from "./enrichment.ts";

const FABRIKA: LonLat = [44.8076, 41.7167];
// About 60 m and about 4 km from Fabrika.
const NEXT_DOOR: LonLat = [44.8082, 41.7169];
const ACROSS_TOWN: LonLat = [44.7716, 41.6935];

const place = (over: Partial<PlaceIdentity> = {}): PlaceIdentity => ({
  name: "Fabrika Tbilisi",
  nameKa: null,
  lonLat: FABRIKA,
  category: "hotel",
  ...over,
});

const candidate = (
  id: string,
  names: string[],
  lonLat: LonLat | null,
): Candidate => ({ id, names, lonLat });

describe("names", () => {
  test("kind words, case, accents and punctuation do not make a name", () => {
    assert.equal(nameKey("Café  Leila!"), "leila");
    assert.equal(nameKey("The Leila Restaurant"), "leila");
  });

  test("Georgian script is compared in Latin", () => {
    assert.ok(nameSimilarity("ფაბრიკა", "Pabrika") > 0.9);
  });

  test("a name made only of kind words has no identity", () => {
    assert.equal(nameSimilarity("Cafe", "Cafe"), 0);
  });

  test("different names are different", () => {
    assert.ok(nameSimilarity("Fabrika", "Meidan Bazaar") < 0.3);
  });
});

describe("chooseMatch", () => {
  test("the same name a few metres away is the place", () => {
    const match = chooseMatch(place(), [
      candidate("7", ["Fabrika Hostel"], NEXT_DOOR),
    ]);
    assert.equal(match?.id, "7");
  });

  test("the right name across town is not", () => {
    assert.equal(
      chooseMatch(place(), [candidate("7", ["Fabrika Tbilisi"], ACROSS_TOWN)]),
      null,
    );
  });

  test("a close pin with another name is not", () => {
    assert.equal(
      chooseMatch(place(), [candidate("7", ["Stamba Hotel"], NEXT_DOOR)]),
      null,
    );
  });

  test("an identical name forgives a pin that is off by a street or two", () => {
    const off: LonLat = [44.8176, 41.7167];
    const match = chooseMatch(place({ name: "Fabrika" }), [
      candidate("7", ["Fabrika"], off),
    ]);
    assert.equal(match?.id, "7");
  });

  test("a candidate with no coordinates cannot be placed", () => {
    assert.equal(
      chooseMatch(place(), [candidate("7", ["Fabrika Tbilisi"], null)]),
      null,
    );
  });

  test("the better name wins, and either of ours counts", () => {
    const match = chooseMatch(
      place({ name: "Old Fabrika", nameKa: "ფაბრიკა" }),
      [
        candidate("1", ["Fabrika Bar"], NEXT_DOOR),
        candidate("2", ["Pabrika"], NEXT_DOOR),
      ],
    );
    assert.equal(match?.id, "2");
  });

  test("nothing in, nothing out", () => {
    assert.equal(chooseMatch(place(), []), null);
  });
});

test("catalogue categories map onto the provider's three", () => {
  assert.equal(searchCategory("winery"), "restaurant");
  assert.equal(searchCategory("inn"), "hotel");
  assert.equal(searchCategory("waterfall"), "attraction");
  assert.equal(searchCategory("anything_else"), "attraction");
});
