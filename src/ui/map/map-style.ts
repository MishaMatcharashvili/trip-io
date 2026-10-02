// Which base map the traveller is looking at: the usual street map, satellite
// imagery with the street names on it, or terrain — the hillshade, contours and
// trails that matter on a mountain road. One choice for the whole visit, kept in
// this browser, applied to whichever map is on the page.
//
// Plain values and no React, so the pool (which is not a component) and the
// switch (which is) read the same thing and the URLs are testable.

export const mapStyles = ["map", "satellite", "terrain"] as const;
export type MapStyleKind = (typeof mapStyles)[number];

export const mapStyleLabels: Record<MapStyleKind, string> = {
  map: "Map",
  satellite: "Satellite",
  terrain: "Terrain",
};

export type Scheme = "light" | "dark";

/** Mapbox Studio styles that stand in for the defaults, when the app has its own. */
export type StyleOverrides = {
  light?: string;
  dark?: string;
  terrain?: string;
};

const DEFAULTS = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
  // Imagery with the roads and place names drawn over it: the picture alone
  // would not say where anything is.
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  // Hillshade, contours, trails and peaks.
  terrain: "mapbox://styles/mapbox/outdoors-v12",
} as const;

/**
 * The style URL for a choice in a colour scheme. Imagery and terrain have one
 * look in both schemes (a satellite photograph has no dark mode); the street map
 * follows the scheme, as it always did.
 */
export function styleUrl(
  kind: MapStyleKind,
  scheme: Scheme,
  overrides: StyleOverrides = {},
): string {
  switch (kind) {
    case "satellite":
      return DEFAULTS.satellite;
    case "terrain":
      return overrides.terrain ?? DEFAULTS.terrain;
    default:
      return scheme === "dark"
        ? (overrides.dark ?? DEFAULTS.dark)
        : (overrides.light ?? DEFAULTS.light);
  }
}

/** A stored value as a choice: anything unknown is the street map. */
export function parseMapStyle(value: unknown): MapStyleKind {
  return mapStyles.find((s) => s === value) ?? "map";
}

export const STORAGE_KEY = "tripio.map-style";

const listeners = new Set<() => void>();
let current: MapStyleKind | null = null;

/** The choice, read once from storage and then held: storage can be unavailable. */
export function getMapStyle(): MapStyleKind {
  if (current === null) {
    try {
      current = parseMapStyle(localStorage.getItem(STORAGE_KEY));
    } catch {
      current = "map";
    }
  }
  return current;
}

export function setMapStyle(kind: MapStyleKind) {
  current = kind;
  try {
    localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // A private window: the choice still holds for this visit.
  }
  for (const listener of listeners) listener();
}

export function subscribeMapStyle(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
