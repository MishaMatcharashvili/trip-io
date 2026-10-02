"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Toggle } from "@/ui/control";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { googleMapsDirectionsUrl } from "@/ui/map/open-in-maps";
import {
  defaultLayers,
  type MapEvent,
  type MapLayers,
  type MapRoute,
  type MapStop,
  TripMap,
  type TripMapHandle,
} from "@/ui/map/trip-map";
import { useTripRoute } from "@/ui/map/use-trip-route";
import { Eyebrow, Num, Title } from "@/ui/text";
import { describeRoute } from "./route-model";
import { RouteSection } from "./route-section";

/** What the popover says about a stop opened from the map. */
export type StopCard = {
  id: string;
  title: string;
  time: string;
  duration: string;
  kind: string;
  conflict?: string;
  href: string;
  /** Where the conflict is decided, when there is an open alert for it. */
  alertHref?: string;
};

type Padding = { top: number; right: number; bottom: number; left: number };

/**
 * Room left for the panels floating over the map, per layout. On a phone the
 * map ends where the itinerary sheet begins (330px), so Mapbox's
 * logo and attribution at the map's foot are never under it; desktop panels stop
 * 30px short of the bottom for the same reason.
 */
const PADDING: Record<"desktop" | "mobile", Padding> = {
  desktop: { top: 60, right: 420, bottom: 110, left: 400 },
  mobile: { top: 170, right: 40, bottom: 40, left: 40 },
};

/**
 * The map as the trip screen's canvas: Mapbox full-bleed, with the design's
 * own zoom / recentre controls and layer switcher on desktop, and a stop opened
 * in a popover without leaving the map. On a phone a tapped stop opens its own
 * screen instead — there is no room beside the sheet for a popover.
 */
