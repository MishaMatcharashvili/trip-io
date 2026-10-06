"use client";

import { cx } from "../cx.ts";
import { Icon } from "../icon.tsx";
import { type MapStyleKind, mapStyleLabels, mapStyles } from "./map-style.ts";
import { setMapStyle, useMapStyle } from "./use-map-style.ts";

/**
 * The base-map choice. A segmented control where there is room (the desktop
 * panel, Explore), and a single button that steps to the next where there is
 * not (a phone, where the map is the part the sheet leaves). The choice is the
 * traveller's own and stays across screens: every map follows it.
 */
export function MapStyleSwitch({
  variant = "segmented",
  className,
}: {
  variant?: "segmented" | "step";
  className?: string;
}) {
  const style = useMapStyle();

  if (variant === "step") {
    const next = mapStyles[(mapStyles.indexOf(style) + 1) % mapStyles.length];
    return (
      <button
        type="button"
        onClick={() => setMapStyle(next)}
        aria-label={`Map style: ${mapStyleLabels[style]}. Switch to ${mapStyleLabels[next]}`}
        className={cx(
          "flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface px-3 py-1.5 text-mini font-medium shadow-panel",
          className,
        )}
      >
        <Icon name="map" size={13} />
        {mapStyleLabels[style]}
      </button>
    );
  }

  return (
    <fieldset
      className={cx(
        // Opaque, with its own edge and shadow: it floats over satellite
        // imagery, where a pale pill on a pale control disappears.
        "flex gap-0.5 rounded-[12px] border border-hairline-strong bg-surface p-1 shadow-lifted",
        className,
      )}
    >
      <legend className="sr-only">Map style</legend>
      {mapStyles.map((kind: MapStyleKind) => {
        const on = kind === style;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() => setMapStyle(kind)}
            className={cx(
              "h-[32px] flex-1 rounded-control px-2.5 text-[13px] transition-colors",
              on
                ? "bg-agent font-semibold text-white shadow-card"
                : "font-medium text-ink hover:bg-track-pill",
            )}
          >
            {mapStyleLabels[kind]}
          </button>
        );
      })}
    </fieldset>
  );
}
