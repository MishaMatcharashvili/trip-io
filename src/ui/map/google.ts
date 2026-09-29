import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

// The Maps JavaScript API, loaded once per page and only where a map is drawn.
// Never imported at module scope by a server component: the loader touches
// `window`. The libraries are the two the app draws with — "maps" for the map,
// polylines, data and traffic layers, "marker" for Advanced Markers.

export type GoogleMaps = {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
};

let loading: Promise<GoogleMaps> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMaps> {
  loading ??= (async () => {
    setOptions({ key: apiKey, v: "weekly" });
    const [maps, marker] = await Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
    ]);
    return { maps, marker };
  })().catch((error) => {
    // A failed load (offline, a blocked script) may succeed on the next try.
    loading = null;
    throw error;
  });
  return loading;
}
