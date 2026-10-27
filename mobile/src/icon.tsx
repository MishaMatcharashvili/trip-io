import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ColorValue } from "react-native";
import { usePalette } from "~/theme";
import type { Tone } from "~/ui";

// The app's glyphs, by the names the design gives them (src/ui/icon.tsx on the
// web). Feather is the family the web's icons come from; the agent's sparkle
// is the one it lacks, and comes from Ionicons.

const FEATHER = {
  calendar: "calendar",
  map: "map",
  list: "list",
  route: "navigation",
  explore: "compass",
  bookmark: "bookmark",
  user: "user",
  chevronRight: "chevron-right",
  arrowRight: "arrow-right",
  plus: "plus",
  search: "search",
  close: "x",
  check: "check",
  rain: "cloud-rain",
  warning: "alert-triangle",
  info: "info",
  revert: "rotate-ccw",
  clock: "clock",
  offline: "wifi-off",
  signal: "activity",
} as const satisfies Record<string, keyof typeof Feather.glyphMap>;

export type IconName = keyof typeof FEATHER | "sparkle";

export function Icon({
  name,
  size = 16,
  tone,
  color,
  faint,
}: {
  name: IconName;
  size?: number;
  tone?: Tone;
  /** A colour handed down by a navigator, which knows the active tint. */
  color?: ColorValue;
  faint?: boolean;
}) {
  const p = usePalette();
  const ink =
    color ??
    (tone
      ? { agent: p.agent, alert: p.alert, ok: p.ok }[tone]
      : faint
        ? p.inkFaint
        : p.inkMuted);
  return name === "sparkle" ? (
    <Ionicons name="sparkles-outline" size={size} color={ink} />
  ) : (
    <Feather name={FEATHER[name]} size={size} color={ink} />
  );
}

/** The mark at the end of a row that leads somewhere. */
export const Chevron = () => <Icon name="chevronRight" size={15} faint />;
