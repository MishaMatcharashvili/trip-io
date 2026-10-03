// What a forecast says about a stretch of a day, in words a traveller reads on
// a stop: a glyph, a temperature, a two-word summary. Pure — the forecast is an
// argument, and where it came from is src/infra/open-meteo.ts's business.
//
// This is not the weather detector. That one (src/domain/watch/weather.ts)
// decides when weather is an event worth judging; this one only describes
// weather, and has no opinion on whether anyone should care.

/** One forecast hour, the way the screens read it. */
export type ForecastHour = {
  /** ISO instant; the value covers the hour beginning here. */
  at: string;
  /** mm in the hour. */
  precipitation: number;
  /** °C, wind chill and humidity included. */
  apparentTemperature: number | null;
  /** °C, the air itself: the figure a thermometer would give. */
  temperature?: number | null;
  /** cm in the hour. */
  snowfall?: number;
  /** km/h. */
  windGusts?: number | null;
  /** WMO 4677. */
  weatherCode?: number | null;
};

export type Sky =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export type Condition = {
  sky: Sky;
  /** "Clear", "Light rain": what the glyph means, for the eye that misses it. */
  label: string;
};

const HOUR_MS = 60 * 60 * 1000;

/** Rain heavy enough to carry an umbrella for, in mm in the hour. */
const RAIN_MM = 0.2;
const HEAVY_RAIN_MM = 4;
/** Snow worth saying, in cm in the hour. */
const SNOW_CM = 0.1;

/**
 * WMO 4677, in the groups a traveller tells apart. The codes Open-Meteo emits
 * are a subset (0–3, 45, 48, 51–57, 61–67, 71–77, 80–86, 95–99).
 */
