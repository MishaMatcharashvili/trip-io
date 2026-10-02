"use client";

import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { preconnect } from "react-dom";
import { GEORGIA_BBOX } from "../../domain/geo.ts";
import { env } from "../../lib/env.ts";
import { cx } from "../cx.ts";
import { mountOverlays, type Overlays } from "./overlays.ts";
import {
  applyStyle,
  borrow,
  giveBack,
  type Lease,
  setInteractive,
} from "./pool.ts";
import { mountStops, type StopsLayer } from "./stops.tsx";
import { useMapStyle } from "./use-map-style.ts";

// The real map: Mapbox GL JS, in Mapbox's light or dark style. The trip on top of it
// follows the canvas — the route in periwinkle, because it is the plan the
// agent is watching, solid where you have driven and dashed ahead; a stop you
// have passed ringed in periwinkle, one ahead in grey, the one you are in
// filled and pulsing; coral only where something real has happened to a stop.
// The stops themselves live in stops.tsx, the lines in overlays.ts.
//
// The map itself is not this component's: it borrows the page's one map from
// the pool (pool.ts), draws this trip on it, and hands it back on the way out.
//
// Mapbox's logo and attribution are drawn by Mapbox in the map's bottom
// corners and may not be covered: whatever floats over a map leaves them clear.

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
  /**
   * How much it matters, for the one that stands for a group when pins are too
   * close to draw apart. Higher wins; nothing, 0.
   */
  weight?: number;
};

/**
 * The road to draw: one line per pair of consecutive stops, as returned by the
 * routing provider. There is no default and no straight-line stand-in; a map
 * without one draws its stops alone.
 */
