import type { DuckDBConnection } from "@duckdb/node-api";

// Region decomposition for the sense loop: detectors poll per region, never per
// trip (context/architecture.md). Georgia's municipalities and self-governing
// cities from Overture's divisions theme, plus Tbilisi, which is a region with no
// county beneath it.
//
// Excluded: Abkhazia and South Ossetia (Tskhinvali Region). Entry from Georgia is
// not possible and entry from Russia is illegal under Georgian law, so no trip can
// have a node there. Overture already draws the neighbouring municipalities on
// the de-facto line (verified: no overlap), so dropping these leaves no hole
// travellers could fall into.

const ABKHAZIA = "GE-AB";

// South Ossetia's de-facto districts appear under GE-SK / GE-MM / GE-RL with
// Ossetian or Russian names and no English one. Listed explicitly so a renamed
// or reshaped division in a future release fails the build instead of silently
// leaking into the sense loop.
const SOUTH_OSSETIA = [
  "Ленингоры район",
  "Къуайса",
  "Дзауы район",
  "Знауыры район",
  "Цхинвал",
  "Цхинвалы район",
];

// ~50m. Plenty for "is this event in this municipality", and keeps the Neon
// rows small: the source polygons follow every river bend.
const SIMPLIFY_TOLERANCE_DEG = 0.0005;

export async function buildRegions(
  c: DuckDBConnection,
  { source }: { source: string },
) {
  const list = SOUTH_OSSETIA.map((n) => `'${n}'`).join(", ");

  const found = await c.runAndReadAll(`
    SELECT count(*)::INTEGER FROM ${source}
    WHERE country = 'GE' AND subtype = 'county' AND names.primary IN (${list})
  `);
  const [[foundCount]] = found.getRows() as [[number]];
  if (foundCount !== SOUTH_OSSETIA.length) {
    throw new Error(
      `expected ${SOUTH_OSSETIA.length} South Ossetia districts, found ${foundCount} — check the Overture release`,
    );
  }

  await c.run(`
    CREATE OR REPLACE TABLE region_built AS
    WITH division AS (
      SELECT
        id,
        region AS iso_region,
        names.primary AS name_ka,
        names.common['en'] AS name_en,
        ST_MakeValid(geometry) AS geometry
      FROM ${source}
      WHERE country = 'GE'
        AND is_land
        AND (
          (subtype = 'county' AND region <> '${ABKHAZIA}' AND names.primary NOT IN (${list}))
          OR (subtype = 'region' AND region = 'GE-TB')
        )
    )
    SELECT
      lower(regexp_replace(regexp_replace(name_en, ' Municipality$', ''), '[^A-Za-z0-9]+', '-', 'g')) AS slug,
      regexp_replace(name_en, ' Municipality$', '') AS name,
      name_ka,
      CASE WHEN name_en LIKE '% Municipality' THEN 'municipality' ELSE 'city' END AS kind,
      iso_region,
      id AS source_id,
      ST_Multi(ST_SimplifyPreserveTopology(geometry, ${SIMPLIFY_TOLERANCE_DEG})) AS geom,
      -- Guaranteed inside the polygon, unlike the centroid of a crescent-shaped
      -- municipality. The weather detector samples here.
      ST_PointOnSurface(geometry) AS poll_point
    FROM division;

    CREATE OR REPLACE TABLE sense_area AS
    SELECT ST_Union_Agg(geom) AS geom FROM region_built;
  `);

  const check = await c.runAndReadAll(`
    SELECT
      count(*)::INTEGER AS total,
      count(*) FILTER (WHERE name IS NULL)::INTEGER AS unnamed,
      (count(*) - count(DISTINCT slug))::INTEGER AS duplicate_slugs
    FROM region_built
  `);
  const [[total, unnamed, duplicateSlugs]] = check.getRows() as [
    [number, number, number],
  ];
  if (unnamed > 0 || duplicateSlugs > 0) {
    throw new Error(
      `region_built: ${unnamed} without an English name, ${duplicateSlugs} duplicate slugs`,
    );
  }
  return { total };
}
