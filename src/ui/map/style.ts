import { BLACK, type Flavor, GRAYSCALE, layers } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import { MAP_ASSETS, MAP_TILES } from "./source.ts";

// The basemap in Mist. Colour has three jobs in this product — periwinkle is
// the agent, coral a real disruption, green all-clear — so the map underneath
// must not spend any of them. It starts from Protomaps' grayscale flavours,
// which carry no POI icons and no landcover tints, and takes every colour it
// shows from the design's own `--color-map-*` tokens. Dark mode is the same
// function over the dark values of the same tokens.

/** The tokens the basemap is painted with, as `globals.css` names them. */
export const mapTokens = [
  "map-ground",
  "map-band-2",
  "map-band-3",
  "map-contour",
  "map-wood",
  "map-snow",
  "map-water",
  "map-road",
  "map-road-casing",
  "map-label",
  "map-label-strong",
] as const;

export type MapToken = (typeof mapTokens)[number];
export type MapPalette = Record<MapToken, string>;

/** Read the palette off the document, as whichever theme is in force paints it. */
export function readPalette(root: Element): MapPalette {
  const css = getComputedStyle(root);
  return Object.fromEntries(
    mapTokens.map((t) => [t, css.getPropertyValue(`--color-${t}`).trim()]),
  ) as MapPalette;
}

export function mistFlavor(p: MapPalette, theme: "light" | "dark"): Flavor {
  const base = theme === "dark" ? BLACK : GRAYSCALE;
  const road = {
    fill: p["map-road"],
    casing: p["map-road-casing"],
  };
  return {
    ...base,
    background: p["map-ground"],
    earth: p["map-ground"],
    park_a: p["map-wood"],
    park_b: p["map-wood"],
    wood_a: p["map-wood"],
    wood_b: p["map-wood"],
    scrub_a: p["map-wood"],
    scrub_b: p["map-wood"],
    glacier: p["map-snow"],
    water: p["map-water"],
    buildings: p["map-band-3"],
    pedestrian: p["map-band-2"],
    boundaries: p["map-contour"],
    railway: p["map-contour"],

    other: road.fill,
    minor_service: road.fill,
    minor_a: road.fill,
    minor_b: road.fill,
    link: road.fill,
    major: road.fill,
    highway: road.fill,
    bridges_other: road.fill,
    bridges_minor: road.fill,
    bridges_link: road.fill,
    bridges_major: road.fill,
    bridges_highway: road.fill,
    minor_service_casing: road.casing,
    minor_casing: road.casing,
    link_casing: road.casing,
    major_casing_early: road.casing,
    major_casing_late: road.casing,
    highway_casing_early: road.casing,
    highway_casing_late: road.casing,
    bridges_other_casing: road.casing,
    bridges_minor_casing: road.casing,
    bridges_link_casing: road.casing,
    bridges_major_casing: road.casing,
    bridges_highway_casing: road.casing,

    roads_label_minor: p["map-label"],
    roads_label_minor_halo: p["map-ground"],
    roads_label_major: p["map-label"],
    roads_label_major_halo: p["map-ground"],
    ocean_label: p["map-label"],
    subplace_label: p["map-label"],
    subplace_label_halo: p["map-ground"],
    city_label: p["map-label-strong"],
    city_label_halo: p["map-ground"],
    state_label: p["map-label"],
    state_label_halo: p["map-ground"],
    country_label: p["map-label"],
    address_label: p["map-label"],
    address_label_halo: p["map-ground"],

    // Never the base's: a coloured POI icon would be a fourth colour with a
    // meaning nobody gave it.
    pois: undefined,
    landcover: undefined,
  };
}

/** The Protomaps source id the layers below are written against. */
export const BASEMAP_SOURCE = "protomaps";

/**
 * The whole style. Labels are in English where OpenStreetMap has an English
 * name and in Georgian otherwise — the fonts carry both scripts.
 */
export function mistStyle(
  baseUrl: string,
  palette: MapPalette,
  theme: "light" | "dark",
): StyleSpecification {
  const assets = `${baseUrl}/${MAP_ASSETS.prefix.replace(/^map\//, "")}`;
  return {
    version: 8,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/${theme}`,
    sources: {
      [BASEMAP_SOURCE]: {
        type: "vector",
        url: `pmtiles://${baseUrl}/${MAP_TILES.file}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layers(BASEMAP_SOURCE, mistFlavor(palette, theme), { lang: "en" }),
  };
}
