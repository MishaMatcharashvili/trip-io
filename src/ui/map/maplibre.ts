import { MAP_TILES, MAP_WORKER } from "./source.ts";

// MapLibre is imported on demand, never at module scope: it touches `window`
// on import, and the components that use it are rendered on the server too.

export type MapLibre = typeof import("maplibre-gl");

let registered: Promise<MapLibre> | null = null;

/** Load MapLibre once per page, with the pmtiles protocol and our worker. */
export function loadMapLibre(baseUrl: string): Promise<MapLibre> {
  registered ??= (async () => {
    const [maplibre, { PMTiles, Protocol }] = await Promise.all([
      import("maplibre-gl"),
      import("pmtiles"),
    ]);
    maplibre.setWorkerUrl(
      `${baseUrl}/${MAP_WORKER.prefix(maplibre.getVersion()).replace(/^map\//, "")}/maplibre-gl-worker.mjs`,
    );
    // Start the workers now, not when the first map is built.
    maplibre.prewarm();

    // The archive's header and root directory are the first read any tile
    // needs. The protocol keys archives by URL, so registering this one
    // under the style's URL means the map reuses the read begun here.
    const protocol = new Protocol();
    const archive = new PMTiles(`${baseUrl}/${MAP_TILES.file}`);
    protocol.add(archive);
    archive.getHeader().catch(() => {
      // The map retries on its own and reports what it cannot load.
    });
    maplibre.addProtocol("pmtiles", protocol.tile);
    return maplibre;
  })();
  return registered;
}
