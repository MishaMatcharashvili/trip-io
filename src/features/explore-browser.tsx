"use client";

import { useState } from "react";
import {
  groupLabels,
  type PlaceGroup,
  places,
  regions,
  savedPlaceIds,
} from "@/data/explore";
import { Divider } from "@/ui/card";
import { FilterChip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { Prose } from "@/ui/text";
import { PlaceRow } from "./place-row";

const groups = Object.keys(groupLabels) as PlaceGroup[];

/**
 * Search and filter the curated catalogue. Region comes first because in
 * Georgia it decides everything else — which roads, which season, how far.
 */
export function ExploreBrowser() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [group, setGroup] = useState<PlaceGroup | null>(null);

  const q = query.trim().toLowerCase();
  const shown = places.filter(
    (p) =>
      (!region || p.region === region) &&
      (!group || p.group === group) &&
      (!q || `${p.name} ${p.summary}`.toLowerCase().includes(q)),
  );

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
          <FilterChip
            selected={region === null}
            onClick={() => setRegion(null)}
          >
            All Georgia
          </FilterChip>
          {regions.map((r) => (
            <FilterChip
              key={r.slug}
              selected={region === r.slug}
              onClick={() => setRegion(r.slug)}
            >
              {r.name}
              <span
                className={region === r.slug ? "opacity-70" : "text-ink-faint"}
              >
                {r.curated}
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
          {groups.map((g) => (
            <FilterChip
              key={g}
              size="sm"
              selected={group === g}
              onClick={() => setGroup(g)}
            >
              {groupLabels[g]}
            </FilterChip>
          ))}
        </div>
      </div>

      <Divider />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Prose>Nothing I have verified matches that yet.</Prose>
            <span className="text-mini text-ink-faint">
              I only list places I have checked by hand — ask the assistant to
              look further.
            </span>
          </div>
        ) : (
          shown.map((place, i) => (
            <div key={place.id}>
              {i > 0 ? <Divider className="mx-4" /> : null}
              <PlaceRow
                place={place}
                saved={savedPlaceIds.includes(place.id)}
                showRegion={region === null}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
