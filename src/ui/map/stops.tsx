"use client";

import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { cx } from "../cx.ts";
import { stopIcon } from "./stop-icon.ts";
import type { LonLat, MapStop } from "./trip-map.tsx";

// The trip's stops on the map. Three parts, each doing what it is good at:
//
// - A clustered GeoJSON source. Stops closer than a pin's width merge into a
//   count, so a day in Tbilisi reads as "6" at the country's scale instead of
//   six pins on top of each other; a tap on the count zooms in until they part.
// - A symbol layer for the names. MapLibre places them with collision
//   detection, against each other and against the basemap's own labels, and
//   drops what does not fit rather than printing it over something else. An
//   invisible icon the size of a pin sits under each name, so a name also
//   keeps clear of the other stops' pins.
// - HTML markers for the pins themselves, rendered by one React root through
//   portals: a pin is a design-system component (lucide glyph or the place's
//   own logo, themed by CSS), which a WebGL layer could not be.

export const STOP_SOURCE = "trip-stops";
const LABEL_LAYER = "trip-stop-labels";
const SLOT_IMAGE = "trip-stop-slot";
/** The pin's box, in pixels: what a name must keep clear of. */
const PIN_PX = 30;

type Entry =
  | { key: string; type: "stop"; id: string; lonLat: LonLat }
  | {
      key: string;
      type: "cluster";
      clusterId: number;
      count: number;
      lonLat: LonLat;
      now: boolean;
      disrupted: boolean;
    };

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function stopData(
  stops: readonly MapStop[],
  selectedId: string | null,
): GeoJSONSourceSpecification["data"] {
  return {
    type: "FeatureCollection",
    features: stops.map((s) => ({
      type: "Feature",
      properties: {
        id: s.id,
        label: s.label,
        state: s.state,
        disrupted: Boolean(s.disrupted),
        // Which name wins a collision: the one you picked, where you are,
        // then trouble, then the rest.
        rank:
          s.id === selectedId ? 0 : s.state === "now" ? 1 : s.disrupted ? 2 : 3,
      },
      geometry: { type: "Point", coordinates: [...s.lonLat] },
    })),
  };
}

/** The source and name layer; again after every setStyle, which drops both. */
function addLayers(map: MapLibreMap, data: GeoJSONSourceSpecification["data"]) {
  if (map.getSource(STOP_SOURCE)) return;
  if (!map.hasImage(SLOT_IMAGE)) {
    map.addImage(SLOT_IMAGE, {
      width: PIN_PX,
      height: PIN_PX,
      data: new Uint8Array(PIN_PX * PIN_PX * 4),
    });
  }
  map.addSource(STOP_SOURCE, {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 34,
    clusterMaxZoom: 15,
    clusterProperties: {
      now: ["any", ["==", ["get", "state"], "now"]],
      disrupted: ["any", ["get", "disrupted"]],
    },
  });
  map.addLayer({
    id: LABEL_LAYER,
    type: "symbol",
    source: STOP_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "symbol-sort-key": ["get", "rank"],
      "icon-image": SLOT_IMAGE,
      "icon-allow-overlap": true,
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Medium"],
      "text-size": ["case", ["<=", ["get", "rank"], 1], 12.5, 11.5],
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 1.45,
      "text-justify": "auto",
      "text-max-width": 9,
      "text-optional": true,
      "text-padding": 4,
    },
    paint: {
      "text-color": token("--color-map-label-strong"),
      "text-halo-color": token("--color-map-ground"),
      "text-halo-width": 1.6,
      "text-halo-blur": 0.4,
    },
  });
}

