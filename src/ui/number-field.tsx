"use client";

import { useState } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";
import { settledValue, typedValue } from "./number-draft";

const stepButton =
  "touch-target flex size-9 shrink-0 items-center justify-center rounded-control border border-control bg-surface text-ink-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted";

/**
 * A whole number the traveller can clear and retype. The box keeps what is
 * typed (number-draft.ts) and passes a value on only once it is in range;
 * leaving the field, or Enter, clamps it. `stepper` adds − and + for the
 * small counts a thumb is quicker at than a keyboard.
 */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  stepper = false,
  onChange,
  className,
  ...input
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  stepper?: boolean;
  onChange: (value: number) => void;
  className?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "min" | "max" | "step" | "onChange" | "className" | "type"
>) {
  const range = { min, max };
  // Null while the field shows the value itself; the typed text otherwise.
  const [draft, setDraft] = useState<string | null>(null);

  const settle = () => {
    if (draft === null) return;
    const n = settledValue(draft, range, value);
    if (n !== value) onChange(n);
    setDraft(null);
  };
  const nudge = (by: number) =>
    onChange(Math.min(max, Math.max(min, value + by)));

  const field = (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = typedValue(e.target.value, range);
        if (n !== null && n !== value) onChange(n);
      }}
      onBlur={settle}
      onKeyDown={(e) => {
        if (e.key === "Enter") settle();
      }}
      className={cx(
        "h-9 w-20 rounded-control border border-control bg-surface px-2 text-small",
        stepper && "w-12 text-center",
        className,
      )}
      {...input}
    />
  );
  if (!stepper) return field;

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Fewer${input["aria-label"] ? ` ${input["aria-label"]}` : ""}`}
        disabled={value <= min}
        onClick={() => nudge(-step)}
        className={stepButton}
      >
        <Icon name="minus" size={14} />
      </button>
      {field}
      <button
        type="button"
        aria-label={`More${input["aria-label"] ? ` ${input["aria-label"]}` : ""}`}
        disabled={value >= max}
        onClick={() => nudge(step)}
        className={stepButton}
      >
        <Icon name="plus" size={14} />
      </button>
    </span>
  );
}
