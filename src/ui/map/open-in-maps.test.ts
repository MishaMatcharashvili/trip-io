import assert from "node:assert/strict";
import { test } from "node:test";
import { googleMapsDirectionsUrl } from "./open-in-maps.ts";

const p = (i: number): [number, number] => [44 + i / 100, 41.7];

test("puts latitude first, origin to destination, waypoints in order", () => {
  const url = new URL(googleMapsDirectionsUrl([p(0), p(1), p(2)]) as string);
  assert.equal(url.origin + url.pathname, "https://www.google.com/maps/dir/");
  assert.equal(url.searchParams.get("origin"), "41.7,44");
  assert.equal(url.searchParams.get("destination"), "41.7,44.02");
  assert.equal(url.searchParams.get("waypoints"), "41.7,44.01");
  assert.equal(url.searchParams.get("travelmode"), "driving");
});

test("walking asks for walking directions", () => {
  const url = new URL(googleMapsDirectionsUrl([p(0), p(1)], "walk") as string);
  assert.equal(url.searchParams.get("travelmode"), "walking");
  assert.equal(url.searchParams.get("waypoints"), null);
});

test("declines rather than dropping stops", () => {
  assert.equal(googleMapsDirectionsUrl([p(0)]), null);
  assert.equal(
    googleMapsDirectionsUrl(Array.from({ length: 12 }, (_, i) => p(i))),
    null,
  );
  assert.ok(
    googleMapsDirectionsUrl(Array.from({ length: 11 }, (_, i) => p(i))),
  );
});
