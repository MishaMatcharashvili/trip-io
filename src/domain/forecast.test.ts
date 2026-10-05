import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  conditionOf,
  daySummary,
  type ForecastHour,
  stopWeather,
} from "./forecast.ts";

const hour = (hh: string, over: Partial<ForecastHour> = {}): ForecastHour => ({
  // 09:00 Tbilisi is 05:00Z.
  at: `2030-05-01T${String(Number(hh) - 4).padStart(2, "0")}:00:00.000Z`,
  precipitation: 0,
  apparentTemperature: 15,
  temperature: 17,
  weatherCode: 1,
  ...over,
});

describe("conditionOf", () => {
  test("names the sky from the WMO code", () => {
    assert.deepEqual(conditionOf(hour("09", { weatherCode: 0 })), {
      sky: "clear",
      label: "Clear",
    });
    assert.equal(conditionOf(hour("09", { weatherCode: 3 })).sky, "cloudy");
  });

  test("measured rain outranks a code that does not mention it", () => {
    const c = conditionOf(hour("09", { weatherCode: 3, precipitation: 1.4 }));
    assert.deepEqual(c, { sky: "rain", label: "Rain" });
  });

  test("a rain code over a dry hour is cloud", () => {
    const c = conditionOf(hour("09", { weatherCode: 63, precipitation: 0 }));
    assert.equal(c.sky, "cloudy");
  });

  test("a downpour is heavy whatever the code said", () => {
    const c = conditionOf(hour("09", { weatherCode: 61, precipitation: 6 }));
    assert.equal(c.label, "Heavy rain");
  });

  test("thunder and fog are kept even with no rain in the numbers", () => {
    assert.equal(conditionOf(hour("09", { weatherCode: 95 })).sky, "storm");
    assert.equal(conditionOf(hour("09", { weatherCode: 45 })).sky, "fog");
  });

  test("snowfall makes snow", () => {
    assert.equal(
      conditionOf(hour("09", { weatherCode: 3, snowfall: 0.8 })).sky,
      "snow",
    );
  });

  test("a series with no code still gets an honest answer", () => {
    assert.equal(
      conditionOf(hour("09", { weatherCode: undefined })).sky,
      "cloudy",
    );
  });
});

describe("stopWeather", () => {
  const day = [
    hour("09", { temperature: 14 }),
    hour("10", { temperature: 16 }),
    hour("11", { temperature: 18, weatherCode: 61, precipitation: 1 }),
    hour("12", { temperature: 19 }),
  ];

  test("reads the hours the stop overlaps, with the air at arrival", () => {
    const w = stopWeather(day, "2030-05-01T09:45:00+04:00", 50);
    assert.equal(w?.temperature, 14);
    assert.equal(w?.wet, false);
  });

  test("a stop that runs into rain is a wet stop", () => {
    const w = stopWeather(day, "2030-05-01T10:45:00+04:00", 60);
    assert.equal(w?.wet, true);
    assert.equal(w?.sky, "rain");
    assert.equal(w?.temperature, 16);
  });

  test("a stop that starts the hour the rain ends is dry", () => {
    const w = stopWeather(day, "2030-05-01T12:00:00+04:00", 30);
    assert.equal(w?.wet, false);
  });

  test("null when the forecast does not reach the stop", () => {
    assert.equal(stopWeather(day, "2030-05-01T15:00:00+04:00", 30), null);
    assert.equal(stopWeather([], "2030-05-01T09:00:00+04:00", 30), null);
  });

  test("falls back to the apparent temperature, and never prints -0", () => {
    const w = stopWeather(
      [hour("09", { temperature: undefined, apparentTemperature: -0.4 })],
      "2030-05-01T09:00:00+04:00",
      30,
    );
    assert.equal(w?.temperature, 0);
    assert.ok(Object.is(w?.temperature, 0));
  });

  test("gusts are reported only when they matter", () => {
    const calm = stopWeather(
      [hour("09", { windGusts: 20 })],
      "2030-05-01T09:00:00+04:00",
      30,
    );
    const gale = stopWeather(
      [hour("09", { windGusts: 62.4 })],
      "2030-05-01T09:00:00+04:00",
      30,
    );
    assert.equal(calm?.gusts, null);
    assert.equal(gale?.gusts, 62);
  });
});

describe("daySummary", () => {
  test("the sky that held, with the range of the air", () => {
    const s = daySummary([
      hour("09", { temperature: 12, weatherCode: 2 }),
      hour("12", { temperature: 21, weatherCode: 2 }),
      hour("15", { temperature: 23, weatherCode: 3 }),
    ]);
    assert.deepEqual(s, {
      sky: "partly",
      label: "Partly cloudy",
      low: 12,
      high: 23,
    });
  });

  test("rain anywhere in the day is what the day is called", () => {
    const s = daySummary([
      hour("09"),
      hour("12", { precipitation: 3, weatherCode: 63 }),
      hour("15"),
    ]);
    assert.equal(s?.sky, "rain");
  });

  test("null with no hours or no readings", () => {
    assert.equal(daySummary([]), null);
    assert.equal(
      daySummary([
        hour("09", { temperature: null, apparentTemperature: null }),
      ]),
      null,
    );
  });
});
