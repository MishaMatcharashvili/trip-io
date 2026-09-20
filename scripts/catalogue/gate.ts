import type { DuckDBConnection } from "@duckdb/node-api";
import {
  allowedCategories,
  categoryGroup,
} from "../../src/domain/catalogue/categories.ts";
import {
  georgianScript,
  splitName,
} from "../../src/domain/catalogue/georgian.ts";

// The programmatic gate (docs/implementation-plan.md §6), run entirely in DuckDB
// so it is testable and inspectable without a database:
//
//   1. inside a sense region (accessible Georgia, not just the bbox)
//   2. has a name
//   3. category in the allowlist
//   4. has a website, a phone, or an address
//   5. not a near-duplicate: trigram similarity >= DEDUPE_SIMILARITY within
//      DEDUPE_RADIUS_M, same category group — the better-attested row survives.
//      Similarity is over the name's distinctive tokens only (see
//      GENERIC_TOKENS): on whole names, "Peter's Guest House Kobuleti" and
//      "Nana's Guest House Kobuleti" score 0.56.
//
// Survivors are tiered: `verified` when a second signal (website or phone)
// corroborates them, `raw` when an address is all they have. The plan's third
// corroborating signal, an OSM counterpart within 50m, needs an OSM extract this
// pipeline doesn't pull yet.

export const DEDUPE_RADIUS_M = 100;
// Measured against release 2026-08-19.0: at 0.8+ matches are near-all true
// duplicates, 0.6–0.8 mostly ("Monopoli" / "Monopoly", "Hotel Crystal" /
// "Crystal Hotel & Spa"), below 0.6 mostly different places sharing a street
// or brand word.
export const DEDUPE_SIMILARITY = 0.6;

// Words that say what a place is or where, not which one it is. Together with
// every division name in the release (municipality down to microhood), plus
// their Georgian genitive and adjectival forms ("Bakurianis", "Bakurianshi"), they're removed before comparing names. A name
// made only of these ("Hotel Tbilisi") compares on its full token set, and only
// against other names that are likewise all-generic. Tokens with digits are
// unit or street numbers: two names carrying different ones ("Gomi 18",
// "Gomi 19") are never merged.
const GENERIC_TOKENS = [
  "the",
  "and",
  "in",
  "of",
  "at",
  "by",
  "on",
  "de",
  "da",
  "st",
  "saint",
  "hotel",
  "hostel",
  "guest",
  "house",
  "guesthouse",
  "sastumro",
  "sakhli",
  "apartment",
  "apart",
  "apartamenti",
  "apartamentebi",
  "flat",
  "room",
  "rooms",
  "suite",
  "suites",
  "villa",
  "vila",
  "residence",
  "rezidensi",
  "resort",
  "kurorti",
  "inn",
  "bnb",
  "b",
  "cottage",
  "koteji",
  "kotejebi",
  "home",
  "cozy",
  "lux",
  "luxury",
  "boutique",
  "family",
  "view",
  "best",
  "location",
  "old",
  "new",
  "restaurant",
  "restorani",
  "restoran",
  "cafe",
  "kafe",
  "coffee",
  "bar",
  "pub",
  "lounge",
  "bakery",
  "wine",
  "winery",
  "marani",
  "cellar",
  "bistro",
  "kitchen",
  "church",
  "eklesia",
  "monastery",
  "monastiri",
  "cathedral",
  "tadzari",
  "tsminda",
  "museum",
  "muzeumi",
  "gallery",
  "park",
  "parki",
  "garden",
  "national",
  "fortress",
  "tsikhe",
  "lake",
  "tba",
  "waterfall",
  "chanchkari",
  "center",
  "centre",
  "tsentri",
  "city",
  "georgia",
  "georgian",
  "sakartvelo",
  "district",
  "dzveli",
  "akhali",
  "grand",
  "palace",
  "plaza",
  "terrace",
  "street",
  "avenue",
  "kucha",
  // Streets every town has, which half the addresses-as-names contain.
  "rustaveli",
  "chavchavadze",
  "aghmashenebeli",
  "gorgasali",
  "tamar",
  "mepe",
];

const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;

/**
 * DuckDB ports of pg_trgm's `show_trgm` and `similarity`, so the threshold means
 * the same thing it would in Postgres: lowercase, split on non-alphanumerics,
 * pad each word with two leading spaces and one trailing, take distinct
 * 3-character windows; similarity is |shared| / |union|.
 */
