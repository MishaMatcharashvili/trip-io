import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type MapPalette, mapTokens, mistStyle } from "./style.ts";

// The Mist values from globals.css, both themes. Written out rather than
// parsed so the test says which colours it is holding the style to.
const light: MapPalette = {
  "map-ground": "#edf2f6",
  "map-band-2": "#dfe7ed",
  "map-band-3": "#d6e0e8",
  "map-contour": "#9fb0c0",
  "map-wood": "#c9dccd",
  "map-snow": "#fcfdfe",
  "map-water": "#bdd3e0",
  "map-road": "#ffffff",
  "map-road-casing": "#c2ccd6",
  "map-label": "#5a6670",
  "map-label-strong": "#1d232a",
};

const dark: MapPalette = {
  "map-ground": "#131a21",
  "map-band-2": "#18212a",
  "map-band-3": "#1b252f",
  "map-contour": "#344150",
  "map-wood": "#1a2a24",
  "map-snow": "#2e3a46",
  "map-water": "#1e3342",
  "map-road": "#2a333d",
  "map-road-casing": "#3a4450",
  "map-label": "#8f9ca8",
  "map-label-strong": "#e6eaee",
};

const BASE = "https://store.example/map";

/** Every colour literal anywhere in the layers, however deeply nested. */
function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) colours(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) colours(v, out);
  }
  return out;
}

/** No hue: red, green and blue are equal. */
function isGrey(colour: string): boolean {
  const hex = colour.toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const [r, g, b] = [0, 2, 4].map((i) => full.slice(i, i + 2));
    return r === g && g === b;
  }
  const rgb = colour.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return rgb ? rgb[1] === rgb[2] && rgb[2] === rgb[3] : false;
}

describe("mistStyle", () => {
  for (const [theme, palette] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    test(`${theme}: spends no colour but the map tokens and greys`, () => {
      const style = mistStyle(BASE, palette, theme);
      const allowed = new Set(
        Object.values(palette).map((c) => c.toLowerCase()),
      );
      const stray = colours(style.layers).filter(
        (c) => !allowed.has(c.toLowerCase()) && !isGrey(c),
      );
      assert.deepEqual([...new Set(stray)], []);
    });
  }

  test("has no POI icons: their colours would mean nothing", () => {
    const style = mistStyle(BASE, light, "light");
    assert.equal(
      style.layers.some((l) => l.id === "pois"),
      false,
    );
  });

  test("reads everything from the store, at pinned paths", () => {
    const style = mistStyle(BASE, light, "dark");
    const source = style.sources.protomaps;
    assert.ok(source && source.type === "vector");
    assert.match(
      source.url ?? "",
      /^pmtiles:\/\/https:\/\/store\.example\/map\/georgia-\d{8}-z\d+\.pmtiles$/,
    );
    assert.match(
      style.glyphs ?? "",
      /^https:\/\/store\.example\/map\/assets-[0-9a-f]{7}\/fonts\/\{fontstack\}\/\{range\}\.pbf$/,
    );
    assert.equal(style.sprite, `${BASE}/assets-028c18f/sprites/dark`);
  });

  test("the palette names every token it paints with", () => {
    assert.deepEqual(Object.keys(light).sort(), [...mapTokens].sort());
    assert.deepEqual(Object.keys(dark).sort(), [...mapTokens].sort());
  });
});
