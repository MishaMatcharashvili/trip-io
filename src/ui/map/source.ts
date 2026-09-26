// Where the basemap comes from. `scripts/map/build.ts` publishes exactly these
// files to the public Blob store, and the map reads them back from
// NEXT_PUBLIC_MAP_BASE_URL. Both sides import this file, so a new build is one
// edit here, one `npm run map:build`, and a deploy.

/**
 * The Protomaps planet build Georgia is cut from, and how deep. Zoom 14 is
 * half the size of 15 (184 MB against 340 MB) and MapLibre overzooms past it,
 * so street-level views still render — just from the zoom-14 geometry.
 */
export const MAP_TILES = {
  build: "20260926",
  maxzoom: 14,
  get file() {
    return `georgia-${this.build}-z${this.maxzoom}.pmtiles`;
  },
} as const;

/**
 * Fonts and sprites from protomaps/basemaps-assets, pinned to a commit so a
 * glyph file under a given path never changes. Noto Sans Regular and Medium
 * carry the Georgian block (U+10A0–10FF); Italic is used for water labels.
 */
export const MAP_ASSETS = {
  commit: "028c18f713baecad011301ff7a69acc39bcc2ae7",
  fontstacks: ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"],
  spriteVersion: "v4",
  sprites: ["light", "dark"],
  get prefix() {
    return `map/assets-${this.commit.slice(0, 7)}`;
  },
} as const;
