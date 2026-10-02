import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Photo, PlaceIdentity } from "./enrichment.ts";
import { type PhotoCandidate, selectPhotos } from "./photos.ts";

const NARIKALA: PlaceIdentity = {
  name: "Narikala Fortress",
  nameKa: "ნარიყალა",
  lonLat: [44.8103, 41.6875],
  category: "castle",
};

const photo = (id: string): Photo => ({
  id,
  url: `https://upload.example/${id}.jpg`,
  width: 800,
  height: 600,
  caption: null,
  by: null,
  credit: {
    text: "Someone · CC BY-SA 4.0",
    url: `https://commons.example/${id}`,
  },
});

const cand = (
  id: string,
  title: string,
  at: [number, number] | null,
  extra: string[] = [],
): PhotoCandidate => ({
  photo: photo(id),
  labels: [title, ...extra],
  lonLat: at,
});

const NEAR: [number, number] = [44.8104, 41.6876];
const MOSQUE_ADJACENT: [number, number] = [44.8102, 41.6874];

describe("selectPhotos", () => {
  test("a photo whose title names the place, near it, is shown", () => {
    const out = selectPhotos(NARIKALA, [
      cand("a", "File:Narikala Fortress, Tbilisi.jpg", NEAR),
    ]);
    assert.deepEqual(
      out.map((p) => p.id),
      ["a"],
    );
  });

  test("a photo of something else that happens to be nearby is not", () => {
    // What a search around Narikala's own coordinates returned: its neighbour.
    const out = selectPhotos(NARIKALA, [
      cand("mosque", "File:Mosquée - panoramio (3).jpg", MOSQUE_ADJACENT),
      cand(
        "detail",
        "File:Architectural Detail - Old Town - Tbilisi - 01.jpg",
        NEAR,
      ),
    ]);
    assert.deepEqual(out, []);
  });

  test("the description counts as well as the title", () => {
    const out = selectPhotos(NARIKALA, [
      cand("d", "File:IMG_2041.jpg", NEAR, [
        "View of Narikala from the cable car",
      ]),
    ]);
    assert.deepEqual(
      out.map((p) => p.id),
      ["d"],
    );
  });

  test("the Georgian name matches a title written in Georgian", () => {
    // Commons has many files named in Georgian script. (It cannot match an
    // English title: the romanisation says "Nariqala", the English "Narikala".)
    const out = selectPhotos({ ...NARIKALA, name: "Fortress" }, [
      cand("ka", "File:ნარიყალა - ხედი.jpg", NEAR),
    ]);
    assert.deepEqual(
      out.map((p) => p.id),
      ["ka"],
    );
  });

  test("words that only say what a place is match nothing: every café has 'cafe' in its title", () => {
    const out = selectPhotos(
      { name: "Cafe Leila", nameKa: null, lonLat: NEAR, category: "cafe" },
      [cand("other", "File:Cafe in Tbilisi.jpg", NEAR)],
    );
    assert.deepEqual(out, []);
  });

  test("a name match far away is another place of the same name", () => {
    const out = selectPhotos(NARIKALA, [
      cand("far", "File:Narikala Fortress.jpg", [44.2, 41.9]),
    ]);
    assert.deepEqual(out, []);
  });

  test("a photo with no location needs the whole name, not a part of it", () => {
    const part = selectPhotos(NARIKALA, [cand("p", "File:Narikala.jpg", null)]);
    const whole = selectPhotos(NARIKALA, [
      cand("w", "File:Narikala Fortress - Tbilisi.jpg", null),
    ]);
    assert.deepEqual(part, []);
    assert.deepEqual(
      whole.map((p) => p.id),
      ["w"],
    );
  });

  test("maps, logos, flags and diagrams are not photographs of a place", () => {
    const out = selectPhotos(NARIKALA, [
      cand("m", "File:Narikala Fortress map.svg.png", NEAR),
      cand("l", "File:Narikala Fortress logo.png", NEAR),
      cand("g", "File:Narikala Fortress site plan diagram.jpg", NEAR),
    ]);
    assert.deepEqual(out, []);
  });

  test("the closest and best-named come first, each once, up to the limit", () => {
    const out = selectPhotos(
      NARIKALA,
      [
        cand("2", "File:Narikala Fortress 2.jpg", [44.812, 41.688]),
        cand("1", "File:Narikala Fortress 1.jpg", NEAR),
        cand("1", "File:Narikala Fortress 1.jpg", NEAR),
        cand("3", "File:Narikala Fortress 3.jpg", [44.8125, 41.6885]),
      ],
      2,
    );
    assert.deepEqual(
      out.map((p) => p.id),
      ["1", "2"],
    );
  });

  test("nothing in, nothing out", () => {
    assert.deepEqual(selectPhotos(NARIKALA, []), []);
  });
});
