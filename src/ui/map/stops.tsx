"use client";

import {
  MarkerClusterer,
  SuperClusterAlgorithm,
} from "@googlemaps/markerclusterer";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { cx } from "../cx.ts";
import type { GoogleMaps } from "./google.ts";
import { stopIcon } from "./stop-icon.ts";
import type { MapStop } from "./trip-map.tsx";

// The trip's stops on the map, as Advanced Markers. A pin is a design-system
// component (a lucide glyph or the place's own logo, themed by CSS), rendered
// by one React root through portals into each marker's content element.
//
// Stops closer than a pin's width merge into a count, so a day in Tbilisi
// reads as "6" at the country's scale instead of six pins on top of each
// other; a tap on the count zooms in until they part. A stop's name shows once
// the map is close enough to have room for it, and always for the stop you
// picked and the one you are at.

/** From this zoom on every stop carries its name. */
const LABEL_ZOOM = 11;
/** Stops closer than this, in pixels, merge into a count. */
const CLUSTER_RADIUS_PX = 40;
const CLUSTER_MAX_ZOOM = 14;

export type StopsLayer = {
  update(stops: readonly MapStop[], selectedId: string | null): void;
  remove(): void;
};

type Entry = {
  marker: google.maps.marker.AdvancedMarkerElement;
  el: HTMLElement;
};

/** Above the others: the one picked, where you are, then trouble. */
const zIndex = (stop: MapStop, selected: boolean, index: number) =>
  selected ? 3000 : stop.state === "now" ? 2000 : stop.disrupted ? 1000 : index;

/**
 * Puts the stops on a map. `update` whenever the stops or the selection
 * change; `remove` when the map goes.
 */
export function mountStops(
  g: GoogleMaps,
  map: google.maps.Map,
  onSelect: ((id: string) => void) | null,
): StopsLayer {
  const { AdvancedMarkerElement } = g.marker;
  let stops: readonly MapStop[] = [];
  let selectedId: string | null = null;
  let labels = (map.getZoom() ?? 0) >= LABEL_ZOOM;
  const entries = new Map<string, Entry>();
  const byMarker = new WeakMap<
    google.maps.marker.AdvancedMarkerElement,
    MapStop
  >();
  const root = createRoot(document.createElement("div"));

  const clusterer = new MarkerClusterer({
    map,
    markers: [],
    algorithm: new SuperClusterAlgorithm({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: CLUSTER_MAX_ZOOM,
    }),
    // A map that is only a picture does not zoom on a tap.
    onClusterClick: onSelect
      ? (_event, cluster, m) => {
          if (cluster.bounds) m.fitBounds(cluster.bounds, 64);
        }
      : () => {},
    renderer: {
      render: ({ count, position, markers }) => {
        const members = (markers ?? []).map((m) =>
          byMarker.get(m as google.maps.marker.AdvancedMarkerElement),
        );
        const el = document.createElement("div");
        el.style.transform = "translateY(50%)";
        const ring = document.createElement(onSelect ? "button" : "span");
        ring.textContent = String(count);
        ring.className = cx(
          "grid size-[32px] place-items-center rounded-full border-2 bg-surface text-[12px] font-semibold tabular-nums text-ink shadow-chip",
          members.some((s) => s?.disrupted)
            ? "border-alert-bright"
            : members.some((s) => s?.state === "now")
              ? "border-agent"
              : "border-hairline-strong",
          onSelect && "cursor-pointer",
        );
        if (onSelect) {
          ring.setAttribute("type", "button");
          ring.setAttribute("aria-label", `${count} stops here. Zoom in`);
        } else {
          ring.setAttribute("aria-hidden", "true");
        }
        el.append(ring);
        return new AdvancedMarkerElement({
          position,
          content: el,
          zIndex: 500 + count,
        });
      },
    },
  });

  const render = () => {
    const byId = new Map(stops.map((s) => [s.id, s]));
    root.render(
      [...entries].map(([id, { el }]) => {
        const stop = byId.get(id);
        return stop
          ? createPortal(
              <StopPin
                stop={stop}
                selected={stop.id === selectedId}
                labelled={
                  labels || stop.id === selectedId || stop.state === "now"
                }
                onSelect={onSelect}
              />,
              el,
              id,
            )
          : null;
      }),
    );
  };

  const zoomListener = map.addListener("zoom_changed", () => {
    const next = (map.getZoom() ?? 0) >= LABEL_ZOOM;
    if (next === labels) return;
    labels = next;
    render();
  });

  return {
    update(nextStops, nextSelected) {
      stops = nextStops;
      selectedId = nextSelected;
      const ids = new Set(stops.map((s) => s.id));
      for (const [id, { marker }] of entries) {
        if (ids.has(id)) continue;
        clusterer.removeMarker(marker);
        marker.map = null;
        entries.delete(id);
      }
      stops.forEach((stop, index) => {
        const position = { lat: stop.lonLat[1], lng: stop.lonLat[0] };
        let entry = entries.get(stop.id);
        if (!entry) {
          const el = document.createElement("div");
          // The content's bottom edge sits on the point; centre it instead.
          el.style.transform = "translateY(50%)";
          const marker = new AdvancedMarkerElement({ position, content: el });
          entry = { marker, el };
          entries.set(stop.id, entry);
          clusterer.addMarker(marker, true);
        }
        entry.marker.position = position;
        entry.marker.zIndex = zIndex(stop, stop.id === selectedId, index);
        byMarker.set(entry.marker, stop);
      });
      clusterer.render();
      render();
    },
    remove() {
      zoomListener.remove();
      clusterer.clearMarkers();
      clusterer.setMap(null);
      for (const { marker } of entries.values()) marker.map = null;
      entries.clear();
      // Unmounting inside React's own commit warns; the map's cleanup runs in one.
      queueMicrotask(() => root.unmount());
    },
  };
}

function StopPin({
  stop,
  selected,
  labelled,
  onSelect,
}: {
  stop: MapStop;
  selected: boolean;
  labelled: boolean;
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

  const name = labelled ? (
    <span className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[12px] font-medium text-map-label-strong [text-shadow:0_0_3px_var(--color-map-ground),0_0_3px_var(--color-map-ground),0_0_6px_var(--color-map-ground)]">
      {stop.label}
    </span>
  ) : null;

  if (!onSelect) {
    return (
      <span aria-hidden="true" className="relative block">
        {body}
        {name}
      </span>
    );
  }
  return (
    <span className="relative block">
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
      {name}
    </span>
  );
}
