import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterIndex } from "./cluster.ts";

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
