import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterIndex, leader } from "./cluster.ts";

const WORLD: [number, number, number, number] = [-180, -90, 180, 90];

test("an index with no stops can be asked at any zoom, and answers nothing", () => {
  const index = clusterIndex([]);
  for (const zoom of [0, 6, 10, 13, 14, 20]) {
    assert.deepEqual(index.getClusters(WORLD, zoom), []);
  }
});

test("stops closer than a pin merge into a count at country scale and part when zoomed in", () => {
  const index = clusterIndex([
    { id: "a", lonLat: [44.8, 41.7] },
    { id: "b", lonLat: [44.8005, 41.7005] },
    { id: "far", lonLat: [42.5, 41.6] },
  ]);
  const wide = index.getClusters(WORLD, 6);
  assert.equal(wide.length, 2);
  assert.equal(wide.filter((f) => "cluster" in f.properties).length, 1);
  assert.equal(index.getClusters(WORLD, 14).length, 3);
});

test("one stop is one stop", () => {
  const [only] = clusterIndex([{ id: "a", lonLat: [44.8, 41.7] }]).getClusters(
    WORLD,
    6,
  );
  assert.ok(!("cluster" in only.properties));
});

test("a group is led by its heaviest stop", () => {
  const group = [
    { id: "cafe", weight: 24 },
    { id: "castle", weight: 83 },
    { id: "bar", weight: 30 },
  ];
  assert.equal(leader(group).id, "castle");
});

test("of equals the earliest leads, so the same group always shows the same pin", () => {
  assert.equal(
    leader([
      { id: "a", weight: 5 },
      { id: "b", weight: 5 },
    ]).id,
    "a",
  );
  assert.equal(leader([{ id: "a" }, { id: "b" }]).id, "a");
});

test("a group of one is its own leader", () => {
  assert.equal(leader([{ id: "only" }]).id, "only");
});
