import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Queryable } from "./client.ts";
import { placeFacts, placeNames } from "./places.ts";

// A place id arrives from outside more often than it looks: a patch body, a
// model's swap proposal. `place.id` is a uuid column, and Postgres answers a
// malformed one with a type error — so a model that invents "p7" would crash
// the judge before the guard that exists to refuse it ever ran, and a mistyped
// patch would be a 500 instead of a 422. These run against a fake connection:
// what matters is which ids reach SQL at all.

const dialect = new PgDialect();
const PLACE = "4b1c3f9e-2d5a-4c8b-9e7f-0a1b2c3d4e5f";

function recording(rows: Record<string, unknown>[] = []) {
  const params: unknown[][] = [];
  const conn: Queryable = {
    async execute(query: SQL) {
      params.push(dialect.sqlToQuery(query).params);
      return { rows };
    },
  };
  return { conn, params };
}

describe("place lookups", () => {
  test("an id that cannot be a place is never sent to the database", async () => {
    const { conn, params } = recording();
    const facts = await placeFacts(["p7", "not-a-uuid"], conn);
    assert.equal(facts.size, 0);
    assert.deepEqual(params, []);
  });

  test("real ids are still looked up alongside invented ones", async () => {
    const { conn, params } = recording([
      {
        id: PLACE,
        tier: "verified",
        opening_hours: null,
        lon: 44.8,
        lat: 41.7,
      },
    ]);
    const facts = await placeFacts(["p7", PLACE], conn);
    assert.deepEqual(params, [[PLACE]]);
    assert.equal(facts.get(PLACE)?.tier, "verified");
  });

  test("names are guarded the same way", async () => {
    const { conn, params } = recording();
    assert.equal((await placeNames(["somewhere indoors"], conn)).size, 0);
    assert.deepEqual(params, []);
  });
});
