"use client";

import { useState } from "react";
import { type ExplorePlace, groupLabels, regions } from "@/data/explore";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Eyebrow, Title } from "@/ui/text";

const noteInk = {
  agent: "text-agent",
  alert: "text-alert",
  ok: "text-ok",
  neutral: "text-ink-muted",
  idle: "text-ink-faint",
} as const;

/**
 * Keep a place for later. Drawn in ink, not periwinkle: saving is the
 * traveller's action, and periwinkle belongs to the agent.
 */
export function SaveToggle({
  name,
  defaultSaved = false,
}: {
  name: string;
  defaultSaved?: boolean;
}) {
  const [saved, setSaved] = useState(defaultSaved);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      onClick={() => setSaved((v) => !v)}
      className={cx(
        "flex size-8 items-center justify-center rounded-control transition-colors hover:bg-canvas",
        saved ? "text-ink" : "text-ink-faint",
      )}
    >
      <Icon
        name="bookmark"
        size={16}
        className={saved ? "fill-current" : undefined}
      />
    </button>
  );
}

/**
 * A curated catalogue place. It always says what was last verified about it —
 * the same promise the watch layer makes about a live trip, made before you
 * have one.
 */
export function PlaceRow({
  place,
  saved = false,
  showRegion = true,
}: {
  place: ExplorePlace;
  saved?: boolean;
  showRegion?: boolean;
}) {
  const region = regions.find((r) => r.slug === place.region);

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Eyebrow>
          {groupLabels[place.group]}
          {showRegion && region ? ` · ${region.name}` : null}
        </Eyebrow>
        <Title>{place.name}</Title>
        <p className="text-mini text-ink-muted">{place.summary}</p>
        <span className="text-mini text-ink-faint">{place.detail}</span>
        {place.note ? (
          <span
            className={cx(
              "flex items-center gap-1.5 text-mini",
              noteInk[place.note.tone],
            )}
          >
            <Dot tone={place.note.tone} />
            {place.note.text}
          </span>
        ) : null}
        <span className="flex items-center gap-1 pt-0.5 text-micro text-ink-faint">
          <Icon name="check" size={11} strokeWidth={2} />
          {place.verified}
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <SaveToggle name={place.name} defaultSaved={saved} />
        <Button size="sm">Add to trip</Button>
      </div>
    </div>
  );
}
