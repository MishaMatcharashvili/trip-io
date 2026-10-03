import type { Map as MapboxMap } from "mapbox-gl";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { env } from "../../lib/env.ts";
import {
  getMapStyle,
  type MapStyleKind,
  type Scheme,
  styleUrl,
} from "./map-style.ts";
import { loadMapbox, type Mapbox } from "./mapbox.ts";

// One Mapbox map for the whole visit, not one per page. Every `new Map` is a
// billable map load, and every route with a map used to pay it again on
// arrival. Now a page borrows a map: its container moves into the page's own
// box, the page draws its trip on it, and on leaving it hands the map back,
// bare, for the next page to take.
//
// The map lives in module scope, so it outlives every route. A page normally
// shows one map, so one is kept; a page that shows two at once builds a
// second, which is dropped again when it comes back.
//
// Unlike a Google map, a Mapbox map can change its colour scheme after it is
// built (`setStyle`), so the theme never costs a new map. It does drop the
// sources and layers the borrower added; the overlays put theirs back when
// the new style has loaded.

export type { Scheme };

export type Lease = {
  readonly map: MapboxMap;
  readonly mapbox: Mapbox;
};

type Pooled = {
  map: MapboxMap;
  mapbox: Mapbox;
  /** The style the map is showing, so a borrower that wants another can change it. */
  url: string;
  container: HTMLDivElement;
};

const idle: Pooled[] = [];
const KEEP_IDLE = 1;

/** The app's own Studio styles, where it has them (docs/mapbox.md). */
const OVERRIDES = {
  light: env.NEXT_PUBLIC_MAPBOX_STYLE_LIGHT,
  dark: env.NEXT_PUBLIC_MAPBOX_STYLE_DARK,
  terrain: env.NEXT_PUBLIC_MAPBOX_STYLE_TERRAIN,
};

const urlFor = (kind: MapStyleKind, scheme: Scheme) =>
  styleUrl(kind, scheme, OVERRIDES);

/** What CSS can key on: imagery needs its labels drawn differently from a street map. */
const mark = (container: HTMLElement, kind: MapStyleKind) => {
  container.dataset.mapStyle = kind;
};

export const currentScheme = (): Scheme =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

function build(
  mapbox: Mapbox,
  slot: HTMLElement,
  kind: MapStyleKind,
  scheme: Scheme,
): Pooled {
  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  // Measured on construction, so it goes into the page before the map does.
  slot.append(container);
  mark(container, kind);

  const { west, south, east, north } = GEORGIA_BBOX;
  const map = new mapbox.Map({
    container,
    style: urlFor(kind, scheme),
    center: [(west + east) / 2, (south + north) / 2],
    zoom: 6,
    // The app has its own zoom and recentre controls. Mapbox's logo and
    // attribution stay, and are not covered: no panel may sit on them.
    attributionControl: true,
    // Routes are drawn flat and north-up.
    pitchWithRotate: false,
    dragRotate: false,
    // No cooperative-gesture overlay: a full-bleed map is the page.
    cooperativeGestures: false,
  });
  map.touchZoomRotate.disableRotation();
  return { map, mapbox, url: urlFor(kind, scheme), container };
}

/**
 * Ask for a map, shown inside `slot`. `ready` runs once the library has
 * loaded, with an idle map when there is one. Returns a cancel: a borrow
 * cancelled before it is served takes no map, so a page that leaves (or a
 * development double mount) never leaves one stranded or builds a spare.
 */
export function borrow(
  slot: HTMLElement,
  token: string,
  ready: (lease: Lease) => void,
  failed: (error: unknown) => void,
): () => void {
  let cancelled = false;
  loadMapbox(token).then((mapbox) => {
    if (cancelled) return;
    const scheme = currentScheme();
    const kind = getMapStyle();
    const reused = idle.pop();
    if (reused) {
      slot.append(reused.container);
      reused.map.resize();
      mark(reused.container, kind);
      const url = urlFor(kind, scheme);
      if (reused.url !== url) {
        reused.map.setStyle(url);
        reused.url = url;
      }
    }
    ready(reused ?? build(mapbox, slot, kind, scheme));
  }, failed);
  return () => {
    cancelled = true;
  };
}

function dispose(pooled: Pooled) {
  // Releases the WebGL context and every listener the map holds.
  pooled.map.remove();
  pooled.container.remove();
}

/**
 * Change a map that is already on a page to the traveller's choice, in the
 * theme's scheme. Mapbox restyles in place: it is not a new map and not a new
 * billable load, but it drops what the borrower added, which the overlays put
 * back when the new style has loaded.
 */
export function applyStyle(lease: Lease, kind: MapStyleKind, scheme: Scheme) {
  const pooled = lease as Pooled;
  mark(pooled.container, kind);
  const url = urlFor(kind, scheme);
  if (pooled.url === url) return;
  pooled.url = url;
  pooled.map.setStyle(url);
}

/** Hand a map back. The borrower removes its own markers and layers first. */
export function giveBack(lease: Lease) {
  const pooled = lease as Pooled;
  if (idle.length < KEEP_IDLE) {
    pooled.container.remove();
    idle.push(pooled);
  } else {
    dispose(pooled);
  }
}

/** Let the reader pan and zoom, or not: a thumbnail is a picture. */
export function setInteractive(map: MapboxMap, on: boolean) {
  const handlers = [
    map.scrollZoom,
    map.boxZoom,
    map.dragPan,
    map.doubleClickZoom,
    map.touchZoomRotate,
    map.keyboard,
  ];
  for (const handler of handlers) {
    if (on) handler.enable();
    else handler.disable();
  }
  // Rotation stays off either way.
  map.touchZoomRotate.disableRotation();
}
