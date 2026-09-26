"use client";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { cx } from "../cx.ts";
import { MAP_WORKER } from "./source.ts";
import { mistStyle, readPalette } from "./style.ts";

// The real map: MapLibre over the Georgia basemap in the public Blob store.
// The basemap is painted from the design's map tokens (style.ts); the trip on
// top of it follows the canvas — the route in periwinkle, because it is the
// plan the agent is watching; a stop you have passed filled, one ahead in
// outline, the one you are in pulsing; coral only where something real has
// happened to a stop.
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
};

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

const BASE_URL = process.env.NEXT_PUBLIC_MAP_BASE_URL;

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
    const [maplibre, { Protocol }] = await Promise.all([
      import("maplibre-gl"),
      import("pmtiles"),
    ]);
    maplibre.setWorkerUrl(
      `${baseUrl}/${MAP_WORKER.prefix(maplibre.getVersion()).replace(/^map\//, "")}/maplibre-gl-worker.mjs`,
    );
    maplibre.addProtocol("pmtiles", new Protocol().tile);
    return maplibre;
  })();
  return registered;
}

function routeData(
  route: readonly LonLat[],
): GeoJSONSourceSpecification["data"] {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: route.map((p) => [...p]) },
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
  route: readonly LonLat[],
  events: readonly MapEvent[],
) {
  const agent = token("--color-agent");
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

  map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData(route) });
  map.addLayer(
    {
      id: ROUTE_SOURCE,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": agent, "line-width": 3, "line-opacity": 0.9 },
    },
    firstLabel,
  );
}

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
  map.setLayoutProperty(
    ROUTE_SOURCE,
    "visibility",
    layers.route ? "visible" : "none",
  );
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

/** A stop, drawn with the design system's own classes and tokens. */
function stopElement(
  stop: MapStop,
  selected: boolean,
  onSelect: ((id: string) => void) | null,
): HTMLElement {
  const el = document.createElement(onSelect ? "button" : "div");
  el.className = cx(
    "flex items-center gap-2",
    onSelect ? "cursor-pointer" : "pointer-events-none",
  );
  if (onSelect) {
    (el as HTMLButtonElement).type = "button";
    el.setAttribute("aria-label", stop.label);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(stop.id);
    });
  } else {
    el.setAttribute("aria-hidden", "true");
  }

  const mark = document.createElement("span");
  if (stop.state === "now") {
    mark.className = cx(
      "relative grid size-[18px] place-items-center rounded-full border-[3px] bg-map-ground",
      stop.disrupted ? "border-alert-bright" : "border-agent",
    );
    // The halo's strength lives on a wrapper: `breathe` animates opacity
    // between 1 and 0.3, and would otherwise override it into a solid disc.
    const halo = document.createElement("span");
    halo.className = "absolute -inset-2 opacity-25";
    const pulse = document.createElement("span");
    pulse.className = cx(
      "block size-full rounded-full animate-breathe",
      stop.disrupted ? "bg-alert-bright" : "bg-agent",
    );
    halo.append(pulse);
    mark.append(halo);
  } else {
    mark.className = cx(
      "size-[11px] rotate-45 border-2 bg-map-ground",
      stop.disrupted
        ? "border-alert-bright"
        : stop.state === "done"
          ? "border-agent"
          : "border-map-label",
    );
  }

  if (selected) mark.classList.add("ring-2", "ring-agent", "ring-offset-2");

  const label = document.createElement("span");
  label.className = cx(
    "whitespace-nowrap text-[11px] uppercase tracking-[0.10em]",
    stop.state === "now" || selected
      ? "font-bold text-map-label-strong"
      : "font-medium text-map-label",
  );
  label.textContent = stop.label;

  el.append(mark, label);
  return el;
}

export function TripMap({
  stops,
  route = stops.map((s) => s.lonLat),
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
  /** Defaults to straight lines between the stops, in order. */
  route?: readonly LonLat[];
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
        addTripLayers(m, latest.current.route, latest.current.events);
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

  // The trip on the map: HTML markers (themed by CSS, so a theme change
  // needs nothing here) and the route line, kept in step with props.
  useEffect(() => {
    if (!loaded) return;
    const { map, maplibre } = loaded;
    const select = selectable
      ? (id: string) => latest.current.onSelect?.(id)
      : null;
    const markers: Marker[] = stops.map((stop) =>
      new maplibre.Marker({
        element: stopElement(stop, stop.id === selectedId, select),
        anchor: "left",
        offset: [-9, 0],
      })
        .setLngLat(stop.lonLat)
        .addTo(map),
    );
    map.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(routeData(route));
    map.getSource<GeoJSONSource>(EVENT_SOURCE)?.setData(eventData(events));
    return () => {
      for (const m of markers) m.remove();
    };
  }, [loaded, stops, route, events, selectedId, selectable]);

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
function bounds(
  stops: readonly MapStop[],
  route: readonly LonLat[],
): [LonLat, LonLat] {
  const points = [...stops.map((s) => s.lonLat), ...route];
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
