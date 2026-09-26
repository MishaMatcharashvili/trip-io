"use client";

import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
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

const BASE_URL = process.env.NEXT_PUBLIC_MAP_BASE_URL;

const ROUTE_SOURCE = "trip-route";

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

/** The route sits above the roads and below the place labels. */
function addRoute(map: MapLibreMap, route: readonly LonLat[]) {
  const agent = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-agent")
    .trim();
  map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData(route) });
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
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

/** A stop, drawn with the design system's own classes and tokens. */
function stopElement(stop: MapStop): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex items-center gap-2 pointer-events-none";
  el.setAttribute("aria-hidden", "true");

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

  const label = document.createElement("span");
  label.className = cx(
    "whitespace-nowrap text-[11px] uppercase tracking-[0.10em]",
    stop.state === "now"
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
  fitPadding = 48,
  interactive = true,
  className,
}: {
  stops: readonly MapStop[];
  /** Defaults to straight lines between the stops, in order. */
  route?: readonly LonLat[];
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
  const latest = useRef({ stops, route });
  latest.current = { stops, route };

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
      // Fires again after every setStyle, which drops the route with the
      // old style — so this is also what redraws it after a theme change.
      m.on("style.load", () => addRoute(m, latest.current.route));
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
    const markers: Marker[] = stops.map((stop) =>
      new maplibre.Marker({
        element: stopElement(stop),
        anchor: "left",
        offset: [-9, 0],
      })
        .setLngLat(stop.lonLat)
        .addTo(map),
    );
    map.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(routeData(route));
    return () => {
      for (const m of markers) m.remove();
    };
  }, [loaded, stops, route]);

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