export async function createMacros(c: DuckDBConnection) {
  await c.run(`
    CREATE OR REPLACE MACRO trgm(s) AS list_distinct(flatten(list_transform(
      list_filter(regexp_split_to_array(lower(s), '[^\\p{L}\\p{N}]+'), w -> w <> ''),
      w -> list_transform(
        range(1, length('  ' || w || ' ') - 1),
        i -> substring('  ' || w || ' ', i, 3)
      )
    )));

    CREATE OR REPLACE MACRO trgm_similarity(a, b) AS
      CASE WHEN len(list_distinct(list_concat(a, b))) = 0 THEN 0
           ELSE len(list_intersect(a, b)) / len(list_distinct(list_concat(a, b)))
      END;

    CREATE OR REPLACE MACRO haversine_m(lon1, lat1, lon2, lat2) AS
      2 * 6371008.8 * asin(sqrt(
        pow(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
      ));

    CREATE OR REPLACE MACRO nonblank(xs) AS
      coalesce(list_filter(xs, x -> trim(x) <> ''), []);
  `);
}

/**
 * Runs the gate over `source` (Overture places schema) against `area` (a table
 * with one `geom` column, the union of sense regions). Produces two tables:
 * `place_gated` (survivors, load-ready) and `place_rejected` (with a reason).
 */
