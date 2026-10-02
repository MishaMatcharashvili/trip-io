"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import type { TripState } from "./trip-picker-model";

// Which of the traveller's trips the landing page is showing, and the way to
// change it. Only drawn when there is more than one. The chosen one changes the
// moment it is tapped, while the server draws the trip; and the choice is in the
// address (?trip=), so it survives a refresh and can be linked to.

export type SwitcherTrip = {
  id: string;
  title: string;
  dates: string;
  state: TripState;
};

const tone = { live: "agent", upcoming: "ok", finished: "idle" } as const;

export function TripSwitcher({
  trips,
  selected,
  className,
}: {
  trips: SwitcherTrip[];
  selected: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(selected);

  if (trips.length < 2) return null;

  const choose = (id: string) => {
    if (id === shown) return;
    start(() => {
      setShown(id);
      router.replace(`/?trip=${id}`, { scroll: false });
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Your trips"
      aria-busy={pending}
      className={cx(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0",
        className,
      )}
    >
      {trips.map((trip) => {
        const on = trip.id === shown;
        return (
          <button
            key={trip.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => choose(trip.id)}
            className={cx(
              "flex shrink-0 flex-col items-start gap-0.5 rounded-[10px] border px-3 py-2 text-left transition-colors",
              on
                ? "border-ink bg-ink text-canvas"
                : "border-hairline bg-surface text-ink hover:border-control",
              trip.state === "finished" && !on && "opacity-60",
              on && pending && "animate-breathe",
            )}
          >
            <span className="flex max-w-[190px] items-center gap-1.5 text-small font-semibold">
              {on ? null : <Dot tone={tone[trip.state]} size={7} />}
              <span className="truncate">{trip.title}</span>
            </span>
            <span
              className={cx(
                "text-mini",
                on ? "text-canvas/70" : "text-ink-faint",
              )}
            >
              {trip.dates}
            </span>
          </button>
        );
      })}
    </div>
  );
}
