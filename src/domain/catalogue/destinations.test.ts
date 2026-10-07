import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { destinations, mentions, unreachable } from "./destinations.ts";

const slugs = (text: string) => mentions(text).map((m) => m.slug);

describe("destinations", () => {
  test("every slug and every name belongs to one destination", () => {
    const names = destinations.flatMap((d) => [
      d.name.toLowerCase(),
      ...(d.aliases ?? []),
    ]);
    assert.equal(
      new Set(destinations.map((d) => d.slug)).size,
      destinations.length,
    );
    assert.equal(new Set(names).size, names.length);
  });

  test("all of them are inside Georgia", () => {
    for (const { slug, lonLat } of destinations) {
      assert.ok(lonLat[0] > 40 && lonLat[0] < 46.8, slug);
      assert.ok(lonLat[1] > 41 && lonLat[1] < 43.6, slug);
    }
  });
});

describe("mentions", () => {
  test("in the order the sentence names them", () => {
    assert.deepEqual(slugs("From Batumi to Tbilisi via Kutaisi"), [
      "batumi",
      "tbilisi",
      "kutaisi",
    ]);
  });

  test("other spellings and the towns inside a municipality", () => {
    assert.deepEqual(slugs("Stepantsminda, then Signagi and Omalo"), [
      "kazbegi",
      "signagi",
      "tusheti",
    ]);
  });

  test("a longer name hides the shorter one inside it", () => {
    assert.deepEqual(slugs("a week in Lower Svaneti"), ["lentekhi"]);
    assert.deepEqual(slugs("David Gareja at dawn"), ["david-gareja"]);
  });

  test("a place named twice is there twice, with the words before it", () => {
    const found = mentions("Tbilisi, Kazbegi and back to Tbilisi");
    assert.deepEqual(
      found.map((m) => m.slug),
      ["tbilisi", "kazbegi", "tbilisi"],
    );
    assert.equal(found[2].before, "and back to");
  });

  test("part of a word is not a place", () => {
    assert.deepEqual(slugs("a bakery tour and some organic food"), []);
  });
});

describe("unreachable", () => {
  test("names what cannot be visited, and why", () => {
    const [found] = unreachable("Tbilisi and Sukhumi");
    assert.equal(found.name, "Sukhumi");
    assert.match(found.why, /Abkhazia/);
    assert.deepEqual(unreachable("Tbilisi and Batumi"), []);
  });
});
