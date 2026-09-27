"use client";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { preconnect } from "react-dom";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { env } from "../../lib/env.ts";
import { cx } from "../cx.ts";
import { MAP_TILES, MAP_WORKER } from "./source.ts";
import { mountStops, type StopsLayer } from "./stops.tsx";
import { mistStyle, readPalette } from "./style.ts";

// The real map: MapLibre over the Georgia basemap in the public Blob store.
// The basemap is painted from the design's map tokens (style.ts); the trip on
// top of it follows the canvas — the route in periwinkle, because it is the
// plan the agent is watching, solid where you have driven and dashed ahead; a
// stop you have passed ringed in periwinkle, one ahead in grey, the one you
// are in filled and pulsing; coral only where something real has happened to
// a stop. The stops themselves live in stops.tsx.
//
// MapLibre is imported inside the effect, never at module scope: it touches
// `window` on import, and this component is rendered on the server too.

export type LonLat = [number, number];

export type MapStop = {
  id: string;
  lonLat: LonLat;
  label: string;
  state: "done" | "now" | "upcoming";
  /** A matched world event the judge routed. The only coral on the map. */
  disrupted?: boolean;
  /** What the node is — visit, meal, stay, transfer — for its glyph. */
  kind?: string;
  /** The catalogue place's category, for a more precise glyph than `kind`. */
  category?: string;
  /** The place's own logo, drawn in the pin instead of a glyph when it loads. */
  logo?: string;
};

/** Leg i runs from stop i to stop i + 1. */
export type RouteLegs = readonly (readonly LonLat[])[];

/**
 * A world event behind one of the trip's live matches, as GeoJSON. The map
 * draws it in coral: it is a real disruption, the one thing coral means.
 */
export type MapEvent = {
  id: string;
  kind: string;
  geometry: { type: string; coordinates: unknown };
};

/** Which of the trip's own layers are drawn. */
export type MapLayers = { route: boolean; weather: boolean; roads: boolean };

export const defaultLayers: MapLayers = {
  route: true,
  weather: true,
  roads: true,
};

/** What the map's own controls (zoom, recentre) drive. */
export type TripMapHandle = {
  zoomIn(): void;
  zoomOut(): void;
  recentre(): void;
};

const BASE_URL = env.NEXT_PUBLIC_MAP_BASE_URL;

const ROUTE_SOURCE = "trip-route";
const EVENT_SOURCE = "trip-events";
const EVENT_LAYERS = ["events-fill", "events-line", "events-point"] as const;

type Theme = "light" | "dark";

const currentTheme = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

let registered: Promise<typeof import("maplibre-gl")> | null = null;

/** Load MapLibre once per page, with the pmtiles protocol and our worker. */
function loadMapLibre(baseUrl: string) {
  registered ??= (async () => {
    const [maplibre, { PMTiles, Protocol }] = await Promise.all([
      import("maplibre-gl"),
      import("pmtiles"),
    ]);
    maplibre.setWorkerUrl(
      `${baseUrl}/${MAP_WORKER.prefix(maplibre.getVersion()).replace(/^map\//, "")}/maplibre-gl-worker.mjs`,
    );
    // Start the workers now, not when the first map is built.
    maplibre.prewarm();

    // The archive's header and root directory are the first read any tile
    // needs. The protocol keys archives by URL, so registering this one
    // under the style's URL means the map reuses the read begun here.
    const protocol = new Protocol();
    const archive = new PMTiles(`${baseUrl}/${MAP_TILES.file}`);
    protocol.add(archive);
    archive.getHeader().catch(() => {
      // The map retries on its own and reports what it cannot load.
    });
    maplibre.addProtocol("pmtiles", protocol.tile);
    return maplibre;
  })();
  return registered;
}

// Begin as soon as this module runs in a browser, while the page hydrates,
// rather than after the first map's effect.
if (typeof window !== "undefined" && BASE_URL) loadMapLibre(BASE_URL);

/** A promise, including the chunks React hands a client component from the server. */
const isPending = (
  route: RouteLegs | Promise<RouteLegs> | undefined,
): route is Promise<RouteLegs> =>
  typeof (route as { then?: unknown } | undefined)?.then === "function";

const straight = (stops: readonly MapStop[]): RouteLegs =>
  stops.slice(1).map((s, i) => [stops[i].lonLat, s.lonLat]);

/** A leg is behind you once you have reached the stop it leads to. */
function routeData(
  legs: RouteLegs,
  stops: readonly MapStop[],
): GeoJSONSourceSpecification["data"] {
  return {
    type: "FeatureCollection",
    features: legs.map((leg, i) => ({
      type: "Feature",
      properties: {
        done: stops[i + 1] ? stops[i + 1].state !== "upcoming" : false,
      },
      geometry: { type: "LineString", coordinates: leg.map((p) => [...p]) },
    })),
  };
}

function eventData(
  events: readonly MapEvent[],
): GeoJSONSourceSpecification["data"] {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      id: e.id,
      properties: { family: e.kind.split(".")[0] },
      geometry: e.geometry as never,
    })),
  };
}

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * The trip's own layers, above the roads and below the place labels: the
 * route, and the areas of the events that touch it.
 */
