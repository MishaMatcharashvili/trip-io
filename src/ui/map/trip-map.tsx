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
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { preconnect } from "react-dom";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { env } from "../../lib/env.ts";
import { cx } from "../cx.ts";
import { loadMapLibre } from "./maplibre.ts";
import { borrow, giveBack, type Lease, setInteractive } from "./pool.ts";
import { mountStops, type StopsLayer } from "./stops.tsx";

// The real map: MapLibre over the Georgia basemap in the public Blob store.
// The basemap is painted from the design's map tokens (style.ts); the trip on
// top of it follows the canvas — the route in periwinkle, because it is the
// plan the agent is watching, solid where you have driven and dashed ahead; a
// stop you have passed ringed in periwinkle, one ahead in grey, the one you
// are in filled and pulsing; coral only where something real has happened to
// a stop. The stops themselves live in stops.tsx.
//
// The map itself is not this component's: it borrows the page's one map from
// the pool (pool.ts), draws this trip on it, and hands it back on the way out.

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

/** Take the trip off the map, leaving the basemap for the next borrower. */
function removeTripLayers(map: MapLibreMap) {
  for (const id of [...EVENT_LAYERS, ...ROUTE_LAYERS]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [EVENT_SOURCE, ROUTE_SOURCE]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

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
  fitPadding?: Padding;
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
  const slot = useRef<HTMLDivElement>(null);
  const [lease, setLease] = useState<Lease | null>(null);
  const latest = useRef({ stops, route, events, layers, onSelect, fitPadding });
  latest.current = { stops, route, events, layers, onSelect, fitPadding };

  // Whether stops are buttons; the handler itself is read through `latest`, so
  // a new function on every render does not rebuild every marker.
  const selectable = onSelect !== undefined;

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => lease?.map.zoomIn(),
      zoomOut: () => lease?.map.zoomOut(),
      recentre: () => {
        if (lease) frame(lease.map, latest.current, true);
      },
    }),
    [lease],
  );

  // Borrow the page's map and frame this trip on it. A layout effect, so the
  // previous page hands the map back in the same commit, before this one
  // asks for it, and the map is in place before the browser paints.
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el || !BASE_URL) return;
    let held: Lease | null = null;

    const cancel = borrow(el, BASE_URL, (l) => {
      held = l;
      setInteractive(l.map, interactive);
      frame(l.map, latest.current, false);
      // Runs again after a theme change, which reloads the style and takes
      // the trip's layers with it.
      l.onStyle = () => {
        addTripLayers(
          l.map,
          latest.current.route,
          latest.current.stops,
          latest.current.events,
        );
        applyLayers(l.map, latest.current.layers);
      };
      if (l.styled) l.onStyle();
      setLease(l);
    });

    return () => {
      cancel();
      if (held) {
        removeTripLayers(held.map);
        giveBack(held);
      }
      setLease(null);
    };
  }, [interactive]);

  // The stops (stops.tsx): mounted once per borrowed map, then told what
  // changed. Removed again before the next borrower mounts its own.
  const [stopsLayer, setStopsLayer] = useState<StopsLayer | null>(null);
  useEffect(() => {
    if (!lease) return;
    const layer = mountStops(
      lease.map,
      lease.maplibre,
      selectable ? (id: string) => latest.current.onSelect?.(id) : null,
    );
    setStopsLayer(layer);
    return () => {
      layer.remove();
      setStopsLayer(null);
    };
  }, [lease, selectable]);

  useEffect(() => {
    stopsLayer?.update(stops, selectedId);
  }, [stopsLayer, stops, selectedId]);

  // The route and the event areas, kept in step with props.
  useEffect(() => {
    if (!lease) return;
    const { map } = lease;
    map
      .getSource<GeoJSONSource>(ROUTE_SOURCE)
      ?.setData(routeData(route, stops));
    map.getSource<GeoJSONSource>(EVENT_SOURCE)?.setData(eventData(events));
  }, [lease, stops, route, events]);

  useEffect(() => {
    if (lease) applyLayers(lease.map, layers);
  }, [lease, layers]);

  if (!BASE_URL) {
    // No basemap configured (a checkout without NEXT_PUBLIC_MAP_BASE_URL):
    // the ground colour alone, rather than a broken map.
    return (
      <div className={cx("bg-map-ground", className)} aria-hidden="true" />
    );
  }

  return (
    <div
      ref={slot}
      className={cx("bg-map-ground", className)}
      role="img"
      aria-label={`Map of the trip: ${stops.map((s) => s.label).join(", ")}`}
    />
  );
}

type Padding =
  | number
  | { top: number; right: number; bottom: number; left: number };

/** Fit the camera to the trip, leaving room for what floats over the map. */
function frame(
  map: MapLibreMap,
  trip: {
    stops: readonly MapStop[];
    route: RouteLegs;
    fitPadding: Padding;
  },
  animate: boolean,
) {
  map.fitBounds(bounds(trip.stops, trip.route), {
    padding: trip.fitPadding,
    maxZoom: 13,
    animate,
  });
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
