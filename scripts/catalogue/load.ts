import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DuckDBInstance } from "@duckdb/node-api";
import { neon } from "@neondatabase/serverless";
import { corridors } from "../../src/domain/catalogue/corridors.ts";

// Loads a `catalogue:extract` output into Postgres: regions, the 12 corridors,
// then gated places. Idempotent; rerun after every extract.
//
//   npm run catalogue:load
//   npm run catalogue:load -- --release 2026-09-16.0 --only places
//
// Rows travel as JSON batches through `json_to_recordset` over Neon's HTTP driver
// rather than COPY: Neon's pooled endpoint can't carry COPY, and at ~13k places
// the batches finish in seconds.
//
// Upsert rules for places:
//   - curated rows keep the curator's name, name_ka, category and position;
//     only `attrs` (contacts, confidence) follow the new release
//   - a non-curated row absent from the new release is demoted to `raw`, never
//     deleted: trip_node.place_id would silently null out
//   - curated rows absent from the release are reported for a human to look at

const DEFAULT_RELEASE = "2026-08-19.0";
const PLACE_BATCH = 1000;
const REGION_BATCH = 16;

const { values: args } = parseArgs({
  options: {
    release: { type: "string", default: DEFAULT_RELEASE },
    only: { type: "string" },
  },
});
const release = args.release;
const only = args.only?.split(",");
const wants = (step: string) => !only || only.includes(step);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (run with --env-file=.env)");
}
const sql = neon(process.env.DATABASE_URL);

const [{ migrated }] = (await sql`
  SELECT to_regclass('public.region') IS NOT NULL AS migrated
`) as [{ migrated: boolean }];
if (!migrated) {
  throw new Error("region table missing — run `npm run db:migrate` first");
}

const dir = `data/catalogue/${release}`;
const duck = await (await DuckDBInstance.create(":memory:")).connect();
const readParquet = async (file: string) =>
  (
    await duck.runAndReadAll(`SELECT * FROM '${dir}/${file}'`)
  ).getRowObjectsJson();

async function inBatches<T>(
  rows: T[],
  size: number,
  fn: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

if (wants("regions")) {
  const regions = await readParquet("regions.parquet");
  await inBatches(regions, REGION_BATCH, (batch) =>
    sql.query(
      `INSERT INTO region (slug, name, name_ka, kind, iso_region, source, source_id, geom, poll_point)
       SELECT r.slug, r.name, r.name_ka, r.kind::region_kind, r.iso_region, 'overture', r.source_id,
              ST_GeogFromText(r.geom_wkt), ST_GeogFromText(r.poll_point_wkt)
       FROM json_to_recordset($1::json) AS r(
         slug text, name text, name_ka text, kind text, iso_region text,
         source_id text, geom_wkt text, poll_point_wkt text)
       ON CONFLICT (slug) DO UPDATE SET
         name = excluded.name, name_ka = excluded.name_ka, kind = excluded.kind,
         iso_region = excluded.iso_region, source_id = excluded.source_id,
         geom = excluded.geom, poll_point = excluded.poll_point`,
      [JSON.stringify(batch)],
    ),
  );
  console.log(`regions:   ${regions.length} upserted`);
}

if (wants("corridors")) {
  const geo = JSON.parse(
    readFileSync("src/domain/catalogue/corridors.geo.json", "utf8"),
  ) as {
    features: {
      properties: { slug: string };
      geometry: { coordinates: [number, number][] };
    }[];
  };
  const rows = corridors.map((def) => {
    const feature = geo.features.find((f) => f.properties.slug === def.slug);
    if (!feature) {
      throw new Error(
        `${def.slug} missing from corridors.geo.json — run catalogue:corridors`,
      );
    }
    const wkt = `LINESTRING(${feature.geometry.coordinates.map(([x, y]) => `${x} ${y}`).join(", ")})`;
    return {
      slug: def.slug,
      name: def.name,
      wkt,
      buffer_m: def.bufferM,
      season_risk: def.seasonRisk,
    };
  });
  await sql.query(
    `INSERT INTO corridor (slug, name, geom, buffer_m, season_risk)
     SELECT c.slug, c.name, ST_GeogFromText(c.wkt), c.buffer_m, c.season_risk
     FROM json_to_recordset($1::json) AS c(slug text, name text, wkt text, buffer_m int, season_risk jsonb)
     ON CONFLICT (slug) DO UPDATE SET
       name = excluded.name, geom = excluded.geom,
       buffer_m = excluded.buffer_m, season_risk = excluded.season_risk`,
    [JSON.stringify(rows)],
  );
  console.log(`corridors: ${rows.length} upserted`);
}

if (wants("places")) {
  const places = await readParquet("places.parquet");
  await inBatches(places, PLACE_BATCH, (batch) =>
    sql.query(
      `INSERT INTO place (name, name_ka, category, geom, tier, source, source_id, attrs)
       SELECT p.name, p.name_ka, p.category,
              ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography,
              p.tier::place_tier, p.source, p.source_id, p.attrs::jsonb
       FROM json_to_recordset($1::json) AS p(
         name text, name_ka text, category text, lon float8, lat float8,
         tier text, source text, source_id text, attrs text)
       ON CONFLICT (source, source_id) DO UPDATE SET
         attrs = excluded.attrs,
         name = CASE WHEN place.tier = 'curated' THEN place.name ELSE excluded.name END,
         name_ka = CASE WHEN place.tier = 'curated' THEN place.name_ka ELSE excluded.name_ka END,
         category = CASE WHEN place.tier = 'curated' THEN place.category ELSE excluded.category END,
         geom = CASE WHEN place.tier = 'curated' THEN place.geom ELSE excluded.geom END,
         tier = CASE WHEN place.tier = 'curated' THEN place.tier ELSE excluded.tier END`,
      [JSON.stringify(batch)],
    ),
  );

  const demoted = await sql.query(
    `UPDATE place SET tier = 'raw', attrs = attrs || jsonb_build_object('staleSince', $1::text)
     WHERE source = 'overture' AND tier = 'verified' AND attrs->>'release' <> $1
     RETURNING id`,
    [release],
  );
  const staleCurated = (await sql.query(
    `SELECT id, name FROM place
     WHERE source = 'overture' AND tier = 'curated' AND attrs->>'release' <> $1`,
    [release],
  )) as { id: string; name: string }[];

  console.log(
    `places:    ${places.length} upserted, ${demoted.length} stale demoted to raw`,
  );
  if (staleCurated.length > 0) {
    console.warn(
      `\n${staleCurated.length} curated places are no longer in Overture ${release} — check they still exist:`,
    );
    for (const p of staleCurated) console.warn(`  ${p.id}  ${p.name}`);
  }
}
