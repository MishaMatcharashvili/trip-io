import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dedupeKey } from "./event.ts";
import {
  DEFAULT_HORIZON_HOURS,
  detectWeather,
  type HourlySeries,
  leadConfidence,
} from "./weather.ts";

// The thresholds are ours (Georgia has no warning feed), so these tests are
// where they are actually written down: change a band and the expectation here
// has to change with it, deliberately.

const OBSERVED = "2026-10-04T06:00:00Z";

/** Hourly timestamps starting at the observation hour. */
const hours = (n: number, from = OBSERVED) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(from) + i * 3_600_000).toISOString(),
  );

const series = (over: Partial<HourlySeries> & { time: string[] }) => over;

/** `n` hours of quiet, with `at` replaced by the given values. */
const spike = (n: number, at: Record<number, number>) =>
  Array.from({ length: n }, (_, i) => at[i] ?? 0);

describe("the weather detector", () => {
  test("says nothing about a quiet day", () => {
    const events = detectWeather(
      series({
        time: hours(12),
        precipitation: spike(12, {}),
        windGusts: spike(12, {}),
        apparentTemperature: Array.from({ length: 12 }, () => 18),
      }),
      { observedAt: OBSERVED },
    );
    assert.deepEqual(events, []);
  });

  test("drizzle is not news", () => {
    const events = detectWeather(
      series({ time: hours(6), precipitation: spike(6, { 2: 1.4, 3: 1.9 }) }),
      { observedAt: OBSERVED },
    );
    assert.deepEqual(events, []);
  });

  test("one spell of rain is one event, at its worst hour", () => {
    const [event, ...rest] = detectWeather(
      series({
        time: hours(8),
        precipitation: spike(8, { 2: 3, 3: 12, 4: 6 }),
      }),
      { observedAt: OBSERVED },
    );

    assert.deepEqual(rest, []);
    assert.equal(event.kind, "weather.rain");
    // 12mm/h reaches `severe`, and the whole spell carries it.
    assert.equal(event.severity, "severe");
    assert.equal(event.validFrom, "2026-10-04T08:00:00.000Z");
    assert.equal(event.validTo, "2026-10-04T11:00:00.000Z");
    assert.equal(event.payload.peak, 12);
    assert.equal(event.payload.peakAt, "2026-10-04T09:00:00.000Z");
    assert.equal(event.payload.hours, 3);
  });

  test("a single dry hour does not end the rain", () => {
    const events = detectWeather(
      series({
        time: hours(10),
        precipitation: spike(10, { 1: 6, 2: 0, 3: 7 }),
      }),
      { observedAt: OBSERVED },
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].validFrom, "2026-10-04T07:00:00.000Z");
    assert.equal(events[0].validTo, "2026-10-04T10:00:00.000Z");
  });

  test("two dry hours do", () => {
    const events = detectWeather(
      series({
        time: hours(12),
        precipitation: spike(12, { 1: 6, 4: 7 }),
      }),
      { observedAt: OBSERVED },
    );

    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((e) => e.validFrom),
      ["2026-10-04T07:00:00.000Z", "2026-10-04T10:00:00.000Z"],
    );
  });

  test("snow bands an order of magnitude below rain — the passes close early", () => {
    const [snow] = detectWeather(
      series({ time: hours(6), snowfall: spike(6, { 1: 2.5 }) }),
      { observedAt: OBSERVED },
    );
    assert.equal(snow.kind, "weather.snow");
    assert.equal(snow.severity, "moderate");

    // The same number as rain would barely register.
    assert.deepEqual(
      detectWeather(
        series({ time: hours(6), precipitation: spike(6, { 1: 2.5 }) }),
        { observedAt: OBSERVED },
      ).map((e) => e.severity),
      ["minor"],
    );
  });

  test("cold reads downwards, and its peak is the coldest hour", () => {
    const [cold] = detectWeather(
      series({
        time: hours(6),
        apparentTemperature: [2, -6, -14, -9, 1, 3],
      }),
      { observedAt: OBSERVED },
    );
    assert.equal(cold.kind, "weather.cold");
    assert.equal(cold.severity, "moderate");
    assert.equal(cold.payload.peak, -14);
  });

  test("a thunderstorm is never minor, whatever the rain gauge says", () => {
    const events = detectWeather(
      series({ time: hours(6), weatherCode: spike(6, { 2: 95 }) }),
      { observedAt: OBSERVED },
    );
    assert.deepEqual(
      events.map((e) => [e.kind, e.severity]),
      [["weather.thunderstorm", "moderate"]],
    );
  });

  test("rime fog outranks plain fog: it ices the road as well as hiding it", () => {
    const [plain] = detectWeather(
      series({ time: hours(4), weatherCode: spike(4, { 1: 45 }) }),
      { observedAt: OBSERVED },
    );
    const [rime] = detectWeather(
      series({ time: hours(4), weatherCode: spike(4, { 1: 48 }) }),
      { observedAt: OBSERVED },
    );
    assert.equal(plain.severity, "minor");
    assert.equal(rime.severity, "moderate");
  });

  test("different kinds in the same hours are separate events", () => {
    const events = detectWeather(
      series({
        time: hours(6),
        precipitation: spike(6, { 2: 8 }),
        windGusts: spike(6, { 2: 70 }),
      }),
      { observedAt: OBSERVED },
    );
    assert.deepEqual(events.map((e) => e.kind).sort(), [
      "weather.rain",
      "weather.wind",
    ]);
  });

  test("hours that have already passed are not forecast", () => {
    const events = detectWeather(
      series({
        time: hours(8, "2026-10-04T00:00:00Z"),
        precipitation: spike(8, { 1: 9, 7: 9 }),
      }),
      { observedAt: OBSERVED },
    );
    // 01:00 is over; 07:00 is not.
    assert.deepEqual(
      events.map((e) => e.validFrom),
      ["2026-10-04T07:00:00.000Z"],
    );
  });

  test("the horizon stops where the briefing takes over", () => {
    const n = DEFAULT_HORIZON_HOURS + 6;
    const events = detectWeather(
      series({
        time: hours(n),
        precipitation: spike(n, { [DEFAULT_HORIZON_HOURS + 2]: 15 }),
      }),
      { observedAt: OBSERVED },
    );
    assert.deepEqual(events, []);
  });

  test("a gap in the series is a gap, not a zero", () => {
    const events = detectWeather(
      series({
        time: hours(6),
        precipitation: [0, 9, null, 9, 0, 0],
      }),
      { observedAt: OBSERVED },
    );
    // The missing hour bridges, but it is never read as "no rain, severity none".
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.hours, 2);
  });
});