function addTripLayers(
  map: MapLibreMap,
  route: RouteLegs,
  stops: readonly MapStop[],
  events: readonly MapEvent[],
) {
  const agent = token("--color-agent");
  const ground = token("--color-map-ground");
  const alert = token("--color-alert-bright");
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

  map.addSource(EVENT_SOURCE, { type: "geojson", data: eventData(events) });
  map.addLayer(
    {
      id: "events-fill",
      type: "fill",
      source: EVENT_SOURCE,
      filter: EVENT_SHAPES["events-fill"],
      paint: { "fill-color": alert, "fill-opacity": 0.12 },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: "events-line",
      type: "line",
      source: EVENT_SOURCE,
      filter: EVENT_SHAPES["events-line"],
      paint: { "line-color": alert, "line-width": 1.5, "line-opacity": 0.7 },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: "events-point",
      type: "circle",
      source: EVENT_SOURCE,
      filter: EVENT_SHAPES["events-point"],
      paint: {
        "circle-color": alert,
        "circle-opacity": 0.18,
        "circle-radius": 22,
        "circle-stroke-color": alert,
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": 0.7,
      },
    },
    firstLabel,
  );

  // The route: a ground-coloured casing lifts it off the roads it follows,
  // it thickens as you zoom in, and the legs still ahead are dashed and
  // lighter than the ones behind you.
  map.addSource(ROUTE_SOURCE, {
    type: "geojson",
    data: routeData(route, stops),
  });
  const layout = {
    "line-cap": "round",
    "line-join": "round",
  } as const;
  map.addLayer(
    {
      id: ROUTE_CASING,
      type: "line",
      source: ROUTE_SOURCE,
      layout,
      paint: {
        "line-color": ground,
        "line-width": ROUTE_WIDTH(3),
        "line-opacity": 0.85,
      },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: ROUTE_AHEAD,
      type: "line",
      source: ROUTE_SOURCE,
      filter: ["!", ["get", "done"]],
      layout: { ...layout, "line-cap": "butt" },
      paint: {
        "line-color": agent,
        "line-width": ROUTE_WIDTH(0),
        "line-opacity": 0.6,
        "line-dasharray": [2, 1.6],
      },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: ROUTE_SOURCE,
      type: "line",
      source: ROUTE_SOURCE,
      filter: ["get", "done"],
      layout,
      paint: {
        "line-color": agent,
        "line-width": ROUTE_WIDTH(0),
        "line-opacity": 0.95,
      },
    },
    firstLabel,
  );
}

const ROUTE_CASING = "trip-route-casing";
const ROUTE_AHEAD = "trip-route-ahead";
const ROUTE_LAYERS = [ROUTE_CASING, ROUTE_AHEAD, ROUTE_SOURCE] as const;

/** The route's width by zoom, plus `extra` on each side for its casing. */
const ROUTE_WIDTH = (extra: number): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  6,
  2.5 + extra,
  10,
  3.5 + extra,
  14,
  5 + extra,
];

const EVENT_SHAPES: Record<
  (typeof EVENT_LAYERS)[number],
  ExpressionSpecification
> = {
  "events-fill": ["==", ["geometry-type"], "Polygon"],
  "events-line": ["!=", ["geometry-type"], "Point"],
  "events-point": ["==", ["geometry-type"], "Point"],
};

/** Show or hide the trip's layers without rebuilding them. */
function applyLayers(map: MapLibreMap, layers: MapLayers) {
  if (!map.getLayer(ROUTE_SOURCE)) return;
  for (const id of ROUTE_LAYERS) {
    map.setLayoutProperty(id, "visibility", layers.route ? "visible" : "none");
  }
  const families = [
    ...(layers.weather ? ["weather"] : []),
    ...(layers.roads ? ["road"] : []),
  ];
  for (const id of EVENT_LAYERS) {
    map.setLayoutProperty(
      id,
      "visibility",
      families.length ? "visible" : "none",
    );
    map.setFilter(id, [
      "all",
      EVENT_SHAPES[id],
      ["in", ["get", "family"], ["literal", families]],
    ]);
  }
}

