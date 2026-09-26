"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";

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
