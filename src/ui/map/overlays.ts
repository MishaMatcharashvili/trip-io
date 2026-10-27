import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import type { LonLat } from "../../domain/geo.ts";
import { type LegState, routeEnds } from "./route-states.ts";
import type { MapEvent } from "./trip-map.tsx";

// What the trip draws over the basemap besides its stops: the road route, the
// alternatives beside it, the areas of the world events that touch it, and
// Mapbox's traffic layer. All of it in the design's tokens, from GeoJSON
// sources the map updates in place.
//
// A style change (the theme) drops every source and layer, so they are added
// again when the new style has loaded, from the state kept here. Nothing about
// the route is recomputed by that: the geometry is the one already returned.

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** One stretch of the route: the road, and whether it is covered, being driven or still ahead. */
export type DrawnLeg = { path: readonly LonLat[]; state: LegState };

export type RouteDraw = {
  legs: readonly DrawnLeg[];
  /** Other ways between the same two stops, drawn beside the chosen one. */
  alternatives: readonly (readonly LonLat[])[];
  /** Dimmed while an answer for other stops is being replaced. */
  stale: boolean;
  visible: boolean;
};

export type EventDraw = {
  events: readonly MapEvent[];
  /** The families (weather, road) currently switched on. */
  families: readonly string[];
};

export type Overlays = {
  setRoute(route: RouteDraw, onPickAlternative: (index: number) => void): void;
  setEvents(draw: EventDraw): void;
  setTraffic(on: boolean): void;
  remove(): void;
};

const SRC = {
  alternatives: "trip-alternatives",
  route: "trip-route",
  ends: "trip-route-ends",
  events: "trip-events",
  traffic: "trip-traffic",
} as const;
const LAYER = {
  traffic: "trip-traffic",
  eventFill: "trip-events-fill",
  eventLine: "trip-events-line",
  eventPoint: "trip-events-point",
  alternatives: "trip-alternatives",
  casing: "trip-route-casing",
  ahead: "trip-route-ahead",
  done: "trip-route-done",
  current: "trip-route-current",
  arrows: "trip-route-arrows",
  endRing: "trip-route-end-ring",
  endTag: "trip-route-end-tag",
} as const;

/** The chevron laid along the road, in the map's image store. */
const ARROW = "trip-route-arrow";

/**
 * A chevron pointing right (the direction a line runs), drawn once and
 * recoloured per layer: an SDF image takes `icon-color`. Images are dropped
 * with the style, so `install` puts it back each time.
 */
