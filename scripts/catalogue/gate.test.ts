import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { createMacros, runGate } from "./gate.ts";
import { buildRegions } from "./regions.ts";

let c: DuckDBConnection;

before(async () => {
  c = await (await DuckDBInstance.create(":memory:")).connect();
  await c.run("INSTALL spatial; LOAD spatial;");
});

const rows = async (sql: string) =>
  (await c.runAndReadAll(sql)).getRowObjectsJson() as Record<string, unknown>[];

const str = (s: string | null) =>
  s === null ? "NULL" : `'${s.replaceAll("'", "''")}'`;
const list = (xs: string[]) => `[${xs.map(str).join(", ")}]::VARCHAR[]`;

type Fixture = {
  id: string;
  name: string | null;
  category: string | null;
  lon: number;
  lat: number;
  websites?: string[];
  phones?: string[];
  address?: string;
  confidence?: number;
};

// Just the Overture places columns the gate reads.
function overtureRow(f: Fixture) {
  const address = f.address
    ? `[{'freeform': ${str(f.address)}, 'locality': 'Tbilisi'}]`
    : "[]";
  return `SELECT
    ${str(f.id)} AS id,
    {'primary': ${str(f.name)}} AS names,
    ${str(f.category)} AS basic_category,
    ST_Point(${f.lon}, ${f.lat}) AS geometry,
    ${f.confidence ?? 0.9}::DOUBLE AS confidence,
    ${list(f.websites ?? [])} AS websites,
    ${list(f.phones ?? [])} AS phones,
    []::VARCHAR[] AS socials,
    []::VARCHAR[] AS emails,
    ${address}::STRUCT(freeform VARCHAR, locality VARCHAR)[] AS addresses,
    [{'dataset': 'meta'}]::STRUCT(dataset VARCHAR)[] AS sources,
    {'hierarchy': ['food_and_drink']}::STRUCT(hierarchy VARCHAR[]) AS taxonomy,
    {'names': {'primary': NULL::VARCHAR}} AS brand`;
}

// ~11 m per 0.0001° of latitude.
const TBILISI = { lon: 44.8, lat: 41.7 };
const north = (metres: number) => TBILISI.lat + metres / 111_195;

async function gate(fixtures: Fixture[]) {
  await c.run(`
    CREATE OR REPLACE TABLE fixture_place AS ${fixtures.map(overtureRow).join(" UNION ALL ")};
    CREATE OR REPLACE TABLE fixture_area AS
      SELECT ST_GeomFromText('POLYGON((44 41, 46 41, 46 42.5, 44 42.5, 44 41))') AS geom;
    CREATE OR REPLACE TABLE fixture_division AS
      SELECT 'GE' AS country, 'locality' AS subtype,
             {'primary': 'თბილისი', 'common': MAP {'en': 'Tbilisi'}} AS names;
  `);
  await runGate(c, {
    source: "fixture_place",
    divisions: "fixture_division",
    area: "fixture_area",
    release: "test",
  });
  const kept = await rows(
    "SELECT source_id, name, name_ka, tier FROM place_gated ORDER BY source_id",
  );
  const rejected = await rows(
    "SELECT source_id, reject_reason, duplicate_of FROM place_rejected ORDER BY source_id",
  );
  return { kept, rejected };
}

describe("trigram macros match pg_trgm", () => {
  test("show_trgm('word')", async () => {
    await createMacros(c);
    const [{ t }] = await rows("SELECT list_sort(trgm('word')) AS t");
    // SELECT show_trgm('word') -> {"  w"," wo","ord","rd ","wor"}
    assert.deepEqual(t, ["  w", " wo", "ord", "rd ", "wor"]);
  });

  test("similarity examples from the pg_trgm docs", async () => {
    const [r] = await rows(`SELECT
      round(trgm_similarity(trgm('word'), trgm('two words')), 6) AS docs,
      round(trgm_similarity(trgm('word'), trgm('words')), 6) AS plural,
      trgm_similarity(trgm('Nali Pub'), trgm('nali-pub')) AS punctuation,
      trgm_similarity(trgm(''), trgm('')) AS empty`);
    assert.equal(r.docs, 0.363636); // similarity('word', 'two words')
    assert.equal(r.plural, 0.571429);
    assert.equal(r.punctuation, 1);
    assert.equal(r.empty, 0);
  });

  test("haversine_m agrees with the TypeScript one", async () => {
    const [{ d }] = await rows(
      "SELECT round(haversine_m(44, 41, 44, 42)) AS d",
    );
    assert.equal(d, 111195);
  });
});

