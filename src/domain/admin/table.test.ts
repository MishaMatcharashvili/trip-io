import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  arrange,
  BLANK,
  type Column,
  choicesOf,
  type Filter,
  matches,
  type Row,
  tbilisiDate,
} from "./table.ts";

const columns: Column[] = [
  { key: "name", kind: "text" },
  { key: "trips", kind: "number" },
  { key: "joined", kind: "date" },
  { key: "kind", kind: "choice" },
];

const rows: Row[] = [
  { name: "Nino", trips: 3, joined: "2026-10-07T10:00:00Z", kind: "account" },
  { name: "guest-1", trips: 0, joined: "2026-10-05T10:00:00Z", kind: "guest" },
  { name: "Ana", trips: null, joined: null, kind: null },
  { name: "Beka", trips: 12, joined: "2026-10-06T10:00:00Z", kind: "account" },
];

const names = (rs: Row[]) => rs.map((r) => r.name);

describe("arrange", () => {
  test("numbers sort as numbers, not as strings", () => {
    const out = arrange(rows, columns, {}, { key: "trips", dir: "asc" });
    assert.deepEqual(names(out), ["guest-1", "Nino", "Beka", "Ana"]);
  });

  test("empty cells sort last in both directions", () => {
    const desc = arrange(rows, columns, {}, { key: "trips", dir: "desc" });
    assert.deepEqual(names(desc), ["Beka", "Nino", "guest-1", "Ana"]);
  });

  test("dates sort by instant", () => {
    const out = arrange(rows, columns, {}, { key: "joined", dir: "desc" });
    assert.deepEqual(names(out), ["Nino", "Beka", "guest-1", "Ana"]);
  });

  test("text sorts without regard to case", () => {
    const out = arrange(rows, columns, {}, { key: "name", dir: "asc" });
    assert.deepEqual(names(out), ["Ana", "Beka", "guest-1", "Nino"]);
  });

  test("with no sort, the server's order stands", () => {
    assert.deepEqual(names(arrange(rows, columns, {}, null)), names(rows));
  });

  test("ties keep the server's order", () => {
    const out = arrange(rows, columns, {}, { key: "kind", dir: "asc" });
    assert.deepEqual(names(out), ["Nino", "Beka", "guest-1", "Ana"]);
  });

  test("filters on different columns narrow together", () => {
    const filters: Record<string, Filter> = {
      kind: { kind: "choice", anyOf: ["account"] },
      trips: { kind: "number", min: 5, max: null },
    };
    assert.deepEqual(names(arrange(rows, columns, filters, null)), ["Beka"]);
  });

  test("an untouched filter holds nothing back", () => {
    const filters: Record<string, Filter> = {
      name: { kind: "text", contains: "  " },
      trips: { kind: "number", min: null, max: null },
    };
    assert.equal(arrange(rows, columns, filters, null).length, rows.length);
  });
});

describe("matches", () => {
  test("text is a case-insensitive substring", () => {
    assert.ok(matches("Roads Department", { kind: "text", contains: "ROAD" }));
    assert.ok(!matches(null, { kind: "text", contains: "a" }));
  });

  test("a number range includes both ends", () => {
    const f: Filter = { kind: "number", min: 2, max: 4 };
    assert.ok(matches(2, f) && matches(4, f));
    assert.ok(!matches(5, f) && !matches(null, f));
  });

  test("a date range is in Tbilisi days, both ends included", () => {
    // 21:30 UTC is already the next day in Tbilisi (UTC+4).
    assert.equal(tbilisiDate("2026-10-06T21:30:00Z"), "2026-10-07");
    const f: Filter = { kind: "date", from: "2026-10-07", to: "2026-10-07" };
    assert.ok(matches("2026-10-06T21:30:00Z", f));
    assert.ok(!matches("2026-10-07T21:30:00Z", f));
    assert.ok(!matches(null, f));
  });

  test("an empty cell is its own choice", () => {
    assert.ok(matches(null, { kind: "choice", anyOf: [BLANK] }));
    assert.ok(!matches("guest", { kind: "choice", anyOf: [BLANK] }));
  });

  test("a boolean is chosen as yes or no", () => {
    assert.ok(matches(true, { kind: "choice", anyOf: ["yes"] }));
    assert.ok(matches(false, { kind: "choice", anyOf: ["no"] }));
  });
});

describe("choicesOf", () => {
  test("lists each value with its count, commonest first", () => {
    assert.deepEqual(choicesOf(rows, "kind"), [
      { value: "account", n: 2 },
      { value: BLANK, n: 1 },
      { value: "guest", n: 1 },
    ]);
  });
});
