import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapStyles, parseMapStyle, styleUrl } from "./map-style.ts";

describe("styleUrl", () => {
  test("the street map follows the colour scheme", () => {
    assert.match(styleUrl("map", "light"), /light-v11/);
    assert.match(styleUrl("map", "dark"), /dark-v11/);
  });

  test("imagery and terrain look the same in both: a photograph has no dark mode", () => {
    assert.equal(styleUrl("satellite", "light"), styleUrl("satellite", "dark"));
    assert.equal(styleUrl("terrain", "light"), styleUrl("terrain", "dark"));
  });

  test("satellite carries the street names; terrain is the outdoors style", () => {
    assert.match(styleUrl("satellite", "light"), /satellite-streets/);
    assert.match(styleUrl("terrain", "light"), /outdoors/);
  });

  test("the app's own Studio styles win where given", () => {
    const own = {
      light: "mapbox://styles/me/light",
      dark: "mapbox://styles/me/dark",
      terrain: "mapbox://styles/me/terrain",
    };
    assert.equal(styleUrl("map", "light", own), own.light);
    assert.equal(styleUrl("map", "dark", own), own.dark);
    assert.equal(styleUrl("terrain", "dark", own), own.terrain);
    // There is no custom satellite: it is Mapbox's imagery or nothing.
    assert.match(styleUrl("satellite", "light", own), /satellite-streets/);
  });

  test("every choice has a style", () => {
    for (const kind of mapStyles) assert.ok(styleUrl(kind, "light"));
  });
});

describe("parseMapStyle", () => {
  test("a known choice is itself", () => {
    for (const kind of mapStyles) assert.equal(parseMapStyle(kind), kind);
  });

  test("anything else, stored by an older version or by a stranger, is the street map", () => {
    for (const bad of [null, undefined, "", "hybrid", 3, {}]) {
      assert.equal(parseMapStyle(bad), "map");
    }
  });
});
