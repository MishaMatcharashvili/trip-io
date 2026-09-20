import type { Forecaster, HourlySeries } from "../domain/watch/weather.ts";

// Detector 1's source. Open-Meteo, because Georgia's own meteorological service
// publishes no machine-readable feed at all — there is no official warning to
// defer to, so the thresholds in src/domain/watch/weather.ts are ours and this
// file's only job is to deliver numbers to them.
//
// The free tier is CC BY 4.0 and non-commercial; a paid product needs the
// commercial endpoint, which is the same API behind an API key. Both are
// supported here so development costs nothing and production is a key away.

const FREE = "https://api.open-meteo.com/v1/forecast";
const COMMERCIAL = "https://customer-api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

/** Named the way Open-Meteo names them; the domain never sees these strings. */
const HOURLY = [
  "precipitation",
  "snowfall",
  "wind_gusts_10m",
  "apparent_temperature",
  "weather_code",
] as const;

type Response = {
  hourly?: {
    time?: number[];
    precipitation?: (number | null)[];
    snowfall?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    weather_code?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
};

/**
 * Unix timestamps rather than local strings: Open-Meteo's default `iso8601`
 * carries no offset, so a value read as an instant would be silently four hours
 * out in Tbilisi — in a system whose whole job is to say when something happens.
 */
const BASE_PARAMS = {
  hourly: HOURLY.join(","),
  timeformat: "unixtime",
  timezone: "UTC",
};

function toSeries(body: Response): HourlySeries {
  const hourly = body.hourly;
  if (!hourly?.time) throw new Error("open-meteo returned no hourly series");
  return {
    time: hourly.time.map((t) => new Date(t * 1000).toISOString()),
    precipitation: hourly.precipitation,
    snowfall: hourly.snowfall,
    windGusts: hourly.wind_gusts_10m,
    apparentTemperature: hourly.apparent_temperature,
    weatherCode: hourly.weather_code,
  };
}

async function get(url: URL): Promise<Response> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const body = (await response.json()) as Response;
  if (!response.ok || body.error) {
    throw new Error(
      `open-meteo ${response.status}: ${body.reason ?? response.statusText}`,
    );
  }
  return body;
}

/**
 * The live forecast. `OPEN_METEO_API_KEY` switches to the commercial endpoint;
 * without it this is the free tier, which is fine for development and not
 * licensed for anything else.
 */
export const openMeteo: Forecaster = async ([lon, lat], hours) => {
  const key = process.env.OPEN_METEO_API_KEY;
  const url = new URL(key ? COMMERCIAL : FREE);
  url.search = new URLSearchParams({
    ...BASE_PARAMS,
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    forecast_hours: String(hours),
    ...(key ? { apikey: key } : {}),
  }).toString();
  return toSeries(await get(url));
};

/**
 * What the weather actually did, for a date range that has already happened.
 * The Phase 3 kill-criteria count runs the whole pipeline over synthetic trips
 * and real history — the only way to learn how often this system would speak
 * before there is a traveller to speak to.
 */
export async function openMeteoArchive(
  [lon, lat]: readonly [number, number],
  startDate: string,
  endDate: string,
): Promise<HourlySeries> {
  const url = new URL(ARCHIVE);
  url.search = new URLSearchParams({
    ...BASE_PARAMS,
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: startDate,
    end_date: endDate,
  }).toString();
  return toSeries(await get(url));
}