export function TripMap({
  stops,
  route: routeProp,
  events = [],
  layers = defaultLayers,
  selectedId = null,
  onSelect,
  ref,
  fitPadding = 48,
  interactive = true,
  className,
}: {
  stops: readonly MapStop[];
  /**
   * One leg per pair of consecutive stops; straight lines when absent. A
   * promise — road geometry a server page did not wait for — draws straight
   * legs until it settles, so the map never waits on a router.
   */
  route?: RouteLegs | Promise<RouteLegs>;
  events?: readonly MapEvent[];
  layers?: MapLayers;
  selectedId?: string | null;
  /** Makes the stops buttons: the popover opens from here. */
  onSelect?: (id: string) => void;
  ref?: Ref<TripMapHandle>;
  /** Room to leave for panels floating over the map, in pixels. */
  fitPadding?:
    | number
    | { top: number; right: number; bottom: number; left: number };
  interactive?: boolean;
  className?: string;
}) {
  // Everything the map loads lives on the Blob store: open the connection
  // while the page's own scripts are still arriving. The fetches are CORS, so
  // the connection must be an anonymous one or the browser opens a second.
  // Rendered on the server too, so the hint is in the first HTML.
  if (BASE_URL) {
    preconnect(new URL(BASE_URL).origin, { crossOrigin: "anonymous" });
  }

  const [arrived, setArrived] = useState<RouteLegs | null>(null);
  useEffect(() => {
    if (!isPending(routeProp)) return;
    let live = true;
    routeProp.then(
      (legs) => live && setArrived(legs),
      () => {},
    );
    return () => {
      live = false;
      setArrived(null);
    };
  }, [routeProp]);
  const given = isPending(routeProp) ? arrived : routeProp;
  // Legs that no longer match the stops (a stop added since) are not drawn.
  const route =
    given && given.length === stops.length - 1 ? given : straight(stops);
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    map: MapLibreMap;
    maplibre: typeof import("maplibre-gl");
  } | null>(null);
  const latest = useRef({ stops, route, events, layers, onSelect, fitPadding });
  latest.current = { stops, route, events, layers, onSelect, fitPadding };

  // Whether stops are buttons; the handler itself is read through `latest`, so
  // a new function on every render does not rebuild every marker.
  const selectable = onSelect !== undefined;

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => loaded?.map.zoomIn(),
      zoomOut: () => loaded?.map.zoomOut(),
      recentre: () =>
        loaded?.map.fitBounds(
          bounds(latest.current.stops, latest.current.route),
          { padding: latest.current.fitPadding, maxZoom: 13 },
        ),
    }),
    [loaded],
  );

  // The map itself: created once, restyled when the theme changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: built once; stops and route are synced by the effect below
  useEffect(() => {
    const el = container.current;
    if (!el || !BASE_URL) return;
    const baseUrl = BASE_URL;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let map: MapLibreMap | null = null;

    loadMapLibre(baseUrl).then((maplibre) => {
      if (cancelled) return;
      const theme = currentTheme();
      map = new maplibre.Map({
        container: el,
        style: mistStyle(baseUrl, readPalette(document.documentElement), theme),
        bounds: bounds(latest.current.stops, latest.current.route),
        fitBoundsOptions: { padding: fitPadding, maxZoom: 13 },
        interactive,
        attributionControl: { compact: true },
      });
      const m = map;
      // Fires again after every setStyle, which drops the trip's layers with
      // the old style — so this is also what redraws them after a theme change.
      m.on("style.load", () => {
        addTripLayers(
          m,
          latest.current.route,
          latest.current.stops,
          latest.current.events,
        );
        applyLayers(m, latest.current.layers);
      });
      setLoaded({ map: m, maplibre });

      observer = new MutationObserver(() => {
        m.setStyle(
          mistStyle(
            baseUrl,
            readPalette(document.documentElement),
            currentTheme(),
          ),
        );
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      setLoaded(null);
    };
  }, [interactive]);

  // The stops (stops.tsx): mounted once per map, then told what changed.
  const [stopsLayer, setStopsLayer] = useState<StopsLayer | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const layer = mountStops(
      loaded.map,
      loaded.maplibre,
      selectable ? (id: string) => latest.current.onSelect?.(id) : null,
    );
    setStopsLayer(layer);
    return () => {
      layer.remove();
      setStopsLayer(null);
    };
  }, [loaded, selectable]);

  useEffect(() => {
    stopsLayer?.update(stops, selectedId);
  }, [stopsLayer, stops, selectedId]);

  // The route and the event areas, kept in step with props.
  useEffect(() => {
    if (!loaded) return;
    const { map } = loaded;
    map
      .getSource<GeoJSONSource>(ROUTE_SOURCE)
      ?.setData(routeData(route, stops));
    map.getSource<GeoJSONSource>(EVENT_SOURCE)?.setData(eventData(events));
  }, [loaded, stops, route, events]);

  useEffect(() => {
    if (loaded?.map.isStyleLoaded()) applyLayers(loaded.map, layers);
  }, [loaded, layers]);

  if (!BASE_URL) {
    // No basemap configured (a checkout without NEXT_PUBLIC_MAP_BASE_URL):
    // the ground colour alone, rather than a broken map.
    return (
      <div className={cx("bg-map-ground", className)} aria-hidden="true" />
    );
  }

  return (
    <div
      ref={container}
      className={cx("bg-map-ground", className)}
      role="img"
      aria-label={`Map of the trip: ${stops.map((s) => s.label).join(", ")}`}
    />
  );
}

/** The box around everything on the map, or all of Georgia if it is empty. */
function bounds(stops: readonly MapStop[], route: RouteLegs): [LonLat, LonLat] {
  const points = [...stops.map((s) => s.lonLat), ...route.flat()];
  if (points.length === 0) {
    const { west, south, east, north } = GEORGIA_BBOX;
    return [
      [west, south],
      [east, north],
    ];
  }
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
