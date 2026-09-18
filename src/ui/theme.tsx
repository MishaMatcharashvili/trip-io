"use client";

import { useSyncExternalStore } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";
import { DARK_QUERY, STORAGE_KEY } from "./theme-script";

export type ThemePreference = "system" | "light" | "dark";

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function apply(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function setPreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private windows); the choice still applies
    // for this page view.
  }
  apply(preference);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // While following the system, track OS changes live.
  const media = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (readPreference() === "system") apply("system");
    listener();
  };
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onChange);
  };
}

export function useThemePreference() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    () => "system" as const,
  );
  return [preference, setPreference] as const;
}

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: IconName;
}> = [
  { value: "system", label: "System", icon: "display" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/** A compact icon button that steps System → Light → Dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const [preference, set] = useThemePreference();
  const index = options.findIndex((o) => o.value === preference);
  const current = options[index];
  const next = options[(index + 1) % options.length];

  return (
    <button
      type="button"
      onClick={() => set(next.value)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
      title={`Theme: ${current.label}`}
      className={cx(
        "flex size-[30px] items-center justify-center rounded-full border border-hairline bg-surface text-ink-muted transition-colors hover:text-ink",
        className,
      )}
    >
      <Icon name={current.icon} size={15} />
    </button>
  );
}

/** The same choice as a segmented control, for the settings screen. */
export function ThemeSegmented() {
  const [preference, set] = useThemePreference();

  return (
    <fieldset className="flex gap-0.5 rounded-[10px] bg-track-pill p-[3px]">
      <legend className="sr-only">Theme</legend>
      {options.map((option) => {
        const on = option.value === preference;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => set(option.value)}
            className={cx(
              "flex h-[30px] items-center gap-1.5 rounded-control px-3 text-[13px] transition-colors",
              on
                ? "bg-surface font-medium text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon name={option.icon} size={14} />
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
