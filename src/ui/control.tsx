"use client";

import { useState } from "react";
import { cx } from "./cx";

/**
 * A source the watch layer either follows or does not. Uncontrolled by design:
 * these screens run on fixtures, and the real write path lands with the
 * settings API.
 */
export function Toggle({
  label,
  defaultOn = false,
  size = "md",
}: {
  label: string;
  defaultOn?: boolean;
  size?: "sm" | "md";
}) {
  const [on, setOn] = useState(defaultOn);
  const track = size === "md" ? "h-5 w-[34px]" : "h-[18px] w-[30px]";
  const knob = size === "md" ? "size-4" : "size-3.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
      className={cx(
        "flex shrink-0 items-center rounded-full p-0.5 transition-colors",
        track,
        on ? "justify-end bg-agent" : "justify-start bg-fill-strong",
      )}
    >
      <span className={cx("rounded-full bg-knob", knob)} />
    </button>
  );
}

/** One of a small set of mutually exclusive choices, rendered as a card row. */
export function RadioRow({
  name,
  value,
  label,
  description,
  defaultChecked = false,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-[11px] px-3.5 py-2.5 has-checked:bg-agent-tint">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
      <span className="size-[17px] shrink-0 rounded-full border-[1.5px] border-control bg-surface group-has-checked:border-[5px] group-has-checked:border-agent" />
      <span className="flex-1">
        <span className="block text-small font-medium group-has-checked:font-semibold">
          {label}
        </span>
        <span className="block text-mini text-ink-faint group-has-checked:text-ink-muted">
          {description}
        </span>
      </span>
    </label>
  );
}
