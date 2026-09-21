import {
  purgeExpiredEvents,
  regionsToSense,
  reopenMatches,
  type SenseRegion,
  upsertEvent,
} from "../dal/events.ts";
import { dedupeKey, severityRank } from "../domain/watch/event.ts";
import {
  DEFAULT_HORIZON_HOURS,
  detectWeather,
  type Forecaster,
} from "../domain/watch/weather.ts";
import { openMeteo } from "../infra/open-meteo.ts";

// Stage 1. Poll each source once per region containing a live trip, never once
// per trip: the difference between O(sources x regions), which is flat as trips
// grow, and O(trips x sources), which dies at a few thousand and spends most of
// its money re-fetching the same Kazbegi forecast for eighty people.
//
// Nothing here decides whether anyone cares. The detector says what the weather
// is doing, the match query works out who it reaches, and only then does a
// model see anything.

export type RegionReport = {
  region: string;
  trips: number;
  /** Events written or refreshed. */
  events: number;
  /** Events that got worse since the last forecast, and so are judged again. */
  escalated: number;
  error?: string;
};

export type SenseReport = {
  regions: number;
  events: number;
  escalated: number;
  failed: number;
  /** Expired events forgotten on the way past. */
  purged: number;
  byRegion: RegionReport[];
  ms: number;
};

/**
 * How long an event outlives its own window. Long enough to explain an
 * intervention someone is still looking at, short enough that the table stays
 * the size of the weather rather than the size of the year.
 */
export const EVENT_RETENTION_DAYS = 30;

export type SenseDeps = {
  forecast?: Forecaster;
  horizonHours?: number;
  now?: () => Date;
};

async function senseRegion(
  region: SenseRegion,
  forecast: Forecaster,
  horizonHours: number,
  observedAt: string,
): Promise<RegionReport> {
  const base = { region: region.slug, trips: region.trips };
  let events = 0;
  let escalated = 0;

  const hourly = await forecast(region.pollPoint, horizonHours);
  for (const draft of detectWeather(hourly, { observedAt, horizonHours })) {
    const key = dedupeKey(draft, region.slug);
    const written = await upsertEvent(draft, {
      regionSlug: region.slug,
      observedAt,
      dedupeKey: key,
    });
    if (!written) continue;
    events++;

    // The dedupe key deliberately collapses an hourly re-forecast onto one
    // row. That is right until the forecast gets worse: a spell judged as
    // drizzle must not keep that verdict once it is a downpour.
    if (
      written.previousSeverity &&
      severityRank(draft.severity) > severityRank(written.previousSeverity)
    ) {
      escalated += await reopenMatches(written.id);
    }
  }

  return { ...base, events, escalated };
}

/**
 * One cycle of the weather detector. A region that fails is reported and the
 * rest still run: a forecast provider returning 503 for one point must not cost
 * the whole country its hour.
 */
export async function senseWeather(deps: SenseDeps = {}): Promise<SenseReport> {
  const started = Date.now();
  const forecast = deps.forecast ?? openMeteo;
  const horizonHours = deps.horizonHours ?? DEFAULT_HORIZON_HOURS;
  const observedAt = (deps.now?.() ?? new Date()).toISOString();

  const regions = await regionsToSense(horizonHours);
  const byRegion: RegionReport[] = [];

  for (const region of regions) {
    try {
      byRegion.push(
        await senseRegion(region, forecast, horizonHours, observedAt),
      );
    } catch (error) {
      byRegion.push({
        region: region.slug,
        trips: region.trips,
        events: 0,
        escalated: 0,
        error: (error as Error).message,
      });
    }
  }

  // Housekeeping belongs to the loop that creates the rows. Events an
  // intervention cites are kept whatever their age (src/dal/events.ts).
  const purged = await purgeExpiredEvents(EVENT_RETENTION_DAYS);

  return {
    regions: regions.length,
    purged,
    events: byRegion.reduce((n, r) => n + r.events, 0),
    escalated: byRegion.reduce((n, r) => n + r.escalated, 0),
    failed: byRegion.filter((r) => r.error).length,
    byRegion,
    ms: Date.now() - started,
  };
}
