import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { env } from "../../lib/env.ts";
import { type GoogleMaps, loadGoogleMaps } from "./google.ts";

// One Google map for the whole visit, not one per page. Every `new Map` is a
// billable map load, and every route with a map used to pay it again on
// arrival. Now a page borrows a map: its container moves into the page's own
// box, the page draws its trip on it, and on leaving it hands the map back,
// bare, for the next page to take.
//
// The map lives in module scope, so it outlives every route. A page normally
// shows one map, so one is kept; a page that shows two at once builds a
// second, which is dropped again when it comes back.
//
// A map's colour scheme can only be chosen when it is built, so a map is
// reusable only in the theme it was made for. A theme change hands the map
// back and borrows another.

export type Scheme = "LIGHT" | "DARK";

export type Lease = {
  readonly map: google.maps.Map;
  readonly google: GoogleMaps;
};

type Pooled = {
  map: google.maps.Map;
  google: GoogleMaps;
  scheme: Scheme;
  container: HTMLDivElement;
};

const idle: Pooled[] = [];
const KEEP_IDLE = 1;

/** Cloud-styled maps need a Map ID; Google's demo one stands in for development. */
const MAP_ID = env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

export const currentScheme = (): Scheme =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "DARK"
    : "LIGHT";

function build(g: GoogleMaps, slot: HTMLElement, scheme: Scheme): Pooled {
  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  // Measured on construction, so it goes into the page before the map does.
  slot.append(container);

  const { west, south, east, north } = GEORGIA_BBOX;
  const map = new g.maps.Map(container, {
    mapId: MAP_ID,
    colorScheme: scheme,
    center: { lat: (south + north) / 2, lng: (west + east) / 2 },
    zoom: 7,
    // Zoom and recentre are the app's own controls. Google's logo and terms
    // stay: they are not optional, and no panel may sit on them.
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: "greedy",
  });
  return { map, google: g, scheme, container };
}

/**
 * Ask for a map, shown inside `slot`. `ready` runs once the API has loaded,
 * with an idle map when there is one. Returns a cancel: a borrow cancelled
 * before it is served takes no map, so a page that leaves (or a development
 * double mount) never leaves one stranded or builds a spare.
 */
export function borrow(
  slot: HTMLElement,
  apiKey: string,
  ready: (lease: Lease) => void,
  failed: (error: unknown) => void,
): () => void {
  let cancelled = false;
  loadGoogleMaps(apiKey).then((g) => {
    if (cancelled) return;
    const scheme = currentScheme();
    // A map built for the other theme cannot be repainted; drop it.
    for (let i = idle.length - 1; i >= 0; i--) {
      if (idle[i].scheme !== scheme) dispose(idle.splice(i, 1)[0]);
    }
    const reused = idle.pop();
    if (reused) {
      slot.append(reused.container);
      google.maps.event.trigger(reused.map, "resize");
    }
    ready(reused ?? build(g, slot, scheme));
  }, failed);
  return () => {
    cancelled = true;
  };
}

function dispose(pooled: Pooled) {
  google.maps.event.clearInstanceListeners(pooled.map);
  pooled.container.remove();
}

/** Hand a map back. The borrower removes its own markers and layers first. */
export function giveBack(lease: Lease) {
  const pooled = lease as Pooled;
  // The borrower's own listeners go with it; the next one adds its own.
  google.maps.event.clearInstanceListeners(pooled.map);
  if (idle.length < KEEP_IDLE && pooled.scheme === currentScheme()) {
    pooled.container.remove();
    idle.push(pooled);
  } else {
    dispose(pooled);
  }
}

/** Let the reader pan and zoom, or not: a thumbnail is a picture. */
export function setInteractive(map: google.maps.Map, on: boolean) {
  map.setOptions({
    gestureHandling: on ? "greedy" : "none",
    keyboardShortcuts: on,
  });
}
