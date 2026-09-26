"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card, Divider, Panel } from "@/ui/card";
import { FilterChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { type MapStop, TripMap } from "@/ui/map/trip-map";
import { Eyebrow, Headline, Prose, Title } from "@/ui/text";
import { SaveToggle } from "./place-row";

// Explore: the catalogue searched live, on the map as it is filtered. The map
// and the list share one state, so a pin and its row are always the same
// search. Saving and adding to a trip act on the traveller's own data.

type Hit = {
  id: string;
  name: string;
  nameKa: string | null;
  category: string;
  group: string;
  tier: "curated" | "verified" | "raw";
  lonLat: [number, number];
};

type TripRef = { id: string; title: string; startsAt: string; endsAt: string };

export type AreaChip = { slug: string; name: string; count: number };

const GROUPS = [
  ["heritage", "Heritage"],
  ["nature", "Nature"],
  ["food", "Food & wine"],
  ["culture", "Culture"],
  ["lodging", "Stay"],
] as const;

const groupName = Object.fromEntries(GROUPS) as Record<string, string>;

const tierLine = {
  curated: "Checked by hand",
  verified: "Verified — name, place and a way to reach them",
  raw: "Not checked yet — you can still add it yourself",
} as const;

function AddToTrip({ hit, trips }: { hit: Hit; trips: TripRef[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const current = (trips ?? []).filter((t) => t.endsAt.slice(0, 10) >= today);

  const go = (trip: TripRef) =>
    router.push(
      `/trips/${trip.id}/day/today?add=1&q=${encodeURIComponent(hit.name)}`,
    );

  return (
    <div className="relative">
      <Button
        size="sm"
        onClick={() => {
          if (trips === null) router.push("/sign-in?next=/explore");
          else if (current.length === 0) router.push("/new");
          else if (current.length === 1) go(current[0]);
          else setOpen((v) => !v);
        }}
      >
        Add to trip
      </Button>
      {open ? (
        <Card className="absolute right-0 top-9 z-30 w-[240px] overflow-hidden shadow-lifted">
          {current.map((trip, i) => (
            <div key={trip.id}>
              {i > 0 ? <Divider /> : null}
              <button
                type="button"
                onClick={() => go(trip)}
                className="w-full px-3 py-2 text-left text-small hover:bg-canvas"
              >
                {trip.title}
              </button>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function Browser({
  areas,
  total,
  query,
  setQuery,
  area,
  setArea,
  group,
  setGroup,
  hits,
  loading,
  saved,
  trips,
  selected,
  rowRef,
}: {
  areas: AreaChip[];
  total: number;
  query: string;
  setQuery: (q: string) => void;
  area: string | null;
  setArea: (a: string | null) => void;
  group: string | null;
  setGroup: (g: string | null) => void;
  hits: Hit[];
  loading: boolean;
  saved: Set<string>;
  trips: TripRef[] | null;
  selected: string | null;
  rowRef: (id: string) => (el: HTMLDivElement | null) => void;
}) {
  const areaName = Object.fromEntries(areas.map((a) => [a.slug, a.name]));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pb-3">
        <label className="flex h-10 items-center gap-2.5 rounded-panel border border-hairline bg-surface-subtle px-3">
          <Icon name="search" size={16} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places, or try “monastery”"
            aria-label="Search places"
            className="h-full flex-1 bg-transparent text-small outline-none placeholder:text-ink-faint"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="text-ink-faint"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <FilterChip selected={area === null} onClick={() => setArea(null)}>
            All Georgia
            <span className={area === null ? "opacity-70" : "text-ink-faint"}>
              {total.toLocaleString("en-GB")}
            </span>
          </FilterChip>
          {areas.map((a) => (
            <FilterChip
              key={a.slug}
              selected={area === a.slug}
              onClick={() => setArea(a.slug)}
            >
              {a.name}
              <span
                className={area === a.slug ? "opacity-70" : "text-ink-faint"}
              >
                {a.count.toLocaleString("en-GB")}
              </span>
            </FilterChip>
          ))}
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <FilterChip
            size="sm"
            selected={group === null}
            onClick={() => setGroup(null)}
          >
            Everything
          </FilterChip>
          {GROUPS.map(([g, label]) => (
            <FilterChip
              key={g}
              size="sm"
              selected={group === g}
              onClick={() => setGroup(g)}
            >
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      <Divider />

      <div
        className={cx(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          loading && "opacity-60",
        )}
      >
        {hits.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Prose>Nothing in the catalogue matches that.</Prose>
            <span className="text-mini text-ink-faint">
              Try another name, or widen the region.
            </span>
          </div>
        ) : (
          hits.map((hit, i) => (
            <div key={hit.id} ref={rowRef(hit.id)}>
              {i > 0 ? <Divider className="mx-4" /> : null}
              <div
                className={cx(
                  "flex items-start gap-3 px-4 py-3.5",
                  selected === hit.id && "bg-agent-tint",
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Eyebrow>
                    {groupName[hit.group] ?? hit.group}
                    {area === null ? null : ` · ${areaName[area]}`}
                  </Eyebrow>
                  <Title>{hit.name}</Title>
                  <p className="text-mini text-ink-muted">
                    {[hit.category.replace(/_/g, " "), hit.nameKa]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <span className="flex items-center gap-1 pt-0.5 text-micro text-ink-faint">
                    {hit.tier === "raw" ? null : (
                      <Icon name="check" size={11} strokeWidth={2} />
                    )}
                    {tierLine[hit.tier]}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <SaveToggle
                    name={hit.name}
                    placeId={hit.id}
                    defaultSaved={saved.has(hit.id)}
                  />
                  <AddToTrip hit={hit} trips={trips} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ExploreScreen({
  areas,
  total,
  aside,
}: {
  areas: AreaChip[];
  total: number;
  /** What sits beside the catalogue: the roads this season, and the like. */
  aside: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [trips, setTrips] = useState<TripRef[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  // One layout at a time: two hidden MapLibre maps would be two WebGL
  // contexts, and two lists would fight over which row a pin scrolls to.
  const [desktop, setDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // What is the traveller's own: kept places and trips. Signed out, neither.
  useEffect(() => {
    apiClient.api.saved.$get().then(async (res) => {
      if (res.ok) setSaved(new Set((await res.json()).placeIds));
    });
    apiClient.api.trips.$get().then(async (res) => {
      if (res.ok) setTrips((await res.json()).trips);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await apiClient.api.places.$get({
        query: {
          q: query.trim() || undefined,
          area: (area ?? undefined) as never,
          group: (group ?? undefined) as never,
          limit: "40",
        },
      });
      if (res.ok) setHits((await res.json()).places as Hit[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, area, group]);

  const stops: MapStop[] = hits.map((h) => ({
    id: h.id,
    lonLat: h.lonLat,
    label: h.name,
    state: "upcoming",
  }));

  const select = (id: string) => {
    setSelected(id);
    rows.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const browser = (
    <Browser
      areas={areas}
      total={total}
      query={query}
      setQuery={setQuery}
      area={area}
      setArea={setArea}
      group={group}
      setGroup={setGroup}
      hits={hits}
      loading={loading}
      saved={saved}
      trips={trips}
      selected={selected}
      rowRef={(id) => (el) => {
        if (el) rows.current.set(id, el);
        else rows.current.delete(id);
      }}
    />
  );

  if (desktop === null) {
    return <div className="flex-1 bg-map-ground" aria-hidden="true" />;
  }

  return desktop ? (
    /* Desktop — map canvas with floating panels. */
    <div className="relative flex-1 overflow-hidden">
      <TripMap
        stops={stops}
        route={[]}
        selectedId={selected}
        onSelect={select}
        fitPadding={{ top: 60, right: 400, bottom: 60, left: 470 }}
        className="absolute inset-0 size-full"
      />

      <Panel className="absolute bottom-6 left-6 top-5 z-20 flex w-[420px] flex-col overflow-hidden">
        <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
          <Eyebrow>Explore Georgia</Eyebrow>
          <Headline>Places I can plan with</Headline>
          <Prose>
            {total.toLocaleString("en-GB")} places across four regions, each
            checked before it can go into a plan.
          </Prose>
        </div>
        {browser}
      </Panel>

      <div className="absolute right-6 top-5 z-20 flex w-[340px] flex-col gap-3">
        {aside}
      </div>
    </div>
  ) : (
    /* Mobile — the map as a header, the catalogue as the sheet. */
    <div className="relative flex flex-1 flex-col pb-20">
      <div className="absolute inset-x-0 top-0 h-[200px] overflow-hidden">
        <TripMap
          stops={stops}
          route={[]}
          interactive={false}
          fitPadding={20}
          className="absolute inset-0 size-full"
        />
      </div>

      <main className="relative z-10 mt-[170px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet">
        <div className="flex justify-center pb-1 pt-2">
          <span
            aria-hidden="true"
            className="h-1 w-9 rounded-full bg-control"
          />
        </div>
        <div className="flex flex-col gap-1 px-4 pb-3 pt-1">
          <Eyebrow>Explore Georgia</Eyebrow>
          <Headline>Places I can plan with</Headline>
        </div>
        {browser}
        <div className="flex flex-col gap-3 border-t border-hairline bg-canvas px-4 py-4">
          {aside}
        </div>
      </main>
    </div>
  );
}