export function TripMapScreen({
  stops,
  events = [],
  cards,
  dimmed = false,
}: {
  stops: MapStop[];
  events?: MapEvent[];
  cards: StopCard[];
  dimmed?: boolean;
}) {
  const router = useRouter();
  const map = useRef<TripMapHandle>(null);
  const [layout, setLayout] = useState<"desktop" | "mobile" | null>(null);
  const [layers, setLayers] = useState<MapLayers>(defaultLayers);
  const [selected, setSelected] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);

  // The road: asked for when the stops change or the traveller asks again,
  // never on a pan, a zoom or a panel opening. Between exactly two stops the
  // provider may offer other ways, which are picked without asking again.
  const {
    route,
    selected: chosen,
    select: pickRoute,
    refresh,
  } = useTripRoute(stops, {
    alternatives: stops.length === 2,
  });
  const view = describeRoute(route, chosen, stops, new Date());
  const mapsUrl = googleMapsDirectionsUrl(stops.map((s) => s.lonLat));
  const drawn = drawnRoute(route, chosen, pickRoute);

  // The layout decides the map's padding, which it reads once when it is
  // built, so the map waits for it rather than fitting twice.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setLayout(query.matches ? "desktop" : "mobile");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const card = cards.find((c) => c.id === selected);
  const index = card ? cards.indexOf(card) : -1;

  const select = (id: string) => {
    if (layout === "mobile") {
      const target = cards.find((c) => c.id === id);
      if (target) router.push(target.href);
      return;
    }
    setSelected((current) => (current === id ? null : id));
  };

  const layer = (name: keyof MapLayers) => (on: boolean) =>
    setLayers((l) => ({ ...l, [name]: on }));

  const hasWeather = events.some((e) => e.kind.startsWith("weather"));
  const hasRoads = events.some((e) => e.kind.startsWith("road"));

  return (
    <>
      {layout ? (
        <TripMap
          key={layout}
          ref={map}
          stops={stops}
          route={drawn}
          events={events}
          layers={layers}
          selectedId={selected}
          onSelect={select}
          fitPadding={PADDING[layout]}
          className={
            layout === "mobile"
              ? "absolute inset-x-0 top-0 bottom-[330px]"
              : "absolute inset-0 size-full"
          }
        />
      ) : (
        <div className="absolute inset-0 bg-map-ground" aria-hidden="true" />
      )}
      {dimmed ? (
        <div
          className="pointer-events-none absolute inset-0 bg-canvas/40"
          aria-hidden="true"
        />
      ) : null}

      {layout === "mobile" && stops.length >= 2 ? (
        <div className="absolute bottom-[356px] right-3 z-20 flex max-w-[calc(100%-24px)] flex-col items-end gap-2 lg:hidden">
          {routeOpen ? (
            <Panel className="w-[264px] p-3">
              <RouteSection
                view={view}
                onRefresh={refresh}
                onPick={pickRoute}
                mapsUrl={mapsUrl}
              />
            </Panel>
          ) : null}
          <button
            type="button"
            aria-expanded={routeOpen}
            onClick={() => setRouteOpen((open) => !open)}
            className="rounded-full border border-hairline-strong bg-surface px-3 py-1.5 text-mini font-medium shadow-panel"
          >
            {view.kind === "ready"
              ? `${view.time} · ${view.distance}`
              : view.kind === "loading"
                ? "Finding the road…"
                : "Route"}
          </button>
        </div>
      ) : null}

      <div className="hidden lg:block">
        <div className="absolute bottom-[30px] right-6 z-20 w-[38px] overflow-hidden rounded-panel border border-hairline-strong bg-surface shadow-panel">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map.current?.zoomIn()}
            className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
          >
            <Icon name="plus" />
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map.current?.zoomOut()}
            className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
          >
            <Icon name="minus" />
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Recentre"
            onClick={() => map.current?.recentre()}
            className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
          >
            <Icon name="locate" size={15} />
          </button>
        </div>

        <Panel className="absolute bottom-[30px] right-[74px] z-20 max-h-[calc(100%-140px)] w-[240px] overflow-y-auto">
          <div className="px-3.5 py-2.5">
            <Eyebrow>Route</Eyebrow>
          </div>
          <Divider />
          <RouteSection
            view={view}
            onRefresh={refresh}
            onPick={pickRoute}
            mapsUrl={mapsUrl}
            className="px-3.5 py-2.5"
          />
          <Divider />
          <div className="px-3.5 py-2.5">
            <Eyebrow>Layers</Eyebrow>
          </div>
          <Divider />
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="flex-1 text-small">Route</span>
            <Toggle
              label="Route layer"
              size="sm"
              on={layers.route}
              onChange={layer("route")}
            />
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="flex-1 text-small">
              Traffic
              <span className="block text-mini text-ink-faint">
                Congestion where Mapbox has data
              </span>
            </span>
            <Toggle
              label="Traffic layer"
              size="sm"
              on={layers.traffic}
              onChange={layer("traffic")}
            />
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="flex-1 text-small">
              Weather
              {hasWeather ? null : (
                <span className="block text-mini text-ink-faint">
                  Nothing on your stops
                </span>
              )}
            </span>
            <Toggle
              label="Weather layer"
              size="sm"
              on={layers.weather}
              onChange={layer("weather")}
            />
          </div>
          <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-2.5">
            <span className="flex-1 text-small">
              Road incidents
              {hasRoads ? null : (
                <span className="block text-mini text-ink-faint">
                  None on your route
                </span>
              )}
            </span>
            <Toggle
              label="Road incidents layer"
              size="sm"
              on={layers.roads}
              onChange={layer("roads")}
            />
          </div>
        </Panel>

        {card ? (
          <Panel className="absolute left-[400px] top-5 z-20 w-[260px] overflow-hidden">
            <div className="flex items-center px-3.5 pt-3">
              <Eyebrow tone="agent">
                Stop {index + 1} of {cards.length}
              </Eyebrow>
              <div className="flex-1" />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(null)}
                className="text-ink-faint hover:text-ink"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 pb-3 pt-1.5">
              <Title className="text-[15px]">{card.title}</Title>
              <div className="flex gap-3.5">
                {[
                  { label: "Time", value: card.time },
                  { label: "Takes", value: card.duration },
                  { label: "Kind", value: card.kind },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-px">
                    <Eyebrow>{stat.label}</Eyebrow>
                    <Num className="text-small font-semibold">{stat.value}</Num>
                  </div>
                ))}
              </div>
              {card.conflict ? (
                <div className="flex items-start gap-2 rounded-control bg-alert-tint px-2.5 py-2">
                  <Dot tone="alert" className="mt-1" />
                  <span className="flex-1 text-mini text-alert">
                    {card.conflict}
                  </span>
                </div>
              ) : null}
              <div className="flex gap-1.5">
                {card.alertHref ? (
                  <ButtonLink
                    href={card.alertHref}
                    size="sm"
                    className="flex-1"
                  >
                    See what I suggest
                  </ButtonLink>
                ) : (
                  <ButtonLink href={card.href} size="sm" className="flex-1">
                    Open stop
                  </ButtonLink>
                )}
                <Link
                  href={card.href}
                  aria-label="Open stop"
                  className="flex size-8 items-center justify-center rounded-control border border-control bg-surface text-ink-muted hover:bg-canvas"
                >
                  <Icon name="chevronRight" size={14} />
                </Link>
              </div>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

/**
 * The chosen route as the map draws it. Nothing while there is no answer for
 * these stops: the map draws its stops alone, not a line that looks like a road.
 */
function drawnRoute(
  route: ReturnType<typeof useTripRoute>["route"],
  chosen: number,
  pick: (index: number) => void,
): MapRoute | null {
  if (route.status !== "ready") return null;
  const routes = route.answer.routes;
  const main = routes[chosen] ?? routes[0];
  const others = routes.map((_, i) => i).filter((i) => routes[i] !== main);
  return {
    legs: main.legs.map((leg) => leg.path),
    alternatives: others.map((i) => routes[i].path),
    stale: route.refreshing,
    onPickAlternative: (index) => pick(others[index]),
  };
}
