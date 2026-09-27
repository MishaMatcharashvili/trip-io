import { renderToStaticMarkup } from "react-dom/server";
import { Icon, type IconName } from "@/ui/icon";
import { BasemapCalm } from "@/ui/map/basemap-calm";
import { BasemapDetailed } from "@/ui/map/basemap-detailed";
import { BasemapMobile } from "@/ui/map/basemap-mobile";
import { BasemapMobileAlert } from "@/ui/map/basemap-mobile-alert";
import { BasemapMobileRoute } from "@/ui/map/basemap-mobile-route";
import { BasemapWeather } from "@/ui/map/basemap-weather";

/**
 * The app's own icon set and map artwork, rendered to static SVG. Both are
 * drawn with `currentColor` and `var(--color-map-*)`, so they take whichever
 * theme the frame around them sets.
 */

export type Theme = "light" | "dark";

export function icon(name: IconName, size = 16, strokeWidth = 1.6): string {
  return renderToStaticMarkup(
    <Icon name={name} size={size} strokeWidth={strokeWidth} />,
  );
}

const basemaps = {
  clear: BasemapMobile,
  route: BasemapMobileRoute,
  alert: BasemapMobileAlert,
  calm: BasemapCalm,
  weather: BasemapWeather,
  detailed: BasemapDetailed,
} as const;

export type MapKind = keyof typeof basemaps;

const rendered = new Map<MapKind, string>();

/**
 * A basemap for one frame. Each carries its own hatch patterns and clip paths;
 * a page holds two frames, so the ids are suffixed per theme — otherwise the
 * dark frame would resolve `url(#…)` to the light frame's pattern and paint
 * light hatching on a dark map.
 */
export function basemap(kind: MapKind, theme: Theme): string {
  let svg = rendered.get(kind);
  if (!svg) {
    const Basemap = basemaps[kind];
    svg = renderToStaticMarkup(<Basemap />);
    rendered.set(kind, svg);
  }
  return svg
    .replace(/id="([^"]+)"/g, `id="$1-${theme}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${theme})`);
}
