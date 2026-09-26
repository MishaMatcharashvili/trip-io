import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { list, put } from "@vercel/blob";
import { GEORGIA_BBOX } from "../../src/domain/geo.ts";
import { MAP_ASSETS, MAP_TILES, MAP_WORKER } from "../../src/ui/map/source.ts";

// Phase 6's basemap: one Georgia `.pmtiles` file plus the fonts and sprites
// its style needs, in the public Vercel Blob store. MapLibre reads the tiles
// with HTTP range requests straight from there — there is no tile server.
//
//   npm run map:build                 # extract, upload what is missing, verify
//   npm run map:build -- --dry-run    # extract and report; upload nothing
//
// Everything is pinned in src/ui/map/source.ts, and every published path
// carries its version, so a file is never overwritten and can be cached
// forever. Moving to a newer build is: change the pin, run this, deploy.
//
// Daily Protomaps builds are kept for a week, so a pin older than that can no
// longer be extracted — the copy in Blob is the one that matters.

const PMTILES_VERSION = "1.31.2";

const { values: args } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false } },
});

const workDir = "data/map";
mkdirSync(workDir, { recursive: true });

/** The pmtiles CLI, fetched once into data/tools (gitignored). */
function pmtilesCli(): string {
  const bin = "data/tools/pmtiles";
  if (existsSync(bin)) return bin;
  mkdirSync("data/tools", { recursive: true });
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz`;
  execFileSync("sh", ["-c", `curl -sfL ${url} | tar xz -C data/tools pmtiles`]);
  return bin;
}

/** Georgia's bbox cut out of the pinned planet build. */
function extractTiles(): string {
  const out = join(workDir, MAP_TILES.file);
  if (existsSync(out)) return out;
  const { west, south, east, north } = GEORGIA_BBOX;
  execFileSync(
    pmtilesCli(),
    [
      "extract",
      `https://build.protomaps.com/${MAP_TILES.build}.pmtiles`,
      out,
      `--bbox=${west},${south},${east},${north}`,
      `--maxzoom=${MAP_TILES.maxzoom}`,
    ],
    { stdio: "inherit" },
  );
  return out;
}

/** The fonts and sprites, at the pinned commit of protomaps/basemaps-assets. */
function fetchAssets(): string {
  const dir = join(workDir, `basemaps-assets-${MAP_ASSETS.commit}`);
  if (existsSync(dir)) return dir;
  const url = `https://github.com/protomaps/basemaps-assets/archive/${MAP_ASSETS.commit}.tar.gz`;
  execFileSync("sh", ["-c", `curl -sfL ${url} | tar xz -C ${workDir}`]);
  return dir;
}

type Upload = { pathname: string; file: string; contentType: string };

async function assetUploads(dir: string): Promise<Upload[]> {
  const uploads: Upload[] = [];
  for (const stack of MAP_ASSETS.fontstacks) {
    const fontDir = join(dir, "fonts", stack);
    for (const range of await readdir(fontDir)) {
      uploads.push({
        pathname: `${MAP_ASSETS.prefix}/fonts/${stack}/${range}`,
        file: join(fontDir, range),
        contentType: "application/x-protobuf",
      });
    }
  }
  for (const flavor of MAP_ASSETS.sprites) {
    for (const suffix of ["", "@2x"]) {
      for (const ext of ["json", "png"] as const) {
        const name = `${flavor}${suffix}.${ext}`;
        uploads.push({
          pathname: `${MAP_ASSETS.prefix}/sprites/${name}`,
          file: join(dir, "sprites", MAP_ASSETS.spriteVersion, name),
          contentType: ext === "json" ? "application/json" : "image/png",
        });
      }
    }
  }
  return uploads;
}