describe("runGate", () => {
  test("rejection reasons, in precedence order", async () => {
    const { kept, rejected } = await gate([
      {
        id: "a-ok",
        name: "Fabrika",
        category: "cafe",
        ...TBILISI,
        phones: ["+995"],
      },
      {
        id: "b-outside",
        name: "Paris Cafe",
        category: "cafe",
        lon: 2.35,
        lat: 48.85,
        phones: ["+33"],
      },
      {
        id: "c-noname",
        name: " ",
        category: "cafe",
        ...TBILISI,
        phones: ["+995"],
      },
      {
        id: "d-category",
        name: "Bank of Georgia",
        category: "bank_or_credit_union",
        ...TBILISI,
        phones: ["+995"],
      },
      {
        id: "e-nullcat",
        name: "Mystery",
        category: null,
        ...TBILISI,
        phones: ["+995"],
      },
      {
        id: "f-contact",
        name: "Ghost Bar",
        category: "bar",
        ...TBILISI,
        websites: ["  "],
      },
    ]);
    assert.deepEqual(
      kept.map((k) => k.source_id),
      ["a-ok"],
    );
    assert.deepEqual(
      rejected.map((r) => [r.source_id, r.reject_reason]),
      [
        ["b-outside", "outside_area"],
        ["c-noname", "no_name"],
        ["d-category", "category_not_allowed"],
        ["e-nullcat", "category_not_allowed"],
        ["f-contact", "no_contact"],
      ],
    );
  });

  test("tier: website or phone is verified, address alone is raw", async () => {
    const { kept } = await gate([
      {
        id: "web",
        name: "Cafe Web",
        category: "cafe",
        ...TBILISI,
        websites: ["https://x.ge"],
      },
      {
        id: "phone",
        name: "Wine Phone",
        category: "winery",
        lon: 44.9,
        lat: 41.7,
        phones: ["+995"],
      },
      {
        id: "addr",
        name: "Museum Addr",
        category: "museum",
        lon: 45.0,
        lat: 41.7,
        address: "1 Rustaveli Ave",
      },
    ]);
    assert.deepEqual(
      Object.fromEntries(kept.map((k) => [k.source_id, k.tier])),
      { addr: "raw", phone: "verified", web: "verified" },
    );
  });

  test("Georgian names are split or romanised", async () => {
    const { kept } = await gate([
      {
        id: "1",
        name: "Villa Digomi • ვილა დიღომი",
        category: "hotel",
        ...TBILISI,
        phones: ["+995"],
      },
      {
        id: "2",
        name: "სკანდის ციხე",
        category: "castle",
        lon: 44.9,
        lat: 41.7,
        phones: ["+995"],
      },
    ]);
    assert.deepEqual(
      kept.map((k) => [k.name, k.name_ka]),
      [
        ["Villa Digomi", "ვილა დიღომი"],
        ["Skandis Tsikhe", "სკანდის ციხე"],
      ],
    );
  });

  describe("dedupe", () => {
    const pub = (
      id: string,
      name: string,
      metres: number,
      extra: Partial<Fixture> = {},
    ): Fixture => ({
      id,
      name,
      category: "bar",
      lon: TBILISI.lon,
      lat: north(metres),
      phones: ["+995"],
      ...extra,
    });

    test("merges a near-identical name nearby, keeping the better-attested row", async () => {
      const { kept, rejected } = await gate([
        pub("thin", "Nali Pub", 0),
        pub("rich", "The Nali Pub", 40, { websites: ["https://nali.ge"] }),
      ]);
      assert.deepEqual(
        kept.map((k) => k.source_id),
        ["rich"],
      );
      assert.deepEqual(rejected, [
        { source_id: "thin", reject_reason: "duplicate", duplicate_of: "rich" },
      ]);
    });

    test("does not merge beyond 100 m", async () => {
      const { kept } = await gate([
        pub("a", "Nali Pub", 0),
        pub("b", "Nali Pub", 120),
      ]);
      assert.equal(kept.length, 2);
    });

    test("does not merge across category groups", async () => {
      const { kept } = await gate([
        pub("bar", "Kazbegi", 0),
        { ...pub("hotel", "Kazbegi", 10), category: "hotel" },
      ]);
      assert.equal(kept.length, 2);
    });

    test("ignores generic words and place names when comparing", async () => {
      // On whole names these score 0.56; their distinctive parts share nothing.
      const { kept } = await gate([
        pub("a", "Peter's Guest House Tbilisi", 0, { category: "hotel" }),
        pub("b", "Nana's Guest House Tbilisis", 30, { category: "hotel" }),
      ]);
      assert.equal(kept.length, 2);
    });

    test("an all-generic name only matches another all-generic name", async () => {
      const { kept } = await gate([
        pub("generic", "Hotel Tbilisi", 0, { category: "hotel" }),
        pub("specific", "Hotel Deka Tbilisi", 10, { category: "hotel" }),
        pub("generic2", "Tbilisi Hotel", 20, { category: "hotel" }),
      ]);
      assert.deepEqual(kept.map((k) => k.source_id).sort(), [
        "generic",
        "specific",
      ]);
    });

    test("different unit numbers never merge", async () => {
      const { kept } = await gate([
        pub("18", "Gomi 18", 0, { category: "hotel" }),
        pub("19", "Gomi 19", 10, { category: "hotel" }),
      ]);
      assert.equal(kept.length, 2);
    });
  });
});

