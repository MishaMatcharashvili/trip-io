import type { Day } from "@/data/trip";
import { stopWeather } from "@/domain/forecast";
import { stopForecast } from "./shared-reads";
import { worthForecasting } from "./trip-links";

/**
 * A day with the weather under each stop's time. Each stop is read from the
 * forecast at its own place — a day that drives from Tbilisi to Kazbegi has
 * two skies — but stops that share a grid cell share one cached call.
 *
 * Quiet by design: a stop with no place, a day outside the forecast's reach,
 * or a provider that is down leaves the stop as it was. The weather under a
 * time is a convenience and a page never fails for want of it.
 */
export async function withStopWeather(day: Day, today: string): Promise<Day> {
  if (!day.date || !worthForecasting(day.date, today)) return day;
  const date = day.date;

  const weather = await Promise.all(
    day.checkpoints.map(async (c) => {
      const node = c.node;
      if (!node?.lonLat || c.state === "done") return undefined;
      const hours = await stopForecast(node.lonLat, date);
      return hours
        ? (stopWeather(hours, node.startsAt, node.durationMin) ?? undefined)
        : undefined;
    }),
  );

  return {
    ...day,
    checkpoints: day.checkpoints.map((c, i) =>
      weather[i] ? { ...c, weather: weather[i] } : c,
    ),
  };
}
