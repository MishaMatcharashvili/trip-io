"use client";

import { useState } from "react";
import { cx } from "./cx";

/**
 * An on/off switch. Uncontrolled with `defaultOn`, or controlled with `on` and
 * `onChange` when the page holds the state (a map layer, a saved setting).
 */
export function Toggle({
  label,
  defaultOn = false,
  on: controlled,
  onChange,
  disabled = false,
  size = "md",
}: {
  label: string;
  defaultOn?: boolean;
  on?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [own, setOwn] = useState(defaultOn);
  const on = controlled ?? own;
  const track = size === "md" ? "h-5 w-[34px]" : "h-[18px] w-[30px]";
  const knob = size === "md" ? "size-4" : "size-3.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (controlled === undefined) setOwn(!on);
        onChange?.(!on);
      }}
      className={cx(
        "flex shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40",
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
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  defaultChecked?: boolean;
  /** Controlled: the group's value is held by the page. */
  checked?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-[11px] px-3.5 py-2.5 has-checked:bg-agent-tint">
      <input
        type="radio"
        name={name}
        value={value}
        {...(checked === undefined
          ? { defaultChecked }
          : { checked, onChange: () => onChange?.(value) })}
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