function arrowImage(): ImageData {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.lineWidth = 6;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "#000";
  g.beginPath();
  g.moveTo(11, 7);
  g.lineTo(21, 16);
  g.lineTo(11, 25);
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

/** Mapbox's own live-and-historical traffic tileset, read by the browser token. */
const TRAFFIC_TILESET = "mapbox://mapbox.mapbox-traffic-v1";

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const line = (path: readonly LonLat[], properties = {}) => ({
  type: "Feature" as const,
  properties,
  geometry: { type: "LineString" as const, coordinates: path as LonLat[] },
});

export function mountOverlays(map: MapboxMap): Overlays {
  let route: RouteDraw | null = null;
  let pick: (index: number) => void = () => {};
  let event: EventDraw = { events: [], families: [] };
  let traffic = false;
  let removed = false;

  const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

  const drawRoute = () => {
    const fade = route?.stale ? 0.45 : 1;
    const visible = Boolean(route?.visible);
    const legs = route?.legs ?? [];
    source(SRC.route)?.setData({
      type: "FeatureCollection",
      features: visible
        ? legs.map((l) => line(l.path, { state: l.state }))
        : [],
    });
    source(SRC.ends)?.setData({
      type: "FeatureCollection",
      features: visible
        ? routeEnds(legs.map((l) => l.path)).map((end) => ({
            type: "Feature" as const,
            properties: { kind: end.kind, label: end.label },
            geometry: { type: "Point" as const, coordinates: end.at },
          }))
        : [],
    });
    source(SRC.alternatives)?.setData({
      type: "FeatureCollection",
      features: visible
        ? (route?.alternatives ?? []).map((path, index) =>
            line(path, { index }),
          )
        : [],
    });
    for (const [id, base] of [
      [LAYER.alternatives, 0.75],
      [LAYER.casing, 0.9],
      [LAYER.ahead, 1],
      [LAYER.done, 1],
      [LAYER.current, 1],
    ] as const) {
      if (map.getLayer(id))
        map.setPaintProperty(id, "line-opacity", base * fade);
    }
    // Everything else on the route fades with it.
    for (const [id, prop] of [
      [LAYER.arrows, "icon-opacity"],
      [LAYER.endRing, "circle-stroke-opacity"],
      [LAYER.endTag, "text-opacity"],
    ] as const) {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, fade);
    }
  };

  const drawEvents = () => {
    source(SRC.events)?.setData({
      type: "FeatureCollection",
      features: event.events.map((e) => ({
        type: "Feature" as const,
        properties: { id: e.id, family: e.kind.split(".")[0] },
        geometry: e.geometry as never,
      })),
    });
    const filter = ["in", ["get", "family"], ["literal", [...event.families]]];
    for (const id of [LAYER.eventFill, LAYER.eventLine, LAYER.eventPoint]) {
      if (map.getLayer(id)) {
        // The geometry type is kept in each layer's own filter.
        const kind =
          id === LAYER.eventFill
            ? ["==", ["geometry-type"], "Polygon"]
            : id === LAYER.eventLine
              ? [
                  "in",
                  ["geometry-type"],
                  ["literal", ["Polygon", "LineString"]],
                ]
              : ["==", ["geometry-type"], "Point"];
        map.setFilter(id, ["all", kind, filter] as never);
      }
    }
  };

  const drawTraffic = () => {
    if (map.getLayer(LAYER.traffic)) {
      // Hidden, the layer asks for no tiles: the switch costs nothing while off.
      map.setLayoutProperty(
        LAYER.traffic,
        "visibility",
        traffic ? "visible" : "none",
      );
    }
  };

  const install = () => {
    if (removed || map.getSource(SRC.route)) return;
    const agent = token("--color-agent");
    const quiet = token("--color-ink-faint");
    const muted = token("--color-ink-muted");
    const ink = token("--color-ink");
    const alert = token("--color-alert-bright");
    const ok = token("--color-ok");
    const surface = token("--color-surface");

    // Traffic first, so everything below sits on top of it.
    map.addSource(SRC.traffic, { type: "vector", url: TRAFFIC_TILESET });
    map.addLayer({
      id: LAYER.traffic,
      type: "line",
      source: SRC.traffic,
      "source-layer": "traffic",
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: traffic ? "visible" : "none",
      },
      minzoom: 6,
      // Congestion in neutral steps, not colour: colour here is spoken for
      // (periwinkle is the agent's route, coral a real disruption). Darker and
      // wider is slower; free-flowing roads are left as the basemap has them.
      filter: [
        "in",
        ["get", "congestion"],
        ["literal", ["moderate", "heavy", "severe"]],
      ],
      paint: {
        "line-color": [
          "match",
          ["get", "congestion"],
          "moderate",
          quiet,
          "heavy",
          muted,
          ink,
        ],
        "line-width": [
          "match",
          ["get", "congestion"],
          "moderate",
          2.5,
          "heavy",
          3.5,
          4.5,
        ],
        "line-opacity": 0.85,
      },
    });

    map.addSource(SRC.events, { type: "geojson", data: EMPTY });
    map.addLayer({
      id: LAYER.eventFill,
      type: "fill",
      source: SRC.events,
      paint: { "fill-color": alert, "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: LAYER.eventLine,
      type: "line",
      source: SRC.events,
      paint: { "line-color": alert, "line-opacity": 0.7, "line-width": 1.5 },
    });
    map.addLayer({
      id: LAYER.eventPoint,
      type: "circle",
      source: SRC.events,
      paint: {
        "circle-radius": 22,
        "circle-color": alert,
        "circle-opacity": 0.18,
        "circle-stroke-color": alert,
        "circle-stroke-opacity": 0.7,
        "circle-stroke-width": 1.5,
      },
    });

    for (const id of [SRC.alternatives, SRC.route, SRC.ends]) {
      map.addSource(id, { type: "geojson", data: EMPTY });
    }
    if (!map.hasImage(ARROW)) {
      map.addImage(ARROW, arrowImage(), { sdf: true, pixelRatio: 2 });
    }
    // Alternatives first, so the chosen route sits on top of them.
    map.addLayer({
      id: LAYER.alternatives,
      type: "line",
      source: SRC.alternatives,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": quiet, "line-opacity": 0.75, "line-width": 6 },
    });
    // One road, three states, each its own layer over one casing that lifts it
    // off the roads it follows. Not yet covered is grey, covered is green, the
    // stretch being driven is the agent's periwinkle: colour here says how far
    // along the traveller is, and the arrows say which way.
    const along = (state: LegState) => ["==", ["get", "state"], state] as never;
    map.addLayer({
      id: LAYER.casing,
      type: "line",
      source: SRC.route,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": surface, "line-opacity": 0.9, "line-width": 10 },
    });
    for (const [id, state, color] of [
      [LAYER.ahead, "ahead", quiet],
      [LAYER.done, "done", ok],
      [LAYER.current, "current", agent],
    ] as const) {
      map.addLayer({
        id,
        type: "line",
        source: SRC.route,
        filter: along(state),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-opacity": 1, "line-width": 6 },
      });
    }
    // Direction, along the line of every leg and so on top of all three states.
    // Overlap is allowed: a road driven out and back must show both ways.
    map.addLayer({
      id: LAYER.arrows,
      type: "symbol",
      source: SRC.route,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 64,
        "icon-image": ARROW,
        "icon-size": 0.5,
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-color": surface, "icon-opacity": 1 },
    });
    // Where it begins and where it ends: a ring round the first and last stop's
    // pin, and the word for it above.
    map.addLayer({
      id: LAYER.endRing,
      type: "circle",
      source: SRC.ends,
      paint: {
        "circle-radius": 22,
        "circle-color": surface,
        "circle-opacity": 0,
        "circle-stroke-color": ink,
        "circle-stroke-width": 2.5,
        "circle-stroke-opacity": 1,
      },
    });
    map.addLayer({
      id: LAYER.endTag,
      type: "symbol",
      source: SRC.ends,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        "text-size": 10.5,
        "text-letter-spacing": 0.08,
        "text-transform": "uppercase",
        "text-offset": [0, -2.5],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": ink,
        "text-halo-color": surface,
        "text-halo-width": 2,
      },
    });
    drawRoute();
    drawEvents();
    drawTraffic();
  };

  // Plain handlers that look for the layer, not layer-scoped ones: the layer
  // does not exist while a style is loading.
  const hit = (e: MapMouseEvent) =>
    map.getLayer(LAYER.alternatives)
      ? map.queryRenderedFeatures(e.point, { layers: [LAYER.alternatives] })
      : [];
  const onClick = (e: MapMouseEvent) => {
    const index = hit(e)[0]?.properties?.index;
    if (typeof index === "number") pick(index);
  };
  const onMove = (e: MapMouseEvent) => {
    map.getCanvas().style.cursor = hit(e).length ? "pointer" : "";
  };

  // Layers are added when the style is ready, and again after every style
  // change. Adding throws while the style is still loading; that means "wait".
  const reinstall = () => {
    try {
      install();
    } catch {
      map.once("style.load", reinstall);
    }
  };
  map.on("style.load", reinstall);
  map.on("click", onClick);
  map.on("mousemove", onMove);
  reinstall();

  return {
    setRoute(next, onPick) {
      route = next;
      pick = onPick;
      drawRoute();
    },
    setEvents(next) {
      event = next;
      drawEvents();
    },
    setTraffic(on) {
      traffic = on;
      drawTraffic();
    },
    remove() {
      removed = true;
      map.off("style.load", reinstall);
      map.off("click", onClick);
      map.off("mousemove", onMove);
      try {
        map.getCanvas().style.cursor = "";
        for (const id of Object.values(LAYER)) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of Object.values(SRC)) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        // The map is already gone, or mid-way through a style change.
      }
    },
  };
}
