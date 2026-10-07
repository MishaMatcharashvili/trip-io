import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  channelOfEvent,
  eventSummary,
  liveness,
  outletNames,
  sourceLabel,
} from "./feed.ts";
import { signInMethods, tripDays, tripPhase, userKind } from "./people.ts";

const NOW = new Date("2026-10-07T12:00:00Z");

describe("feed vocabulary", () => {
  test("names an outlet by its name and a detector by what it is", () => {
    assert.equal(sourceLabel("civil-ge"), "Civil Georgia");
    assert.equal(sourceLabel("open-meteo"), "Open-Meteo forecast");
    assert.equal(sourceLabel("something-new"), "something-new");
  });

  test("puts every event source on a channel", () => {
    assert.equal(channelOfEvent("open-meteo"), "weather");
    assert.equal(channelOfEvent("road-report"), "roads");
    assert.equal(channelOfEvent("news-safety"), "safety");
  });

  test("quotes a detector's sentence and builds a forecast's from its reading", () => {
    assert.equal(
      eventSummary("road.closure", { summary: "Closed at Gudauri" }),
      "Closed at Gudauri",
    );
    assert.equal(
      eventSummary("weather.rain", {
        metric: "precipitation",
        unit: "mm/h",
        peak: 4.26,
        hours: 5,
      }),
      "rain: precipitation peaks at 4.3 mm/h over 5 h",
    );
    assert.equal(eventSummary("rail.delayed", {}), "rail.delayed");
  });

  test("reads a window against now, and an open end never expires", () => {
    assert.equal(liveness("2026-10-08T00:00:00Z", null, NOW), "upcoming");
    assert.equal(
      liveness("2026-10-06T00:00:00Z", "2026-10-06T06:00:00Z", NOW),
      "expired",
    );
    assert.equal(
      liveness("2026-10-06T00:00:00Z", "2026-10-08T00:00:00Z", NOW),
      "active",
    );
    assert.equal(liveness("2026-10-06T00:00:00Z", null, NOW), "active");
  });

  test("lists the outlets that corroborate a claim once each", () => {
    assert.deepEqual(
      outletNames({
        outlets: [{ id: "civil-ge" }, { id: "on-ge" }, { id: "civil-ge" }, 3],
      }),
      ["Civil Georgia", "On.ge"],
    );
    assert.deepEqual(outletNames({}), []);
  });
});

describe("people and trips", () => {
  test("names sign-in methods, sorted and without repeats", () => {
    assert.equal(
      signInMethods(["google", "credential", "google"]),
      "Email, Google",
    );
    assert.equal(signInMethods([]), "");
    assert.equal(signInMethods(["apple"]), "apple");
  });

  test("recognises a guest by the flag, not by the address", () => {
    assert.equal(userKind(true), "guest");
    assert.equal(userKind(false), "account");
    assert.equal(userKind(null), "account");
  });

  test("places a trip before, during and after its dates", () => {
    assert.equal(
      tripPhase("2026-10-08T00:00:00Z", "2026-10-10T00:00:00Z", NOW),
      "upcoming",
    );
    assert.equal(
      tripPhase("2026-10-06T00:00:00Z", "2026-10-10T00:00:00Z", NOW),
      "live",
    );
    assert.equal(
      tripPhase("2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z", NOW),
      "past",
    );
  });

  test("counts both ends of a trip", () => {
    assert.equal(tripDays("2026-10-01T08:00:00Z", "2026-10-01T20:00:00Z"), 1);
    assert.equal(tripDays("2026-10-01T08:00:00Z", "2026-10-07T20:00:00Z"), 7);
  });
});
