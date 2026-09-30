// Mapbox GL JS, loaded once and only where a map is drawn. Imported lazily:
// the library touches `window`, and a page with no map should not ship it.
// The token is the public browser token (NEXT_PUBLIC_MAPBOX_TOKEN), which
// Mapbox restricts to this app's URLs; the Directions token never comes here.

export type Mapbox = typeof import("mapbox-gl").default;

let loading: Promise<Mapbox> | null = null;

export function loadMapbox(token: string): Promise<Mapbox> {
  loading ??= import("mapbox-gl")
    .then((module) => {
      const mapboxgl = module.default;
      mapboxgl.accessToken = token;
      return mapboxgl;
    })
    .catch((error) => {
      // A failed load (offline, a blocked chunk) may succeed on the next try.
      loading = null;
      throw error;
    });
  return loading;
}