describe("confidence", () => {
  test("falls off with lead time", () => {
    const now = leadConfidence("weather.rain", OBSERVED, OBSERVED);
    const later = leadConfidence(
      "weather.rain",
      OBSERVED,
      "2026-10-06T06:00:00Z",
    );
    assert.equal(now, 0.95);
    assert.ok(later < now && later > 0.5, `${later} is between 0.5 and ${now}`);
  });

  test("is discounted for weather that is guessed rather than predicted", () => {
    assert.ok(
      leadConfidence("weather.thunderstorm", OBSERVED, OBSERVED) <
        leadConfidence("weather.rain", OBSERVED, OBSERVED),
    );
  });

  test("never claims certainty about the day after tomorrow", () => {
    assert.ok(
      leadConfidence("weather.rain", OBSERVED, "2026-10-14T06:00:00Z") >= 0.55,
    );
  });
});

describe("the dedupe key", () => {
  const draft = {
    source: "open-meteo",
    kind: "weather.rain" as const,
    validFrom: "2026-10-04T08:00:00.000Z",
  };

  test("collapses a forecast whose start wobbles by an hour", () => {
    assert.equal(
      dedupeKey(draft, "kazbegi"),
      dedupeKey({ ...draft, validFrom: "2026-10-04T07:00:00.000Z" }, "kazbegi"),
    );
  });

  test("keeps morning and evening apart", () => {
    assert.notEqual(
      dedupeKey(draft, "kazbegi"),
      dedupeKey({ ...draft, validFrom: "2026-10-04T18:00:00.000Z" }, "kazbegi"),
    );
  });

  test("keeps regions and kinds apart", () => {
    assert.notEqual(dedupeKey(draft, "kazbegi"), dedupeKey(draft, "tbilisi"));
    assert.notEqual(
      dedupeKey(draft, "kazbegi"),
      dedupeKey({ ...draft, kind: "weather.snow" }, "kazbegi"),
    );
  });
});
