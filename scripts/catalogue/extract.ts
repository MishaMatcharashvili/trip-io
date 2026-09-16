import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DuckDBInstance } from "@duckdb/node-api";
import { runGate } from "./gate.ts";
import { buildRegions } from "./regions.ts";

// Phase 1 extraction: Overture (S3) -> Georgia bbox Parquet cache -> sense
// regions + gated places -> load-ready Parquet under data/catalogue/<release>/.
// Needs no database; `npm run catalogue:load` takes it from there.
//
//   npm run catalogue:extract                       # cached download if present
//   npm run catalogue:extract -- --refresh          # re-pull from S3
//   npm run catalogue:extract -- --release 2026-09-16.0

// Pin the release: Overture ids are stable across releases, but categories and
// confidence are not, and the curated tier is reviewed against these rows.
const DEFAULT_RELEASE = "2026-08-19.0";

// Georgia with a margin; the precise cut is the sense-region polygons.
const BBOX = { xmin: 39.9, xmax: 46.8, ymin: 41.0, ymax: 43.65 };

const { values: args } = parseArgs({
  options: {
    release: { type: "string", default: DEFAULT_RELEASE },
    refresh: { type: "boolean", default: false },
  },
});
const release = args.release;

const rawDir = `data/overture/${release}`;
const outDir = `data/catalogue/${release}`;
mkdirSync(rawDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const instance = await DuckDBInstance.create(":memory:");
const c = await instance.connect();
await c.run("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;");
await c.run("SET s3_region = 'us-west-2';");

const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  const result = await fn();
  console.log(
    `${label.padEnd(28)} ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
  return result;
};

for (const [theme, type] of [
  ["places", "place"],
  ["divisions", "division_area"],
] as const) {
  const path = `${rawDir}/${type}.parquet`;
  if (existsSync(path) && !args.refresh) continue;
  // The bbox struct is Overture's row-group statistics hook: DuckDB skips every
  // row group outside Georgia, so this reads tens of MB, not the ~100 GB theme.
  await time(`download ${type}`, () =>
    c.run(`
      COPY (
        SELECT * FROM read_parquet(
          's3://overturemaps-us-west-2/release/${release}/theme=${theme}/type=${type}/*.parquet',
          hive_partitioning = false
        )
        WHERE bbox.xmax >= ${BBOX.xmin} AND bbox.xmin <= ${BBOX.xmax}
          AND bbox.ymax >= ${BBOX.ymin} AND bbox.ymin <= ${BBOX.ymax}
      ) TO '${path}' (FORMAT parquet, COMPRESSION zstd)
    `),
  );
}

const { total: regionCount } = await time("regions", () =>
  buildRegions(c, { source: `'${rawDir}/division_area.parquet'` }),
);

await time("gate", () =>
  runGate(c, {
    source: `'${rawDir}/place.parquet'`,
    divisions: `'${rawDir}/division_area.parquet'`,
    area: "sense_area",
    release,
  }),
);

await c.run(`
  COPY place_gated TO '${outDir}/places.parquet' (FORMAT parquet, COMPRESSION zstd);
  COPY place_rejected TO '${outDir}/rejected.parquet' (FORMAT parquet, COMPRESSION zstd);
  COPY (
    SELECT * EXCLUDE (geom, poll_point),
      ST_AsText(geom) AS geom_wkt,
      ST_AsText(poll_point) AS poll_point_wkt
    FROM region_built
  ) TO '${outDir}/regions.parquet' (FORMAT parquet, COMPRESSION zstd);
`);

const rows = async (sql: string) =>
  (await c.runAndReadAll(sql)).getRowObjectsJson() as Record<string, unknown>[];

const report = {
  release,
  regions: regionCount,
  input: (await rows("SELECT count(*)::INTEGER AS n FROM place_candidate"))[0]
    .n,
  rejected: await rows(
    "SELECT reject_reason AS reason, count(*)::INTEGER AS n FROM place_rejected GROUP BY 1 ORDER BY 2 DESC",
  ),
  kept: await rows(`
    SELECT tier, json_extract_string(attrs, '$.group') AS "group", count(*)::INTEGER AS n
    FROM place_gated GROUP BY ALL ORDER BY 1, 3 DESC
  `),
};
writeFileSync(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\nregions: ${report.regions}   input places: ${report.input}`);
console.log(
  "rejected:",
  report.rejected.map((r) => `${r.reason}=${r.n}`).join("  "),
);
console.log(
  "kept:    ",
  report.kept.map((r) => `${r.tier}/${r.group}=${r.n}`).join("  "),
);
console.log(
  `\nwrote ${outDir}/{places,rejected,regions}.parquet and report.json`,
);