/** MapLibre's worker pair, from the installed package. */
async function workerUploads(): Promise<Upload[]> {
  const dir = "node_modules/maplibre-gl";
  const { version } = JSON.parse(
    await readFile(join(dir, "package.json"), "utf8"),
  ) as { version: string };
  return MAP_WORKER.files.map((name) => ({
    pathname: `${MAP_WORKER.prefix(version)}/${name}`,
    file: join(dir, "dist", name),
    contentType: "text/javascript",
  }));
}

/** Every pathname already in the store under a prefix. */
async function published(prefix: string): Promise<Set<string>> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const blob of page.blobs) seen.add(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return seen;
}

const YEAR_S = 365 * 24 * 60 * 60;

async function upload(u: Upload, large = false) {
  return put(
    u.pathname,
    large ? createReadStream(u.file) : await readFile(u.file),
    {
      access: "public",
      addRandomSuffix: false,
      contentType: u.contentType,
      // Versioned paths never change, so a browser may keep them for good.
      cacheControlMaxAge: YEAR_S,
      multipart: large,
    },
  );
}

/** A few at a time: hundreds of small glyph files, one request each. */
async function inBatches<T>(
  items: T[],
  size: number,
  fn: (t: T) => Promise<unknown>,
) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * The one thing MapLibre needs from the store: a byte range of the archive,
 * readable from another origin. A store that ignored `Range` would send the
 * whole file for every tile.
 */
async function verify(tilesUrl: string, workerUrl: string) {
  const res = await fetch(tilesUrl, {
    headers: { Range: "bytes=0-126", Origin: "https://example.com" },
  });
  const magic = new TextDecoder().decode(
    new Uint8Array(await res.arrayBuffer()).slice(0, 7),
  );
  const cors = res.headers.get("access-control-allow-origin");
  // The worker is imported as a module from another origin, which the browser
  // only allows for a script type with CORS.
  const worker = await fetch(workerUrl, {
    headers: { Origin: "https://example.com" },
  });
  const workerCors = worker.headers.get("access-control-allow-origin");
  const checks = {
    "range request answered with 206": res.status === 206,
    "archive starts with the PMTiles magic": magic === "PMTiles",
    "readable cross-origin": cors === "*" || cors === "https://example.com",
    "worker served as JavaScript, cross-origin":
      worker.ok &&
      (worker.headers.get("content-type") ?? "").includes("javascript") &&
      (workerCors === "*" || workerCors === "https://example.com"),
  };
  for (const [check, ok] of Object.entries(checks)) {
    console.log(`${ok ? "ok  " : "FAIL"} ${check}`);
  }
  if (Object.values(checks).includes(false)) process.exitCode = 1;
}

const tiles = extractTiles();
const assets = await assetUploads(fetchAssets());
const workers = await workerUploads();
const tilesUpload: Upload = {
  pathname: `map/${MAP_TILES.file}`,
  file: tiles,
  contentType: "application/octet-stream",
};

console.log(
  `tiles   ${MAP_TILES.file}  ${(statSync(tiles).size / 1e6).toFixed(0)} MB`,
);
console.log(`assets  ${assets.length} files under ${MAP_ASSETS.prefix}/`);
console.log(`worker  ${workers.map((w) => w.pathname).join(", ")}`);

if (args["dry-run"]) process.exit(0);

const have = await published("map/");
const missing = [tilesUpload, ...assets, ...workers].filter(
  (u) => !have.has(u.pathname),
);
console.log(
  `upload  ${missing.length} missing, ${have.size} already published`,
);

if (missing.includes(tilesUpload)) await upload(tilesUpload, true);
await inBatches(
  missing.filter((u) => u !== tilesUpload),
  16,
  (u) => upload(u),
);

// The store's public origin, read back rather than configured twice.
const [first] = (await list({ prefix: tilesUpload.pathname, limit: 1 })).blobs;
if (!first) throw new Error("the tiles are not in the store after upload");
const origin = new URL(first.url).origin;
await verify(first.url, `${origin}/${workers[0].pathname}`);

console.log(`\nNEXT_PUBLIC_MAP_BASE_URL=${origin}/map`);