export type MapRoute = {
  /** Leg i runs from stop i to stop i + 1. */
  legs: readonly (readonly LonLat[])[];
  /** Other ways between the same two stops, drawn beside the chosen one. */
  alternatives?: readonly (readonly LonLat[])[];
  /** Being replaced: drawn faded so it does not pass for current. */
  stale?: boolean;
  onPickAlternative?: (index: number) => void;
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
export type MapLayers = {
  route: boolean;
  weather: boolean;
  roads: boolean;
  /**
   * Mapbox's traffic layer: congestion where Mapbox has data. Separate from
   * the route's estimate, and it asks nothing of the Directions API.
   */
  traffic: boolean;
};

export const defaultLayers: MapLayers = {
  route: true,
  weather: true,
  roads: true,
  traffic: false,
};

/** What the map's own controls (zoom, recentre) drive. */
export type TripMapHandle = {
  zoomIn(): void;
  zoomOut(): void;
  recentre(): void;
};

const TOKEN = env.NEXT_PUBLIC_MAPBOX_TOKEN;
/** Fitting a single village should not zoom to its rooftops (Mapbox zoom). */
const MAX_FIT_ZOOM = 12;

type Padding =
  | number
  | { top: number; right: number; bottom: number; left: number };

// Watches the theme attribute the theme script keeps: a change restyles the
// map, and the trip's layers are added again on top of the new style.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
const readTheme = () =>
  document.documentElement.getAttribute("data-theme") ?? "light";

export function TripMap({
  stops,
  route,
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
  route?: MapRoute | null;
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
  // Tiles and styles load from Mapbox's own host: open the connection while
  // the page's scripts are still arriving. Rendered on the server too, so the
  // hint is in the first HTML.
  if (TOKEN) preconnect("https://api.mapbox.com");

  const slot = useRef<HTMLDivElement>(null);
  const [lease, setLease] = useState<Lease | null>(null);
  const [failed, setFailed] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  const latest = useRef({ stops, route, fitPadding, onSelect });
  latest.current = { stops, route, fitPadding, onSelect };

  // Whether stops are buttons; the handler itself is read through `latest`, so
  // a new function on every render does not rebuild every marker.
  const selectable = onSelect !== undefined;

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => lease?.map.zoomIn(),
      zoomOut: () => lease?.map.zoomOut(),
      recentre: () => {
        if (lease) frame(lease, latest.current);
      },
    }),
    [lease],
  );

  // Borrow the page's map and frame this trip on it. A layout effect, so the
  // previous page hands the map back in the same commit, before this one
  // asks for it, and the map is in place before the browser paints. The theme
  // is not a dependency: a Mapbox map is restyled in place (below), never
  // rebuilt.
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el || !TOKEN) return;
    let held: Lease | null = null;

    const cancel = borrow(
      el,
      TOKEN,
      (l) => {
        held = l;
        setInteractive(l.map, interactive);
        frame(l, latest.current);
        setLease(l);
      },
      () => setFailed(true),
    );

    return () => {
      cancel();
      if (held) giveBack(held);
      setLease(null);
    };
  }, [interactive]);

  // A theme or style change restyles the map it is on: the style drops the
  // trip's layers, and the overlays put them back when it has loaded.
  const style = useMapStyle();
  useEffect(() => {
    if (lease) applyStyle(lease, style, theme === "dark" ? "dark" : "light");
  }, [lease, theme, style]);

  // The stops (stops.tsx): mounted once per borrowed map, then told what
  // changed. Removed again before the next borrower mounts its own.
  const [stopsLayer, setStopsLayer] = useState<StopsLayer | null>(null);
  useEffect(() => {
    if (!lease) return;
    const layer = mountStops(
      lease.mapbox,
      lease.map,
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

  // The road, the event areas and the traffic layer (overlays.ts).
  const [overlays, setOverlays] = useState<Overlays | null>(null);
  useEffect(() => {
    if (!lease) return;
    const mounted = mountOverlays(lease.map);
    setOverlays(mounted);
    return () => {
      mounted.remove();
      setOverlays(null);
    };
  }, [lease]);

  useEffect(() => {
    if (!overlays) return;
    // Legs that no longer match the stops (one added since) are not drawn.
    const matches = route && route.legs.length === stops.length - 1;
    overlays.setRoute(
      {
        legs: matches
          ? route.legs.map((path, i) => ({
              path,
              done: stops[i + 1].state !== "upcoming",
            }))
          : [],
        alternatives: matches ? (route.alternatives ?? []) : [],
        stale: Boolean(route?.stale),
        visible: layers.route,
      },
      (index) => route?.onPickAlternative?.(index),
    );
  }, [overlays, route, stops, layers.route]);

  useEffect(() => {
    overlays?.setEvents({
      events,
      families: [
        ...(layers.weather ? ["weather"] : []),
        ...(layers.roads ? ["road"] : []),
      ],
    });
  }, [overlays, events, layers.weather, layers.roads]);

  useEffect(() => {
    overlays?.setTraffic(layers.traffic);
  }, [overlays, layers.traffic]);

  // Reframe when the stops themselves change (one added, moved or reordered),
  // never on a pan, a zoom or a route arriving: the camera is the reader's.
  const stopKey = stops.map((s) => `${s.id}:${s.lonLat}`).join("|");
  const framedFor = useRef(stopKey);
  useEffect(() => {
    if (!lease || framedFor.current === stopKey) return;
    framedFor.current = stopKey;
    frame(lease, latest.current);
  }, [lease, stopKey]);

  if (!TOKEN || failed) {
    // No map available (a checkout without a key, a blocked script, offline):
    // the ground colour alone, rather than a broken map. The screen's own
    // itinerary list is what the traveller reads.
    return (
      <div
        className={cx(
          "grid place-items-center bg-map-ground p-4 text-center text-mini text-ink-faint",
          className,
        )}
        role="img"
        aria-label={`Map unavailable. Stops: ${stops.map((s) => s.label).join(", ")}`}
      >
        {failed ? "The map could not be loaded." : null}
      </div>
    );
  }

  return (
    <section
      ref={slot}
      // Isolated: the pins and their names are positioned with z-indexes of
      // their own (the picked one above the rest), and without a stacking
      // context here they would be compared with the panels floating over the
      // map, and a name would be drawn across a panel.
      className={cx("isolate bg-map-ground", className)}
      aria-label={`Map of the trip: ${stops.map((s) => s.label).join(", ")}`}
    />
  );
}

/** Fit the camera to the trip, leaving room for what floats over the map. */
function frame(
  lease: Lease,
  trip: {
    stops: readonly MapStop[];
    route?: MapRoute | null;
    fitPadding: Padding;
  },
) {
  const { map, mapbox } = lease;
  const points = [
    ...trip.stops.map((s) => s.lonLat),
    ...(trip.route?.legs.flat() ?? []),
  ];
  if (points.length === 0) {
    const { west, south, east, north } = GEORGIA_BBOX;
    points.push([west, south], [east, north]);
  }
  const bounds = new mapbox.LngLatBounds();
  for (const point of points) bounds.extend(point);
  map.fitBounds(bounds, {
    padding: trip.fitPadding,
    // Fitting a single point (or a village) would otherwise zoom to rooftops.
    maxZoom: MAX_FIT_ZOOM,
    duration: 0,
  });
}
