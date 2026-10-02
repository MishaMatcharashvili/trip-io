"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { cx } from "@/ui/cx";
import { type DayChip, hrefFor } from "./day-strip-model";
import { dayHref } from "./trip-links";

// Which day the map is showing, and the way to change it. A chip for the whole
// trip and one for each day, each with its weekday over its date, today ringed,
// and a coral dot where the watch has something for the traveller to decide.
//
// The old control was two chevrons with no label: which day they went to was
// something to find out by pressing. This says where each one goes before it is
// pressed, and the chosen one changes the moment it is, not when the server has
// drawn the new day — the page behind catches up, and the chip is not left
// pretending nothing happened.

export function DayStrip({
  tripId,
  chips,
  selected,
  page = "map",
  className,
}: {
  tripId: string;
  chips: DayChip[];
  /** "all", or a day's id. */
  selected: string;
  /** Where choosing goes: the map, or the plan's list of days. */
  page?: "map" | "plan";
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(selected);
  const chosen = useRef<HTMLButtonElement>(null);

  // The chosen day is in view, however many days there are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: shown is what moves it
  useEffect(() => {
    chosen.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [shown]);

  const choose = (id: string) => {
    if (id === shown) return;
    start(() => {
      setShown(id);
      // Replace, not push: choosing among days is not a trail to walk back along.
      router.replace(
        page === "plan" ? dayHref(tripId, id) : hrefFor(tripId, id),
        { scroll: false },
      );
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Days of the trip"
      aria-busy={pending}
      className={cx(
        "flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]",
        className,
      )}
    >
      {chips.map((chip) => {
        const on = chip.id === shown;
        return (
          <button
            key={chip.id}
            ref={on ? chosen : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={chip.label}
            title={chip.label}
            onClick={() => choose(chip.id)}
            className={cx(
              "relative flex shrink-0 flex-col items-center justify-center rounded-[10px] border px-2.5 transition-colors",
              "h-[42px] min-w-[44px]",
              on
                ? "border-ink bg-ink text-canvas"
                : chip.today
                  ? "border-agent bg-agent-tint text-agent"
                  : "border-hairline bg-surface text-ink-muted hover:border-control hover:text-ink",
              chip.past && !on && "opacity-60",
              on && pending && "animate-breathe",
            )}
          >
            <span className="text-micro font-semibold uppercase tracking-[0.06em] opacity-80">
              {chip.top}
            </span>
            {chip.bottom ? (
              <span className="text-small font-semibold tabular-nums leading-tight">
                {chip.bottom}
              </span>
            ) : null}
            {chip.trouble ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-[9px] rounded-full border-2 border-surface bg-alert-bright"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
