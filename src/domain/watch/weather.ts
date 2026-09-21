import {
  type EventDraft,
  type Severity,
  severityRank,
  type WeatherKind,
} from "./event.ts";

// Detector 1, weather-vs-activity. Georgia publishes no machine-readable
// warning feed, so the thresholds below are ours: there is nothing to defer to,
// and a band that turns out wrong is a number changed here with a test beside
// it rather than a prompt to re-word.
//
// The detector senses a region, not a trip, and says only what the weather is
// doing. Whether a traveller cares is the judge's question — this file must not
// try to answer it, or the same rain gets reasoned about twice, inconsistently.

export const SOURCE = "open-meteo";

/** Open-Meteo's hourly block, already named the way the domain names things. */
export type HourlySeries = {
  /** ISO instants; each value covers the hour beginning at its timestamp. */
  time: string[];
  /** mm in the hour. */
  precipitation?: (number | null)[];
  /** cm in the hour. */
  snowfall?: (number | null)[];
  /** km/h. */
  windGusts?: (number | null)[];
  /** °C, wind chill and humidity included. */
  apparentTemperature?: (number | null)[];
  /** WMO 4677. */
  weatherCode?: (number | null)[];
};

export type DetectOptions = {
  /** When the forecast was taken. Lead time, and so confidence, is measured from here. */
  observedAt: string;
  /** How far ahead to look. Past this the daily briefing covers the shape of the day. */
  horizonHours?: number;
};

/** A band starts where the one below it ends; `from` is inclusive. */
type Band = { severity: Severity; from: number };

/**
 * Ascending. A value at or above the last band's floor is `extreme`.
 *
 * Snow is banded an order of magnitude lower than rain on purpose: 2cm of rain
 * is an inconvenience, 2cm of snow on the Jvari Pass closes the only road north.
 */
const BANDS: Record<
  "rain" | "snow" | "wind" | "heat" | "cold",
  readonly Band[]
> = {
  // mm/h.
  rain: [
    { severity: "minor", from: 2 },
    { severity: "moderate", from: 5 },
    { severity: "severe", from: 10 },
    { severity: "extreme", from: 20 },
  ],
  // cm/h.
  snow: [
    { severity: "minor", from: 0.5 },
    { severity: "moderate", from: 2 },
    { severity: "severe", from: 5 },
    { severity: "extreme", from: 10 },
  ],
  // km/h gusts. 60 is where a high-sided vehicle on an exposed pass is a problem.
  wind: [
    { severity: "minor", from: 45 },
    { severity: "moderate", from: 60 },
    { severity: "severe", from: 80 },
    { severity: "extreme", from: 100 },
  ],
  // °C apparent. Tbilisi in July sits at 35 for days at a time; the band is set
  // where walking a city for three hours stops being pleasant, not where it is
  // unusual.
  heat: [
    { severity: "minor", from: 32 },
    { severity: "moderate", from: 35 },
    { severity: "severe", from: 38 },
    { severity: "extreme", from: 41 },
  ],
  // °C apparent, read downwards — see `coldSeverity`.
  cold: [
    { severity: "minor", from: -5 },
    { severity: "moderate", from: -12 },
    { severity: "severe", from: -20 },
    { severity: "extreme", from: -28 },
  ],
};

/** WMO 4677 codes that are an event in themselves, whatever the numbers say. */
const CODE_SEVERITY: Record<number, { kind: WeatherKind; severity: Severity }> =
  {
    45: { kind: "weather.fog", severity: "minor" },
    // Depositing rime: fog that ices the road as well as hiding it.
    48: { kind: "weather.fog", severity: "moderate" },
    95: { kind: "weather.thunderstorm", severity: "moderate" },
    96: { kind: "weather.thunderstorm", severity: "severe" },
    99: { kind: "weather.thunderstorm", severity: "extreme" },
  };

const bandSeverity = (bands: readonly Band[], v: number): Severity | null => {
  let hit: Severity | null = null;
  for (const band of bands) if (v >= band.from) hit = band.severity;
  return hit;
};

const coldSeverity = (v: number): Severity | null => {
  let hit: Severity | null = null;
  for (const band of BANDS.cold) if (v <= band.from) hit = band.severity;
  return hit;
};

const worse = (a: Severity, b: Severity) =>
  severityRank(a) >= severityRank(b) ? a : b;

const HOUR_MS = 60 * 60 * 1000;

/**
 * A single dry hour between two wet ones does not end the rain, and splitting
 * there would double the matches and hand the judge two half-stories.
 */
const GAP_BRIDGE_HOURS = 1;

export const DEFAULT_HORIZON_HOURS = 48;

/**
 * Convective weather is guessed, not predicted: a model that places a
 * thunderstorm in the right valley six hours out is doing well. Scale the
 * lead-time confidence down for the kinds where that is true, since confidence
 * is what the router's interrupt gate reads.
 */
const KIND_CERTAINTY: Partial<Record<WeatherKind, number>> = {
  "weather.thunderstorm": 0.8,
  "weather.fog": 0.8,
};

/**
 * 0.95 now, decaying to about 0.66 at two days out. Deliberately linear: there
 * is no measured skill score for these thresholds to fit a curve to, and
 * pretending otherwise would put a fabricated number in front of the router.
 */
export function leadConfidence(
  kind: WeatherKind,
  observedAt: string,
  validFrom: string,
): number {
  const leadHours = Math.max(
    0,
    (Date.parse(validFrom) - Date.parse(observedAt)) / HOUR_MS,
  );
  const base = Math.max(0.55, 0.95 - 0.006 * leadHours);
  return Math.round(base * (KIND_CERTAINTY[kind] ?? 1) * 100) / 100;
}

