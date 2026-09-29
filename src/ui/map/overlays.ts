import type { LonLat } from "../../domain/geo.ts";
import type { GoogleMaps } from "./google.ts";
import type { MapEvent } from "./trip-map.tsx";

// What the trip draws over the basemap besides its stops: the road route, the
// alternatives beside it, the areas of the world events that touch it, and
// Google's own traffic layer. All of it on the Google map, in the design's
// tokens; a Google route is never drawn over any other basemap.

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** One stretch of the route: the road, and whether you are past it. */
export type DrawnLeg = { path: readonly LonLat[]; done: boolean };

export type RouteDraw = {
  legs: readonly DrawnLeg[];
  /** Other ways between the same two stops, drawn beside the chosen one. */
  alternatives: readonly (readonly LonLat[])[];
  /** Dimmed while an answer for other stops is being replaced. */
  stale: boolean;
  visible: boolean;
};

export type EventDraw = {
  events: readonly MapEvent[];
  /** The families (weather, road) currently switched on. */
  families: readonly string[];
};

export type Overlays = {
  setRoute(route: RouteDraw, onPickAlternative: (index: number) => void): void;
  setEvents(draw: EventDraw): void;
  setTraffic(on: boolean): void;
  remove(): void;
};

const latLng = ([lng, lat]: LonLat): google.maps.LatLngLiteral => ({
  lat,
  lng,
});

// A dashed stroke is a row of small marks along an invisible line.
const DASH = {
  path: "M 0,-1 0,1",
  strokeOpacity: 1,
  scale: 3,
} as const;

export function mountOverlays(g: GoogleMaps, map: google.maps.Map): Overlays {
  const lines: google.maps.Polyline[] = [];
  const data = new g.maps.Data({ map });
  const traffic = new g.maps.TrafficLayer();

  const clearLines = () => {
    for (const line of lines) {
      google.maps.event.clearInstanceListeners(line);
      line.setMap(null);
    }
    lines.length = 0;
  };

  const add = (options: google.maps.PolylineOptions) => {
    const line = new g.maps.Polyline({ map, geodesic: false, ...options });
    lines.push(line);
    return line;
  };

  return {
    setRoute(route, onPickAlternative) {
      clearLines();
      if (!route.visible) return;
      const agent = token("--color-agent");
      const ground = token("--color-map-ground");
      const quiet = token("--color-ink-faint");
      const fade = route.stale ? 0.45 : 1;

      // Alternatives first, so the chosen route sits on top of them.
      route.alternatives.forEach((path, index) => {
        add({
          path: path.map(latLng),
          strokeColor: quiet,
          strokeOpacity: 0.75 * fade,
          strokeWeight: 6,
          zIndex: 1,
          clickable: true,
        }).addListener("click", () => onPickAlternative(index));
      });

      for (const leg of route.legs) {
        const path = leg.path.map(latLng);
        // The casing lifts the route off the roads it follows.
        add({
          path,
          strokeColor: ground,
          strokeOpacity: 0.85 * fade,
          strokeWeight: 9,
          zIndex: 2,
          clickable: false,
        });
        add(
          leg.done
            ? {
                path,
                strokeColor: agent,
                strokeOpacity: 0.95 * fade,
                strokeWeight: 5,
                zIndex: 3,
                clickable: false,
              }
            : {
                // The legs still ahead are dashed and lighter.
                path,
                strokeOpacity: 0,
                icons: [
                  {
                    icon: { ...DASH, strokeColor: agent },
                    offset: "0",
                    repeat: "12px",
                  },
                ],
                zIndex: 3,
                clickable: false,
              },
        );
      }
    },

    setEvents({ events, families }) {
      data.forEach((feature) => {
        data.remove(feature);
      });
      data.addGeoJson({
        type: "FeatureCollection",
        features: events.map((e) => ({
          type: "Feature",
          id: e.id,
          properties: { family: e.kind.split(".")[0] },
          geometry: e.geometry,
        })),
      });
      const alert = token("--color-alert-bright");
      data.setStyle((feature) => {
        const visible = families.includes(
          String(feature.getProperty("family")),
        );
        const kind = feature.getGeometry()?.getType();
        if (kind === "Point") {
          return {
            visible,
            clickable: false,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 22,
              fillColor: alert,
              fillOpacity: 0.18,
              strokeColor: alert,
              strokeOpacity: 0.7,
              strokeWeight: 1.5,
            },
          };
        }
        return {
          visible,
          clickable: false,
          fillColor: alert,
          fillOpacity: 0.12,
          strokeColor: alert,
          strokeOpacity: 0.7,
          strokeWeight: 1.5,
        };
      });
    },

    // Google's road-traffic layer: a separate thing from the route, and it
    // asks nothing of the Routes API.
    setTraffic(on) {
      traffic.setMap(on ? map : null);
    },

    remove() {
      clearLines();
      data.setMap(null);
      traffic.setMap(null);
    },
  };
}