describe("buildRegions", () => {
  const division = (
    id: string,
    subtype: string,
    region: string,
    ka: string,
    en: string | null,
    x: number,
  ) => `SELECT ${str(id)} AS id, 'GE' AS country, ${str(subtype)} AS subtype, ${str(region)} AS region,
      true AS is_land,
      {'primary': ${str(ka)}, 'common': ${en ? `MAP {'en': ${str(en)}}` : "NULL::MAP(VARCHAR, VARCHAR)"}} AS names,
      ST_GeomFromText('POLYGON((${x} 41, ${x + 1} 41, ${x + 1} 42, ${x} 42, ${x} 41))') AS geometry`;

  const southOssetia = [
    "Ленингоры район",
    "Къуайса",
    "Дзауы район",
    "Знауыры район",
    "Цхинвал",
    "Цхинвалы район",
  ];

  const fixture = (ossetia: string[]) =>
    [
      division("tb", "region", "GE-TB", "თბილისი", "Tbilisi", 44),
      division("ka-region", "region", "GE-KA", "კახეთი", "Kakheti", 45),
      division(
        "tel",
        "county",
        "GE-KA",
        "თელავის მუნიციპალიტეტი",
        "Telavi Municipality",
        45,
      ),
      division("pot", "county", "GE-SZ", "ფოთი", "Poti", 41),
      division("gag", "county", "GE-AB", "Гагра араион", "Gagra District", 40),
      ...ossetia.map((n, i) =>
        division(`so${i}`, "county", "GE-SK", n, null, 43),
      ),
    ].join(" UNION ALL ");

  test("keeps municipalities, cities and Tbilisi; drops Abkhazia and South Ossetia", async () => {
    await c.run(
      `CREATE OR REPLACE TABLE fixture_divisions AS ${fixture(southOssetia)}`,
    );
    const { total } = await buildRegions(c, { source: "fixture_divisions" });
    assert.equal(total, 3);
    assert.deepEqual(
      await rows(
        "SELECT slug, name, kind, iso_region FROM region_built ORDER BY slug",
      ),
      [
        { slug: "poti", name: "Poti", kind: "city", iso_region: "GE-SZ" },
        { slug: "tbilisi", name: "Tbilisi", kind: "city", iso_region: "GE-TB" },
        {
          slug: "telavi",
          name: "Telavi",
          kind: "municipality",
          iso_region: "GE-KA",
        },
      ],
    );
    const [{ inside }] = await rows(
      "SELECT bool_and(ST_Contains(geom, poll_point)) AS inside FROM region_built",
    );
    assert.equal(inside, true);
  });

  test("fails loudly when the South Ossetia districts can't all be found", async () => {
    await c.run(
      `CREATE OR REPLACE TABLE fixture_divisions AS ${fixture(southOssetia.slice(1))}`,
    );
    await assert.rejects(
      buildRegions(c, { source: "fixture_divisions" }),
      /South Ossetia/,
    );
  });
});
