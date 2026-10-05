import { cacheLife } from "next/cache";
import { type AreaCount, catalogueByArea } from "@/bll/places";
import { dayForecast, type ForecastHour } from "@/bll/trip-screen";
import type { LonLat } from "@/domain/geo";
import { dayKey } from "@/domain/trip/document";

// Reads that are the same for every visitor, cached across requests with
// "use cache". Under Cache Components they can also be prerendered, so a page
// built from them alone is served from the CDN.
//
// They wrap use cases rather than living in src/bll: the use cases also run
// under plain Node (the tests, the Trigger.dev tasks), where cacheLife()
// throws, and a use case should not know which framework is calling it.
//
// Nothing here belongs to one traveller. A trip is never cached: the watch
// changes it from cron, and a stale trip is the one thing this product must
// not show.

/**
 * Today in Tbilisi, as YYYY-MM-DD. Up to an hour late just after midnight,
 * which is fine for what uses it: a date picker's lower bound, and the month
 * Explore's road notes are written for.
 */
export async function tbilisiToday(): Promise<string> {
  "use cache";
  cacheLife("hours");
  return dayKey(new Date());
}

/**
 * How many places each focus area holds: Explore's region chips. Curation
 * moves these slowly, and an hour behind costs nothing.
 */
export async function areaCounts(): Promise<AreaCount[]> {
  "use cache";
  cacheLife("hours");
  return catalogueByArea();
}

/**
 * The hourly forecast ribbon for a day at a point. Open-Meteo updates hourly
 * at best and the plan pays per call (docs/implementation-plan.md §2), so
 * everyone looking at the same area and day shares one answer for 15 minutes.
 * The point is rounded to about a kilometre so near-identical trips share it
 * too. A failed fetch is also kept for those minutes: the ribbon is a
 * convenience, and retrying on every page view would not bring it back sooner.
 */
export function forecastRibbon(
  point: LonLat,
  date: string,
): Promise<ForecastHour[] | null> {
  // Rounded before the cached call: its arguments are its cache key.
  const round = (n: number) => Math.round(n * 100) / 100;
  return cachedForecast(round(point[0]), round(point[1]), date);
}

/**
 * The same forecast for one stop, on a coarser grid: about ten kilometres,
 * which is already finer than the model's own resolution. A day of stops in
 * one town is then one call between all of them, where the ribbon's
 * kilometre grid would make a call of each.
 */
export function stopForecast(
  point: LonLat,
  date: string,
): Promise<ForecastHour[] | null> {
  const round = (n: number) => Math.round(n * 10) / 10;
  return cachedForecast(round(point[0]), round(point[1]), date);
}

async function cachedForecast(
  lon: number,
  lat: number,
  date: string,
): Promise<ForecastHour[] | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  return dayForecast([lon, lat], date);
}