/** What the source shows right now: clusters, and the stops outside them. */
function visibleEntries(map: MapLibreMap): Entry[] {
  const seen = new Map<string, Entry>();
  for (const f of map.querySourceFeatures(STOP_SOURCE)) {
    const p = f.properties ?? {};
    const lonLat = (f.geometry as { coordinates: LonLat }).coordinates;
    if (p.cluster) {
      const key = `c${p.cluster_id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          type: "cluster",
          clusterId: p.cluster_id,
          count: p.point_count,
          lonLat,
          now: Boolean(p.now),
          disrupted: Boolean(p.disrupted),
        });
      }
    } else {
      const key = `s${p.id}`;
      if (!seen.has(key)) {
        seen.set(key, { key, type: "stop", id: String(p.id), lonLat });
      }
    }
  }
  return [...seen.values()];
}

export type StopsLayer = {
  update(stops: readonly MapStop[], selectedId: string | null): void;
  remove(): void;
};

/**
 * Puts the stops on a map and keeps them there across theme changes. `update`
 * whenever the stops or the selection change; `remove` when the map goes.
 */
export function mountStops(
  map: MapLibreMap,
  maplibre: typeof import("maplibre-gl"),
  onSelect: ((id: string) => void) | null,
): StopsLayer {
  let stops: readonly MapStop[] = [];
  let selectedId: string | null = null;
  let entries: Entry[] = [];
  let lastKeys = "";
  const markers = new Map<string, { marker: Marker; el: HTMLElement }>();
  const root = createRoot(document.createElement("div"));

  const render = () => {
    const byId = new Map(stops.map((s) => [s.id, s]));
    root.render(
      entries.map((e) => {
        const el = markers.get(e.key)?.el;
        if (!el) return null;
        if (e.type === "cluster") {
          return createPortal(
            <ClusterPin
              entry={e}
              onOpen={
                onSelect &&
                (() => {
                  map
                    .getSource<GeoJSONSource>(STOP_SOURCE)
                    ?.getClusterExpansionZoom(e.clusterId)
                    .then((zoom) =>
                      map.easeTo({ center: e.lonLat, zoom: zoom + 0.5 }),
                    )
                    .catch(() => {});
                })
              }
            />,
            el,
            e.key,
          );
        }
        const stop = byId.get(e.id);
        return stop
          ? createPortal(
              <StopPin
                stop={stop}
                selected={stop.id === selectedId}
                onSelect={onSelect}
              />,
              el,
              e.key,
            )
          : null;
      }),
    );
  };

  // Runs every frame MapLibre draws, so it does nothing unless the set of
  // clusters and stops on screen actually changed.
  const sync = () => {
    if (!map.getSource(STOP_SOURCE) || !map.isSourceLoaded(STOP_SOURCE)) return;
    const next = visibleEntries(map);
    const keys = next
      .map((e) => e.key)
      .sort()
      .join();
    if (keys === lastKeys) return;
    lastKeys = keys;
    const byId = new Map(stops.map((s) => [s.id, s]));
    for (const [key, m] of markers) {
      if (!next.some((e) => e.key === key)) {
        m.marker.remove();
        markers.delete(key);
      }
    }
    for (const e of next) {
      if (markers.has(e.key)) continue;
      const el = document.createElement("div");
      // Stops keep their exact point; a cluster sits where the source put it.
      const at =
        e.type === "stop" ? (byId.get(e.id)?.lonLat ?? e.lonLat) : e.lonLat;
      const marker = new maplibre.Marker({ element: el, anchor: "center" })
        .setLngLat(at)
        .addTo(map);
      markers.set(e.key, { marker, el });
    }
    entries = next;
    render();
  };

  const onStyle = () => addLayers(map, stopData(stops, selectedId));
  map.on("style.load", onStyle);
  map.on("render", sync);
  if (map.isStyleLoaded()) onStyle();

  return {
    update(nextStops, nextSelected) {
      stops = nextStops;
      selectedId = nextSelected;
      map
        .getSource<GeoJSONSource>(STOP_SOURCE)
        ?.setData(stopData(stops, selectedId));
      // A new stop list can keep the same keys; move the pins that stayed.
      const byId = new Map(stops.map((s) => [s.id, s]));
      for (const e of entries) {
        const stop = e.type === "stop" ? byId.get(e.id) : undefined;
        if (stop) markers.get(e.key)?.marker.setLngLat(stop.lonLat);
      }
      lastKeys = "";
      render();
    },
    remove() {
      map.off("style.load", onStyle);
      map.off("render", sync);
      for (const m of markers.values()) m.marker.remove();
      markers.clear();
      // Unmounting inside React's own commit warns; the map's cleanup runs in one.
      queueMicrotask(() => root.unmount());
    },
  };
}

function StopPin({
  stop,
  selected,
  onSelect,
}: {
  stop: MapStop;
  selected: boolean;
  onSelect: ((id: string) => void) | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const Glyph = stopIcon(stop.category, stop.kind);
  const logo = stop.logo && !logoFailed ? stop.logo : null;
  const now = stop.state === "now";

  const pin = cx(
    "relative grid size-[28px] place-items-center rounded-full border-2 shadow-chip transition-transform",
    stop.disrupted
      ? now
        ? "border-alert-bright bg-alert-bright text-on-accent"
        : "border-alert-bright bg-surface text-alert"
      : now
        ? "border-agent bg-agent text-on-accent"
        : stop.state === "done"
          ? "border-agent bg-surface text-agent"
          : "border-hairline-strong bg-surface text-ink-muted",
    selected &&
      "scale-110 ring-2 ring-agent ring-offset-2 ring-offset-map-ground",
  );

  const body = (
    <span className={pin}>
      {now ? (
        // The halo's strength lives on a wrapper: `breathe` animates opacity
        // between 1 and 0.3, and would otherwise override it into a solid disc.
        <span className="pointer-events-none absolute -inset-[7px] -z-10 opacity-25">
          <span
            className={cx(
              "block size-full animate-breathe rounded-full",
              stop.disrupted ? "bg-alert-bright" : "bg-agent",
            )}
          />
        </span>
      ) : null}
      {logo ? (
        // Logos are drawn for white; the tile keeps them legible in dark mode.
        // biome-ignore lint/performance/noImgElement: a map marker, outside next/image's layout
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setLogoFailed(true)}
          className="size-[20px] rounded-full bg-white object-contain p-px"
        />
      ) : (
        <Glyph size={14} strokeWidth={2.25} aria-hidden="true" />
      )}
    </span>
  );

  if (!onSelect) return <span aria-hidden="true">{body}</span>;
  return (
    <button
      type="button"
      aria-label={stop.label}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(stop.id);
      }}
      className="block cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-agent"
    >
      {body}
    </button>
  );
}

function ClusterPin({
  entry,
  onOpen,
}: {
  entry: Extract<Entry, { type: "cluster" }>;
  /** Null on a map that is only a picture: the count is not a control. */
  onOpen: (() => void) | null;
}) {
  const ring = cx(
    "grid size-[32px] place-items-center rounded-full border-2 bg-surface text-[12px] font-semibold tabular-nums text-ink shadow-chip",
    entry.disrupted
      ? "border-alert-bright"
      : entry.now
        ? "border-agent"
        : "border-hairline-strong",
  );
  if (!onOpen) {
    return (
      <span aria-hidden="true" className={ring}>
        {entry.count}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${entry.count} stops here. Zoom in`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={cx(ring, "cursor-pointer")}
    >
      {entry.count}
    </button>
  );
}
