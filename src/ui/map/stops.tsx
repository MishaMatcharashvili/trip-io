"use client";

import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { cx } from "../cx.ts";
import { clusterIndex, LABEL_ZOOM, leader } from "./cluster.ts";
import type { Mapbox } from "./mapbox.ts";
import { stopIcon } from "./stop-icon.ts";
import type { MapStop } from "./trip-map.tsx";

// The trip's stops on the map, as Mapbox HTML markers. A pin is a
// design-system component (a lucide glyph or the place's own logo, themed by
// CSS), rendered by one React root through portals into each marker's element.
//
// Stops closer than a pin's width are drawn as one: the pin of the stop that
// matters most among them, with "+N" for the rest. A count alone said nothing —
// "17" is not a place — where this says what is there and lets the traveller go
// to it; a tap on "+N" zooms in until they part, a tap on the pin picks that
// stop. What matters is the stop's weight (MapStop.weight: how prominent a
// catalogue place is, how big a stop in a day), with the stop you picked, the one
// you are at and one with trouble always winning their group. A stop's name shows
// once the map is close enough to have room for it, and always for a group's
// leader, the stop you picked and the one you are at.

export type StopsLayer = {
  update(stops: readonly MapStop[], selectedId: string | null): void;
  remove(): void;
};

/** Above the others: the one picked, where you are, then trouble. */
const zIndex = (stop: MapStop, selected: boolean, index: number) =>
  selected
    ? 3000
    : stop.state === "now"
      ? 2000
      : stop.disrupted
        ? 1000
        : // The more prominent over the less, and later over earlier among equals.
          Math.round(stop.weight ?? 0) * 4 + Math.min(3, index % 4);

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
  // Loaded from the start, even with no stops: it is asked on every zoom.
  let index = clusterIndex([]);
  // A stop's element outlives its marker: a stop that is merged into a count
  // and comes back is the same pin, with its logo already loaded.
  const pins = new Map<string, HTMLElement>();
  // What is on the map now: a stop (key `s:id`) or a count (key `c:…`).
  const markers = new Map<string, Marker>();
  const root = createRoot(document.createElement("div"));

  const byId = () => new Map(stops.map((s) => [s.id, s]));
  // The groups on the map now, by their leader: how many more it stands for and
  // how to zoom to where they part.
  const badges = new Map<string, { extra: number; zoomIn: () => void }>();

  /** What decides which stop leads a group: the traveller's own state first. */
  const standing = (s: MapStop) =>
    (s.id === selectedId ? 5000 : 0) +
    (s.disrupted ? 1000 : 0) +
    (s.state === "now" ? 500 : 0) +
    (s.weight ?? 0);

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
                    labels ||
                    stop.id === selectedId ||
                    stop.state === "now" ||
                    badges.has(id)
                  }
                  badge={badges.get(id)}
                  onSelect={onSelect}
                />,
                el,
                id,
              )
            : null;
        }),
    );
  };

  // Which markers the current zoom calls for, added and removed to match. Runs
  // when the whole-number zoom changes or the stops do, not on every frame.
  const place = () => {
    const lookup = byId();
    const wanted = new Set<string>();
    const visible = new Set<string>();
    const features = index.getClusters([-180, -90, 180, 90], zoom);
    badges.clear();

    // One stop's pin on the map: new, or moved to where its group now is.
    const draw = (stop: MapStop, lng: number, lat: number) => {
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
    };

    features.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as
        | { cluster: true; cluster_id: number }
        | { id: string; cluster?: false };
      if (props.cluster) {
        const members = index
          .getLeaves(props.cluster_id, Infinity)
          .map((leaf) => lookup.get(leaf.properties.id))
          .filter((s): s is MapStop => Boolean(s));
        if (members.length === 0) return;
        // The group is drawn as its leader, at the group's own place.
        const head = leader(
          members.map((s) => ({ id: s.id, weight: standing(s) })),
        );
        const stop = lookup.get(head.id);
        if (!stop) return;
        const clusterId = props.cluster_id;
        badges.set(stop.id, {
          extra: members.length - 1,
          zoomIn: () =>
            // Far enough in that these stops part, and no further than needed.
            map.easeTo({
              center: [lng, lat],
              zoom: Math.min(
                map.getMaxZoom(),
                index.getClusterExpansionZoom(clusterId),
              ),
            }),
        });
        draw(stop, lng, lat);
        return;
      }
      const stop = lookup.get(props.id);
      if (!stop) return;
      draw(stop, lng, lat);
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
        index = clusterIndex(stops);
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
  badge,
  onSelect,
}: {
  stop: MapStop;
  selected: boolean;
  labelled: boolean;
  /** How many more stops this pin stands for, and how to zoom to them. */
  badge?: { extra: number; zoomIn: () => void };
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
    <span
      data-stop-label
      className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[12px] font-medium text-map-label-strong [text-shadow:0_0_3px_var(--color-map-ground),0_0_3px_var(--color-map-ground),0_0_6px_var(--color-map-ground)]"
    >
      {stop.label}
    </span>
  ) : null;

  const more = badge ? (
    onSelect ? (
      <button
        type="button"
        aria-label={`${badge.extra} more stops here. Zoom in`}
        onClick={(event) => {
          event.stopPropagation();
          badge.zoomIn();
        }}
        className="absolute -right-2.5 -top-2.5 z-10 grid h-[18px] min-w-[18px] cursor-pointer place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums text-canvas shadow-chip"
      >
        +{badge.extra}
      </button>
    ) : (
      <span
        aria-hidden="true"
        className="absolute -right-2.5 -top-2.5 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums text-canvas shadow-chip"
      >
        +{badge.extra}
      </span>
    )
  ) : null;

  if (!onSelect) {
    return (
      <span aria-hidden="true" className="relative block">
        {body}
        {more}
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
      {more}
      {name}
    </span>
  );
}
