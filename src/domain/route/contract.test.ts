import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  departureInPast,
  MAX_INTERMEDIATES,
  MAX_STOPS,
  routeRequest,
} from "./contract.ts";

const stop = (lon: number, lat = 41.7) => ({
  lonLat: [lon, lat] as [number, number],
});
const stops = (n: number) =>
  Array.from({ length: n }, (_, i) => stop(44 + i * 0.01));

describe("routeRequest", () => {
  test("defaults to driving from now, with no alternatives", () => {
    const r = routeRequest.parse({ stops: stops(2) });
    assert.equal(r.mode, "drive");
    assert.equal(r.departure, "now");
    assert.equal(r.alternatives, false);
  });

  test("keeps the stops in the order given", () => {
    const given = [stop(45.1), stop(44.2), stop(44.9), stop(44.3)];
    const r = routeRequest.parse({ stops: given });
    assert.deepEqual(
      r.stops.map((s) => s.lonLat[0]),
      [45.1, 44.2, 44.9, 44.3],
    );
  });

  test("takes the provider's 25 coordinates, origin and destination among them, and no more", () => {
    assert.equal(MAX_STOPS, MAX_INTERMEDIATES + 2);
    assert.ok(routeRequest.safeParse({ stops: stops(MAX_STOPS) }).success);
    assert.ok(!routeRequest.safeParse({ stops: stops(MAX_STOPS + 1) }).success);
    assert.ok(!routeRequest.safeParse({ stops: stops(1) }).success);
  });

  test("refuses coordinates that are swapped, missing or not numbers", () => {
    // Latitude first, the way a map app copies it: 44.8 is not a latitude in the region.
    assert.ok(
      !routeRequest.safeParse({ stops: [{ lonLat: [41.7, 44.8] }, stop(44)] })
        .success,
    );
    assert.ok(
      !routeRequest.safeParse({
        stops: [{ lonLat: [Number.NaN, 41.7] }, stop(44)],
      }).success,
    );
    assert.ok(
      !routeRequest.safeParse({ stops: [{ lonLat: ["44", "41"] }, stop(44)] })
        .success,
    );
    assert.ok(
      !routeRequest.safeParse({ stops: [{ lonLat: [44] }, stop(44)] }).success,
    );
  });

  test("a road-access point is checked like the place: longitude first, in the region", () => {
    const place = [44.8, 41.7] as [number, number];
    assert.ok(
      routeRequest.safeParse({
        stops: [{ lonLat: place, access: [44.81, 41.69] }, stop(44)],
      }).success,
    );
    assert.ok(
      !routeRequest.safeParse({
        stops: [{ lonLat: place, access: [41.69, 44.81] }, stop(44)],
      }).success,
    );
  });

  test("refuses modes it does not support instead of driving instead", () => {
    assert.ok(
      !routeRequest.safeParse({ stops: stops(2), mode: "transit" }).success,
    );
    assert.ok(
      routeRequest.safeParse({ stops: stops(2), mode: "walk" }).success,
    );
  });

  test("offers alternatives between two stops only", () => {
    assert.ok(
      routeRequest.safeParse({ stops: stops(2), alternatives: true }).success,
    );
    assert.ok(
      !routeRequest.safeParse({ stops: stops(3), alternatives: true }).success,
    );
  });

  test("takes a departure with an offset, and not a bare local time", () => {
    assert.ok(
      routeRequest.safeParse({
        stops: stops(2),
        departure: "2030-05-01T08:30:00+04:00",
      }).success,
    );
    assert.ok(
      routeRequest.safeParse({
        stops: stops(2),
        departure: "2030-05-01T04:30:00Z",
      }).success,
    );
    // A Georgian wall-clock time without an offset could be read as UTC.
    assert.ok(
      !routeRequest.safeParse({
        stops: stops(2),
        departure: "2030-05-01T08:30:00",
      }).success,
    );
    assert.ok(
      !routeRequest.safeParse({ stops: stops(2), departure: "tomorrow" })
        .success,
    );
  });

  test("a departure time is for driving only", () => {
    assert.ok(
      !routeRequest.safeParse({
        stops: stops(2),
        mode: "walk",
        departure: "2030-05-01T04:30:00Z",
      }).success,
    );
  });
});

describe("departureInPast", () => {
  const now = new Date("2030-05-01T00:00:00Z");
  const req = (departure: string) =>
    routeRequest.parse({ stops: stops(2), departure });

  test("leave-now is never in the past", () => {
    assert.equal(departureInPast(req("now"), now), false);
  });

  test("compares instants, so +04:00 is not read as UTC", () => {
    // 03:00+04:00 is 23:00 UTC the evening before: already gone at 00:00 UTC.
    assert.equal(departureInPast(req("2030-05-01T03:00:00+04:00"), now), true);
    // 05:00+04:00 is 01:00 UTC: an hour ahead.
    assert.equal(departureInPast(req("2030-05-01T05:00:00+04:00"), now), false);
  });
});
