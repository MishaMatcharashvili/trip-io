"use client";

import { useState } from "react";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";

/**
 * The way you talk back. It sits at the bottom of the map on desktop and
 * inside the sheet on mobile — the same input either way, because "tell me
 * what changed" is as much a road report as a question.
 */
export function CommandBar({
  suggestions = [],
  placeholder = "Ask about your trip, or tell me what changed",
  compact = false,
  className,
}: {
  suggestions?: string[];
  placeholder?: string;
  compact?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");

  return (
    <div className={cx("flex flex-col items-center gap-2.5", className)}>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => setValue(s)}>
              <Chip floating className="cursor-pointer hover:border-control">
                {s}
              </Chip>
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={cx(
          "flex w-full items-center gap-3 rounded-panel border bg-surface pl-4 pr-1.5",
          compact
            ? "h-[46px] border-hairline bg-surface-subtle pr-1.5"
            : "h-[50px] border-hairline-strong shadow-panel",
        )}
        onSubmit={(e) => e.preventDefault()}
      >
        <Icon name="sparkle" size={17} className="text-agent" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-full flex-1 bg-transparent text-title outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          aria-label="Send"
          className={cx(
            "flex items-center justify-center rounded-control bg-agent text-on-accent transition-colors hover:bg-agent-hover",
            compact ? "size-[34px] rounded-[9px]" : "size-[38px]",
          )}
        >
          <Icon
            name="arrowRight"
            size={15}
            strokeWidth={1.8}
            className="-rotate-90"
          />
        </button>
      </form>
    </div>
  );
}
