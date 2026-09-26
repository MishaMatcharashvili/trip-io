"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type ExplorePlace, groupLabels, regions } from "@/data/explore";
import { apiClient } from "@/lib/hono-client";
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
 *
 * With a catalogue `placeId` the choice is saved to the account (signing in
 * first when there is no session); without one it is the reference render's
 * local toggle.
 */
export function SaveToggle({
  name,
  placeId,
  defaultSaved = false,
  className,
}: {
  name: string;
  placeId?: string;
  defaultSaved?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(defaultSaved);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    if (!placeId) return;
    start(async () => {
      const param = { param: { placeId } };
      const res = next
        ? await apiClient.api.saved.places[":placeId"].$put(param)
        : await apiClient.api.saved.places[":placeId"].$delete(param);
      // requireSession answers 401 before the typed handlers are reached.
      if ((res.status as number) === 401) {
        setSaved(!next);
        router.push(
          `/sign-in?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (!res.ok) setSaved(!next);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      onClick={toggle}
      disabled={pending}
      className={cx(
        "flex size-8 items-center justify-center rounded-control transition-colors hover:bg-canvas",
        saved ? "text-ink" : "text-ink-faint",
        className,
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