function skyOfCode(code: number): Condition {
  if (code === 0) return { sky: "clear", label: "Clear" };
  if (code === 1) return { sky: "clear", label: "Mostly clear" };
  if (code === 2) return { sky: "partly", label: "Partly cloudy" };
  if (code === 3) return { sky: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", label: "Drizzle" };
  if (code === 61 || code === 80) return { sky: "rain", label: "Light rain" };
  if (code === 63 || code === 81) return { sky: "rain", label: "Rain" };
  if (code === 65 || code === 82) return { sky: "rain", label: "Heavy rain" };
  if (code === 66 || code === 67)
    return { sky: "rain", label: "Freezing rain" };
  if (code === 71 || code === 85) return { sky: "snow", label: "Light snow" };
  if (code === 73) return { sky: "snow", label: "Snow" };
  if (code === 75 || code === 86) return { sky: "snow", label: "Heavy snow" };
  if (code === 77) return { sky: "snow", label: "Snow grains" };
  if (code >= 95) return { sky: "storm", label: "Thunderstorm" };
  return { sky: "cloudy", label: "Cloudy" };
}

/**
 * One hour's condition. The measured precipitation outranks the model's code:
 * a code of "overcast" with 3 mm falling is rain, and a code of "rain" over
 * 0.0 mm is a forecast that has not been believed by its own numbers.
 */
export function conditionOf(hour: ForecastHour): Condition {
  const code = hour.weatherCode;
  const coded = typeof code === "number" ? skyOfCode(code) : null;
  if (coded?.sky === "storm" || coded?.sky === "fog") return coded;

  if ((hour.snowfall ?? 0) >= SNOW_CM) {
    return { sky: "snow", label: coded?.sky === "snow" ? coded.label : "Snow" };
  }
  if (hour.precipitation >= HEAVY_RAIN_MM) {
    return { sky: "rain", label: "Heavy rain" };
  }
  if (hour.precipitation >= RAIN_MM) {
    return coded?.sky === "rain" || coded?.sky === "drizzle"
      ? coded
      : { sky: "rain", label: "Rain" };
  }
  // Dry by the numbers: whatever the code said about rain, the sky is cloud.
  if (coded?.sky === "rain" || coded?.sky === "drizzle") {
    return { sky: "cloudy", label: "Cloudy" };
  }
  if (coded?.sky === "snow") return { sky: "cloudy", label: "Cloudy" };
  return coded ?? { sky: "cloudy", label: "Cloudy" };
}

/** Worst first: the order a window's one glyph is picked in. */
const SEVERITY: Record<Sky, number> = {
  clear: 0,
  partly: 1,
  cloudy: 2,
  fog: 3,
  drizzle: 4,
  rain: 5,
  snow: 6,
  storm: 7,
};

export const isWet = (sky: Sky) =>
  sky === "drizzle" || sky === "rain" || sky === "snow" || sky === "storm";

/** What a stop gets under its time. */
export type StopWeather = Condition & {
  /** Whole °C at the start of the window; null when the series has no figure. */
  temperature: number | null;
  /** Wet at any point of the window: the stop is outdoors in it, or nearly. */
  wet: boolean;
  /** Set only when it blows hard enough to matter on a walk, km/h gusts. */
  gusts: number | null;
};

/** Gusts worth a mention beside a stop, km/h. */
const WINDY_KMH = 45;

const round = (n: number) => {
  // Math.round(-0.4) is -0, which prints "-0°".
  const r = Math.round(n);
  return r === 0 ? 0 : r;
};

/**
 * The weather over one stop: [startsAt, startsAt + durationMin). The hours it
 * overlaps are read, the worst sky among them is the one shown (a stop that
 * starts dry and ends in a storm is a stormy stop), and the temperature is the
 * air at arrival, since that is what you dress for. Null when the forecast does
 * not reach the stop — a stop already over, or past the horizon.
 */
export function stopWeather(
  forecast: readonly ForecastHour[],
  startsAt: string,
  durationMin: number,
): StopWeather | null {
  const start = Date.parse(startsAt);
  const end = start + Math.max(durationMin, 1) * 60_000;
  const covering = forecast.filter((h) => {
    const t = Date.parse(h.at);
    return t < end && t + HOUR_MS > start;
  });
  if (covering.length === 0) return null;

  const first = covering[0];
  const worst = covering
    .map(conditionOf)
    .reduce((a, b) => (SEVERITY[b.sky] > SEVERITY[a.sky] ? b : a));
  const reading = first.temperature ?? first.apparentTemperature;
  const gust = Math.max(...covering.map((h) => h.windGusts ?? 0));

  return {
    ...worst,
    temperature: reading === null ? null : round(reading),
    wet: isWet(worst.sky),
    gusts: gust >= WINDY_KMH ? round(gust) : null,
  };
}

/** The day's figures for the ribbon's second line. */
export type DaySummary = {
  /** The sky that held longest across the waking hours, or the worst of them. */
  label: string;
  sky: Sky;
  low: number;
  high: number;
};

/**
 * One line for a day's waking hours. The label names the worst weather if any
 * hour is wet, fog or storm — those are what change a day — and otherwise the
 * sky that held for most of it. The range is the air temperature, not the
 * apparent one: it is what the phone's weather app would say, and a number that
 * disagrees with it reads as a bug.
 */
export function daySummary(hours: readonly ForecastHour[]): DaySummary | null {
  const readings = hours
    .map((h) => h.temperature ?? h.apparentTemperature)
    .filter((t): t is number => t !== null);
  if (hours.length === 0 || readings.length === 0) return null;

  const conditions = hours.map(conditionOf);
  const severe = conditions.reduce((a, b) =>
    SEVERITY[b.sky] > SEVERITY[a.sky] ? b : a,
  );
  let pick: Condition = severe;
  if (SEVERITY[severe.sky] < SEVERITY.fog) {
    // Nothing disruptive: the sky that held longest.
    const counts = new Map<Sky, number>();
    for (const c of conditions) counts.set(c.sky, (counts.get(c.sky) ?? 0) + 1);
    const [sky] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    pick = conditions.find((c) => c.sky === sky) ?? severe;
  }

  return {
    sky: pick.sky,
    label: pick.label,
    low: round(Math.min(...readings)),
    high: round(Math.max(...readings)),
  };
}