export async function runGate(
  c: DuckDBConnection,
  {
    source,
    divisions,
    area,
    release,
  }: { source: string; divisions: string; area: string; release: string },
) {
  await createMacros(c);

  await c.run(`
    CREATE OR REPLACE TABLE dedupe_stopword AS
    SELECT DISTINCT word FROM (
      SELECT unnest([${GENERIC_TOKENS.map(sqlString).join(", ")}]) AS word
      UNION ALL
      SELECT unnest(regexp_split_to_array(lower(names.common['en']), '[^\\p{L}\\p{N}]+'))
      FROM ${divisions}
      WHERE country = 'GE' AND subtype <> 'country'
    )
    WHERE word NOT IN ('', 'municipality');
  `);

  const groupCase = Object.entries(categoryGroup)
    .map(
      ([category, group]) =>
        `WHEN ${sqlString(category)} THEN ${sqlString(group)}`,
    )
    .join(" ");

  await c.run(`
    CREATE OR REPLACE TABLE place_candidate AS
    SELECT
      p.id AS source_id,
      nullif(trim(p.names.primary), '') AS primary_name,
      p.basic_category AS category,
      CASE p.basic_category ${groupCase} END AS category_group,
      ST_X(p.geometry) AS lon,
      ST_Y(p.geometry) AS lat,
      p.confidence,
      nonblank(p.websites) AS websites,
      nonblank(p.phones) AS phones,
      nonblank(p.socials) AS socials,
      nonblank(p.emails) AS emails,
      list_filter(coalesce(p.addresses, []), a -> nullif(trim(a.freeform), '') IS NOT NULL) AS addresses,
      coalesce(len(p.sources), 0) AS source_count,
      list_distinct(list_transform(coalesce(p.sources, []), s -> s.dataset)) AS datasets,
      p.taxonomy.hierarchy AS taxonomy,
      p.brand.names.primary AS brand,
      EXISTS (SELECT 1 FROM ${area} a WHERE ST_Intersects(p.geometry, a.geom)) AS in_area
    FROM ${source} p;
  `);

  // Name splitting lives in TypeScript (it's shared with the app), so pull the
  // distinct Georgian-script names out, split/transliterate, and append back.
  const georgian = await c.runAndReadAll(`
    SELECT DISTINCT primary_name FROM place_candidate
    WHERE regexp_matches(primary_name, '[\\x{10D0}-\\x{10FF}]')
  `);
  await c.run(
    "CREATE OR REPLACE TABLE name_split (primary_name VARCHAR, name VARCHAR, name_ka VARCHAR)",
  );
  const appender = await c.createAppender("name_split");
  for (const [primary] of georgian.getRows() as [string][]) {
    if (!georgianScript.test(primary)) continue;
    const { name, nameKa } = splitName(primary);
    appender.appendVarchar(primary);
    appender.appendVarchar(name);
    appender.appendVarchar(nameKa ?? primary);
    appender.endRow();
  }
  appender.closeSync();

  await c.run(`
    CREATE OR REPLACE TABLE place_checked AS
    SELECT
      c.*,
      coalesce(r.name, c.primary_name) AS name,
      r.name_ka,
      len(c.websites) > 0 AS has_website,
      len(c.phones) > 0 AS has_phone,
      len(c.addresses) > 0 AS has_address,
      CASE
        WHEN NOT c.in_area THEN 'outside_area'
        WHEN c.primary_name IS NULL THEN 'no_name'
        WHEN c.category IS NULL
          OR c.category NOT IN (${allowedCategories.map(sqlString).join(", ")})
          THEN 'category_not_allowed'
        WHEN len(c.websites) = 0 AND len(c.phones) = 0 AND len(c.addresses) = 0
          THEN 'no_contact'
      END AS reject_reason
    FROM place_candidate c
    LEFT JOIN name_split r USING (primary_name);

    -- One global quality order: more contact signals, then Overture's own
    -- confidence, then more contributing sources; id breaks ties so reruns agree.
    CREATE OR REPLACE TABLE place_ranked AS
    WITH tokenised AS (
      SELECT
        p.*,
        list_filter(regexp_split_to_array(lower(p.name), '[^\\p{L}\\p{N}]+'), t -> t <> '') AS tokens,
        list_filter(
          regexp_split_to_array(lower(p.name), '[^\\p{L}\\p{N}]+'),
          t -> t <> ''
            AND NOT list_contains(s.words, t)
            AND NOT list_contains(s.words, regexp_replace(t, 's$', ''))
            AND NOT list_contains(s.words, regexp_replace(t, 'shi$', 'i'))
        ) AS distinctive
      FROM place_checked p, (SELECT list(word) AS words FROM dedupe_stopword) s
      WHERE p.reject_reason IS NULL
    )
    SELECT
      * EXCLUDE (tokens, distinctive),
      trgm(array_to_string(CASE WHEN len(distinctive) > 0 THEN distinctive ELSE tokens END, ' ')) AS trigrams,
      len(distinctive) = 0 AS generic_only,
      list_sort(list_distinct(list_filter(tokens, t -> regexp_matches(t, '[0-9]')))) AS numbers,
      floor(lat * 1000)::INTEGER AS lat_cell,
      row_number() OVER (ORDER BY
        has_website::INT + has_phone::INT + has_address::INT DESC,
        confidence DESC NULLS LAST,
        source_count DESC,
        source_id
      ) AS quality_rank
    FROM tokenised;

    -- A row is a duplicate if any better-ranked row in the same group sits
    -- within the radius under a similar name. Chains (A~B, B~C, A!~C) drop both
    -- B and C: slightly over-eager, but deterministic and never merges A and C.
    -- lat_cell is ~111m, so +-1 cell covers the 100m radius.
    CREATE OR REPLACE TABLE place_duplicate AS
    SELECT dup.source_id, arg_min(keep.source_id, keep.quality_rank) AS duplicate_of
    FROM place_ranked dup
    JOIN place_ranked keep
      ON keep.category_group = dup.category_group
     AND keep.quality_rank < dup.quality_rank
     AND keep.lat_cell BETWEEN dup.lat_cell - 1 AND dup.lat_cell + 1
     AND abs(keep.lon - dup.lon) < 0.002
     AND keep.generic_only = dup.generic_only
     AND (len(keep.numbers) = 0 OR len(dup.numbers) = 0 OR keep.numbers = dup.numbers)
    WHERE haversine_m(keep.lon, keep.lat, dup.lon, dup.lat) <= ${DEDUPE_RADIUS_M}
      AND trgm_similarity(keep.trigrams, dup.trigrams) >= ${DEDUPE_SIMILARITY}
    GROUP BY dup.source_id;

    CREATE OR REPLACE TABLE place_rejected AS
    SELECT source_id, primary_name, category, lon, lat, reject_reason, NULL::VARCHAR AS duplicate_of
    FROM place_checked WHERE reject_reason IS NOT NULL
    UNION ALL
    SELECT r.source_id, r.primary_name, r.category, r.lon, r.lat, 'duplicate', d.duplicate_of
    FROM place_ranked r JOIN place_duplicate d USING (source_id);

    CREATE OR REPLACE TABLE place_gated AS
    SELECT
      'overture' AS source,
      r.source_id,
      r.name,
      r.name_ka,
      r.category,
      r.lon,
      r.lat,
      CASE WHEN r.has_website OR r.has_phone THEN 'verified' ELSE 'raw' END AS tier,
      to_json({
        release: ${sqlString(release)},
        "group": r.category_group,
        confidence: r.confidence,
        websites: r.websites,
        phones: r.phones,
        socials: r.socials,
        emails: r.emails,
        address: r.addresses[1].freeform,
        locality: r.addresses[1].locality,
        taxonomy: r.taxonomy,
        brand: r.brand,
        datasets: r.datasets
      })::VARCHAR AS attrs
    FROM place_ranked r
    ANTI JOIN place_duplicate d USING (source_id);
  `);
}
