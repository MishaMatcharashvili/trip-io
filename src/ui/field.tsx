"use client";

import { useId } from "react";
import { cx } from "./cx";

/**
 * A labelled text input. The label sits above the field rather than inside it,
 * so it stays readable once the field is filled; the hint and the error share
 * one line under it, and the error replaces the hint rather than stacking.
 */
export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "h-11 rounded-[10px] border bg-surface px-3.5 text-body outline-none transition-colors placeholder:text-ink-faint",
          "focus:border-agent focus:ring-2 focus:ring-agent-line",
          error ? "border-alert-bright" : "border-control",
        )}
        {...input}
      />
      {note ? (
        <p
          id={noteId}
          className={cx("text-mini", error ? "text-alert" : "text-ink-faint")}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
