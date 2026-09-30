"use client";

import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Supercluster from "supercluster";
import { cx } from "../cx.ts";
import type { Mapbox } from "./mapbox.ts";
import { stopIcon } from "./stop-icon.ts";
import type { MapStop } from "./trip-map.tsx";

// The trip's stops on the map, as Mapbox HTML markers. A pin is a
// design-system component (a lucide glyph or the place's own logo, themed by
// CSS), rendered by one React root through portals into each marker's element.
//
// Stops closer than a pin's width merge into a count, so a day in Tbilisi
// reads as "6" at the country's scale instead of six pins on top of each
// other; a tap on the count zooms in until they part. A stop's name shows once
// the map is close enough to have room for it, and always for the stop you
// picked and the one you are at.

/** From this zoom on every stop carries its name (Mapbox zoom, 512 px tiles). */
const LABEL_ZOOM = 10;
/** Stops closer than this, in pixels, merge into a count. */
const CLUSTER_RADIUS_PX = 40;
const CLUSTER_MAX_ZOOM = 13;

export type StopsLayer = {
  update(stops: readonly MapStop[], selectedId: string | null): void;
  remove(): void;
};

/** Above the others: the one picked, where you are, then trouble. */
const zIndex = (stop: MapStop, selected: boolean, index: number) =>
  selected ? 3000 : stop.state === "now" ? 2000 : stop.disrupted ? 1000 : index;

type Point = { id: string };

/**
 * Puts the stops on a map. `update` whenever the stops or the selection
 * change; `remove` when the map goes.
 */
export function mountStops(
  mapbox: Mapbox,
  map: MapboxMap,
  onSelect: ((id: string) => void) | null,
): StopsLayer {
  let stops: readonly MapStop[] = [];
  let selectedId: string | null = null;
  let labels = map.getZoom() >= LABEL_ZOOM;
  let zoom = Math.floor(map.getZoom());
  let index = new Supercluster<Point>({
    radius: CLUSTER_RADIUS_PX,
    maxZoom: CLUSTER_MAX_ZOOM,
  });
  // A stop's element outlives its marker: a stop that is merged into a count
  // and comes back is the same pin, with its logo already loaded.
  const pins = new Map<string, HTMLElement>();
  // What is on the map now: a stop (key `s:id`) or a count (key `c:…`).
  const markers = new Map<string, Marker>();
  const root = createRoot(document.createElement("div"));

  const byId = () => new Map(stops.map((s) => [s.id, s]));

  const render = (visible: ReadonlySet<string>) => {
    const lookup = byId();
    root.render(
      [...pins]
        .filter(([id]) => visible.has(id))
        .map(([id, el]) => {
          const stop = lookup.get(id);
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

  const countElement = (members: readonly MapStop[], zoomIn: () => void) => {
    const ring = document.createElement(onSelect ? "button" : "span");
    ring.textContent = String(members.length);
    ring.className = cx(
      "grid size-[32px] place-items-center rounded-full border-2 bg-surface text-[12px] font-semibold tabular-nums text-ink shadow-chip",
      members.some((s) => s.disrupted)
        ? "border-alert-bright"
        : members.some((s) => s.state === "now")
          ? "border-agent"
          : "border-hairline-strong",
      onSelect && "cursor-pointer",
    );
    if (onSelect) {
      ring.setAttribute("type", "button");
      ring.setAttribute("aria-label", `${members.length} stops here. Zoom in`);
      ring.addEventListener("click", (event) => {
        event.stopPropagation();
        zoomIn();
      });
    } else {
      ring.setAttribute("aria-hidden", "true");
    }
    return ring;
  };

  // Which markers the current zoom calls for, added and removed to match. Runs
  // when the whole-number zoom changes or the stops do, not on every frame.
  const place = () => {
    const lookup = byId();
    const wanted = new Set<string>();
    const visible = new Set<string>();
    const features = index.getClusters([-180, -90, 180, 90], zoom);

    features.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as
        | { cluster: true; cluster_id: number }
        | (Point & { cluster?: false });
      if (props.cluster) {
        const members = index
          .getLeaves(props.cluster_id, Infinity)
          .map((leaf) => lookup.get(leaf.properties.id))
          .filter((s): s is MapStop => Boolean(s));
        const key = `c:${members
          .map((s) => s.id)
          .sort()
          .join(",")}`;
        wanted.add(key);
        if (markers.has(key)) return;
        const el = document.createElement("div");
        const clusterId = props.cluster_id;
        el.append(
          countElement(members, () =>
            // Far enough in that these stops part, and no further than needed.
            map.easeTo({
              center: [lng, lat],
              zoom: Math.min(
                map.getMaxZoom(),
                index.getClusterExpansionZoom(clusterId),
              ),
            }),
          ),
        );
        el.style.zIndex = String(500 + members.length);
        markers.set(
          key,
          new mapbox.Marker({ element: el }).setLngLat([lng, lat]).addTo(map),
        );
        return;
      }
      const stop = lookup.get(props.id);
      if (!stop) return;
      const key = `s:${stop.id}`;
      wanted.add(key);
      visible.add(stop.id);
      let el = pins.get(stop.id);
      if (!el) {
        el = document.createElement("div");
        pins.set(stop.id, el);
      }
      el.style.zIndex = String(
        zIndex(stop, stop.id === selectedId, stops.indexOf(stop)),
      );
      const existing = markers.get(key);
      if (existing) existing.setLngLat([lng, lat]);
      else {
        markers.set(
          key,
          new mapbox.Marker({ element: el }).setLngLat([lng, lat]).addTo(map),
        );
      }
    });

    for (const [key, marker] of markers) {
      if (wanted.has(key)) continue;
      marker.remove();
      markers.delete(key);
    }
    render(visible);
  };

  const onZoom = () => {
    const next = map.getZoom() >= LABEL_ZOOM;
    const whole = Math.floor(map.getZoom());
    const labelsChanged = next !== labels;
    labels = next;
    if (whole !== zoom) {
      zoom = whole;
      place();
    } else if (labelsChanged) {
      place();
    }
  };
  map.on("zoom", onZoom);

  return {
    update(nextStops, nextSelected) {
      const positions = (list: readonly MapStop[]) =>
        list.map((s) => `${s.id}:${s.lonLat}`).join("|");
      const moved = positions(nextStops) !== positions(stops);
      stops = nextStops;
      selectedId = nextSelected;
      if (moved) {
        index = new Supercluster<Point>({
          radius: CLUSTER_RADIUS_PX,
          maxZoom: CLUSTER_MAX_ZOOM,
        });
        index.load(
          stops.map((s) => ({
            type: "Feature" as const,
            properties: { id: s.id },
            geometry: { type: "Point" as const, coordinates: s.lonLat },
          })),
        );
        // A stop that is gone leaves its element behind for nobody.
        const ids = new Set(stops.map((s) => s.id));
        for (const id of [...pins.keys()]) if (!ids.has(id)) pins.delete(id);
      }
      place();
    },
    remove() {
      map.off("zoom", onZoom);
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      pins.clear();
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
