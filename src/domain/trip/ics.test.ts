import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { toIcs } from "./ics.ts";
import { at, DAY, kazbegiDoc, N } from "./test-fixtures.ts";

describe("toIcs", () => {
  const doc = kazbegiDoc();
  const ics = toIcs(
    "trip-1",
    doc,
    { [N.hike]: [44.6203, 42.6623] },
    new Date(at(DAY, "08:00")),
  );

  test("one event per stop, in UTC, with CRLF line ends", () => {
    assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 8);
    assert.ok(ics.includes("\r\n"));
    // 16:00 in Tbilisi is 12:00 UTC.
    assert.ok(ics.includes("DTSTART:20260916T120000Z"));
    assert.ok(ics.includes("SUMMARY:Gergeti Trinity hike"));
  });

  test("a positioned stop carries GEO as lat;lon", () => {
    assert.ok(ics.includes("GEO:42.66230;44.62030"));
  });

  test("text is escaped and long lines folded", () => {
    const long = kazbegiDoc();
    long.nodes[N.hike].meta.title = `Hike, then; more ${"x".repeat(90)}`;
    const out = toIcs("t", long, {}, new Date());
    assert.ok(out.includes(String.raw`SUMMARY:Hike\, then\; more`));
    for (const line of out.split("\r\n")) {
      assert.ok(new TextEncoder().encode(line).length <= 75, line);
    }
  });
});