type Reading = { severity: Severity; value: number };

/** One kind's severity for each hour of the series, `null` where it is quiet. */
function readings(hourly: HourlySeries, kind: WeatherKind): (Reading | null)[] {
  const n = hourly.time.length;
  const codes = hourly.weatherCode;

  const fromSeries = (
    series: (number | null)[] | undefined,
    severity: (v: number) => Severity | null,
  ) =>
    Array.from({ length: n }, (_, i) => {
      const v = series?.[i];
      if (v === null || v === undefined) return null;
      const s = severity(v);
      return s ? { severity: s, value: v } : null;
    });

  switch (kind) {
    case "weather.rain":
      return fromSeries(hourly.precipitation, (v) =>
        bandSeverity(BANDS.rain, v),
      );
    case "weather.snow":
      return fromSeries(hourly.snowfall, (v) => bandSeverity(BANDS.snow, v));
    case "weather.wind":
      return fromSeries(hourly.windGusts, (v) => bandSeverity(BANDS.wind, v));
    case "weather.heat":
      return fromSeries(hourly.apparentTemperature, (v) =>
        bandSeverity(BANDS.heat, v),
      );
    case "weather.cold":
      return fromSeries(hourly.apparentTemperature, coldSeverity);
    case "weather.fog":
    case "weather.thunderstorm":
      return Array.from({ length: n }, (_, i) => {
        const code = codes?.[i];
        if (code === null || code === undefined) return null;
        const hit = CODE_SEVERITY[code];
        return hit?.kind === kind
          ? { severity: hit.severity, value: code }
          : null;
      });
  }
}

const METRIC: Record<WeatherKind, { metric: string; unit: string }> = {
  "weather.rain": { metric: "precipitation", unit: "mm/h" },
  "weather.snow": { metric: "snowfall", unit: "cm/h" },
  "weather.wind": { metric: "wind gusts", unit: "km/h" },
  "weather.heat": { metric: "apparent temperature", unit: "°C" },
  "weather.cold": { metric: "apparent temperature", unit: "°C" },
  "weather.fog": { metric: "WMO weather code", unit: "" },
  "weather.thunderstorm": { metric: "WMO weather code", unit: "" },
};

/** The peak of a run: the hour the traveller is being warned about. */
const peakOf = (run: { at: string; reading: Reading }[], kind: WeatherKind) =>
  run.reduce((best, hour) => {
    if (
      severityRank(hour.reading.severity) > severityRank(best.reading.severity)
    )
      return hour;
    if (
      severityRank(hour.reading.severity) < severityRank(best.reading.severity)
    )
      return best;
    const bigger =
      kind === "weather.cold"
        ? hour.reading.value < best.reading.value
        : hour.reading.value > best.reading.value;
    return bigger ? hour : best;
  });

/**
 * Contiguous breaching hours, bridged across a single quiet hour, become one
 * event spanning the whole spell at its worst severity. One spell of rain is
 * one thing that happened, and matching it hour by hour would multiply the
 * judge's bill by the length of the afternoon.
 */
export function detectWeather(
  hourly: HourlySeries,
  options: DetectOptions,
): EventDraft[] {
  const observed = Date.parse(options.observedAt);
  const horizon =
    observed + (options.horizonHours ?? DEFAULT_HORIZON_HOURS) * HOUR_MS;

  const drafts: EventDraft[] = [];

  for (const kind of Object.keys(METRIC) as WeatherKind[]) {
    const hours = readings(hourly, kind);
    let run: { at: string; reading: Reading }[] = [];
    let gap = 0;

    const close = () => {
      if (run.length === 0) return;
      const severity = run.reduce<Severity>(
        (s, h) => worse(s, h.reading.severity),
        "minor",
      );
      const validFrom = run[0].at;
      const validTo = new Date(
        Date.parse(run[run.length - 1].at) + HOUR_MS,
      ).toISOString();
      const peak = peakOf(run, kind);

      drafts.push({
        source: SOURCE,
        kind,
        severity,
        confidence: leadConfidence(kind, options.observedAt, validFrom),
        validFrom,
        validTo,
        payload: {
          ...METRIC[kind],
          peak: peak.reading.value,
          peakAt: peak.at,
          hours: run.length,
          observedAt: options.observedAt,
        },
      });
      run = [];
    };

    for (const [i, at] of hourly.time.entries()) {
      const t = Date.parse(at);
      // The hour the forecast was taken in is still ahead of most of the day:
      // drop only hours that have fully passed.
      if (t + HOUR_MS <= observed) continue;
      if (t >= horizon) break;

      const reading = hours[i];
      if (reading) {
        run.push({ at, reading });
        gap = 0;
      } else if (run.length > 0 && gap < GAP_BRIDGE_HOURS) {
        gap++;
      } else {
        close();
        gap = 0;
      }
    }
    close();
  }

  return drafts.sort(
    (a, b) =>
      Date.parse(a.validFrom) - Date.parse(b.validFrom) ||
      a.kind.localeCompare(b.kind),
  );
}

/**
 * The port. `src/infra/open-meteo.ts` is the only implementation, and the only
 * file in the codebase that knows a provider's name — which is what lets the
 * detector above be tested without a network.
 */
export type Forecaster = (
  point: readonly [lon: number, lat: number],
  hours: number,
) => Promise<HourlySeries>;
