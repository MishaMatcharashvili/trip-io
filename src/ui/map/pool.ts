import type { Map as MapLibreMap } from "maplibre-gl";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { loadMapLibre, type MapLibre } from "./maplibre.ts";
import { mistStyle, readPalette } from "./style.ts";

// One MapLibre map for the whole visit, not one per page. Building a map
// costs a WebGL context, a style parse and a fresh set of tiles, and every
// route with a map used to pay it again on arrival. Now a page borrows a map:
// its container moves into the page's own box, the page draws its trip on it,
// and on leaving it hands the map back, bare, for the next page to take.
//
// The map lives in module scope, so it outlives every route. A page normally
// shows one map, so one is kept; a page that shows two at once builds a
// second, which is dropped again when it comes back.

export type Lease = {
  readonly map: MapLibreMap;
  readonly maplibre: MapLibre;
  /**
   * Whether the style has loaded, so layers can be added now. A theme change
   * reloads the style, and `onStyle` runs again once it has.
   */
  readonly styled: boolean;
  /** Run after each style load: where a borrower adds its own layers. */
  onStyle: (() => void) | null;
};

type Pooled = {
  map: MapLibreMap;
  maplibre: MapLibre;
  styled: boolean;
  onStyle: (() => void) | null;
  container: HTMLDivElement;
  observer: MutationObserver;
};

/** Maps built and not lent out. */
const idle: Pooled[] = [];
const KEEP_IDLE = 1;

/** Everything a hand can do to a map, switched together. */
const HANDLERS = [
  "boxZoom",
  "scrollZoom",
  "dragPan",
  "dragRotate",
  "keyboard",
  "doubleClickZoom",
  "touchZoomRotate",
  "touchPitch",
] as const;

const theme = (): "light" | "dark" =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

const style = (baseUrl: string) =>
  mistStyle(baseUrl, readPalette(document.documentElement), theme());

function build(maplibre: MapLibre, baseUrl: string, slot: HTMLElement) {
  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  // Measured on construction, so it goes into the page before the map does.
  slot.append(container);

  const { west, south, east, north } = GEORGIA_BBOX;
  const map = new maplibre.Map({
    container,
    style: style(baseUrl),
    bounds: [
      [west, south],
      [east, north],
    ],
    attributionControl: { compact: true },
  });

  const pooled: Pooled = {
    map,
    maplibre,
    styled: false,
    onStyle: null,
    container,
    // Repainted from the tokens whenever the theme changes. `diff: false`
    // rebuilds the style rather than patching it: a patch would silently
    // drop the borrower's layers, which the new style does not name, and
    // would not fire the style.load that puts them back.
    observer: new MutationObserver(() => {
      pooled.styled = false;
      map.setStyle(style(baseUrl), { diff: false });
    }),
  };
  map.on("style.load", () => {
    pooled.styled = true;
    pooled.onStyle?.();
  });
  pooled.observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return pooled;
}

/**
 * Ask for a map, shown inside `slot`. `ready` runs once MapLibre has loaded,
 * with an idle map when there is one. Returns a cancel: a borrow cancelled
 * before it is served takes no map, so a page that leaves (or a development
 * double mount) never leaves one stranded or builds a spare.
 */
export function borrow(
  slot: HTMLElement,
  baseUrl: string,
  ready: (lease: Lease) => void,
): () => void {
  let cancelled = false;
  loadMapLibre(baseUrl).then((maplibre) => {
    if (cancelled) return;
    const reused = idle.pop();
    if (reused) {
      slot.append(reused.container);
      reused.map.resize();
    }
    ready(reused ?? build(maplibre, baseUrl, slot));
  });
  return () => {
    cancelled = true;
  };
}

/** Hand a map back. The borrower removes its own markers and layers first. */
export function giveBack(lease: Lease) {
  const pooled = lease as Pooled;
  pooled.onStyle = null;
  pooled.container.remove();
  if (idle.length < KEEP_IDLE) {
    idle.push(pooled);
  } else {
    pooled.observer.disconnect();
    pooled.map.remove();
  }
}

/** Let the reader pan and zoom, or not: a thumbnail is a picture. */
export function setInteractive(map: MapLibreMap, on: boolean) {
  for (const name of HANDLERS) {
    if (on) map[name].enable();
    else map[name].disable();
  }
  map.getCanvasContainer().classList.toggle("maplibregl-interactive", on);
}
