import { Image, useColorScheme, useWindowDimensions, View } from "react-native";
import { mapboxToken } from "~/config";
import { usePalette } from "~/theme";

// The map over a trip: a picture of the route from Mapbox's Static Images
// API, in the style that matches the phone's theme. A picture and not a map
// view, so it needs no native module and runs in Expo Go; the map to pan and
// zoom is the web app's.

export type LonLat = readonly [lon: number, lat: number];

/** Mapbox draws at most this many pixels a side, before @2x. */
const MAX_SIDE = 1280;
/** Markers past this many make the URL too long to be accepted. */
const MAX_PINS = 40;

/** Google's polyline encoding, which the API takes for a path. */
export function encodePolyline(points: readonly LonLat[]): string {
  let out = "";
  let prevLat = 0;
  let prevLon = 0;
  const write = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const y = Math.round(lat * 1e5);
    const x = Math.round(lon * 1e5);
    write(y - prevLat);
    write(x - prevLon);
    prevLat = y;
    prevLon = x;
  }
  return out;
}

const hex = (colour: string) => colour.replace("#", "");

/** The image's URL, or null when there is nothing to draw or no token. */
export function mapUrl(
  points: readonly LonLat[],
  size: { width: number; height: number },
  look: {
    dark: boolean;
    line: string;
    pin: string;
    mark?: LonLat | null;
    /** Places, not a route: no line between them. */
    pins?: boolean;
  },
): string | null {
  if (!mapboxToken || points.length === 0) return null;
  const shown = points.slice(0, MAX_PINS);
  const overlays = [
    ...(shown.length > 1 && !look.pins
      ? [
          `path-3+${hex(look.line)}-0.9(${encodeURIComponent(encodePolyline(shown))})`,
        ]
      : []),
    ...shown.map(([lon, lat]) => `pin-s+${hex(look.line)}(${lon},${lat})`),
    ...(look.mark
      ? [`pin-l+${hex(look.pin)}(${look.mark[0]},${look.mark[1]})`]
      : []),
  ].join(",");
  // One point has no bounds to fit: centre on it instead.
  const view =
    shown.length > 1 ? "auto" : `${shown[0][0]},${shown[0][1]},11.5,0`;
  const width = Math.min(MAX_SIDE, Math.round(size.width));
  const height = Math.min(MAX_SIDE, Math.round(size.height));
  const style = look.dark ? "dark-v11" : "light-v11";
  const padding = shown.length > 1 ? "&padding=36" : "";
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlays}/${view}/${width}x${height}@2x?access_token=${mapboxToken}${padding}`;
}

/**
 * The route through `points`, in the order given, edge to edge at the top of
 * a screen. `mark` is the one stop the screen is about, drawn in coral when
 * something is wrong there. Renders nothing without a token or a point.
 */
export function RouteMap({
  points,
  height = 180,
  mark,
  alert,
  dim,
  pins,
  bleed = 20,
}: {
  points: readonly LonLat[];
  height?: number;
  mark?: LonLat | null;
  alert?: boolean;
  /** Places, not a route: no line between them. */
  pins?: boolean;
  /** How far past the screen's own margin it runs, to reach the edges. */
  bleed?: number;
  /** The watch is not looking: the map is last known, not current. */
  dim?: boolean;
}) {
  const p = usePalette();
  const dark = useColorScheme() === "dark";
  const { width } = useWindowDimensions();
  const uri = mapUrl(
    points,
    { width, height },
    { dark, line: p.agent, pin: alert ? p.alert : p.agent, mark, pins },
  );
  if (!uri) return null;
  return (
    <View
      style={{
        height,
        marginHorizontal: -bleed,
        backgroundColor: p.fill,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
        accessibilityLabel="Map of the route"
      />
    </View>
  );
}
