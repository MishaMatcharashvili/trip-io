import {
  type EventArea,
  type LiveMatch,
  lastCheckFor,
  liveEventAreas,
  liveMatchesFor,
} from "../dal/matches.ts";
import { type PlaceCard, placeCards } from "../dal/places.ts";
import { type PatchRecord, type TripListRow, tripsFor } from "../dal/trips.ts";
import { loadWatch, type Watch } from "../dal/watches.ts";
import type { LonLat } from "../domain/geo.ts";
import {
  placeIdsOf,
  sortedNodes,
  type TripDoc,
} from "../domain/trip/document.ts";
import { openMeteo } from "../infra/open-meteo.ts";
import { type AlertsPage, alertsPage } from "./interventions.ts";
import { docAt, history, type TripView, tripView } from "./trip-document.ts";

// The read models behind the web client's trip screens. Each is one call a page
// makes after it has checked access; none of them decides anything.

export type TripScreen = TripView & {
  id: string;
  /** Every place the trip visits, by id. */
  places: Record<string, PlaceCard>;
  /** Where each node is: its place's point, or its own for a placeless node. */
  positions: Record<string, LonLat>;
  /** Judged pairs still in effect, newest first. */
  matches: LiveMatch[];
  /** Where the events behind those pairs are: the map's weather and road layers. */
  events: EventArea[];
  alerts: AlertsPage;
  /** The patch log, newest first. */
  history: PatchRecord[];
  watch: Watch | null;
  lastCheck: string | null;
  /**
   * The document before the head patch, when there is one before it: what the
   * "day updated" panel diffs against, and what an undo would go back to.
   */
  before: TripDoc | null;
};

/** Everything the trip screens show about one trip. Access is the caller's. */
export async function tripScreen(tripId: string): Promise<TripScreen | null> {
  const view = await tripView(tripId);
  if (!view) return null;

  const [places, matches, events, alerts, patches, watch, lastCheck] =
    await Promise.all([
      placeCards(placeIdsOf(view.doc)),
      liveMatchesFor(tripId),
      liveEventAreas(tripId),
      alertsPage(tripId),
      history(tripId),
      loadWatch(tripId),
      lastCheckFor(tripId),
    ]);

  const previous = patches[1];
  const before = previous ? await docAt(tripId, previous.id) : null;

  const positions: Record<string, LonLat> = {};
  for (const { id, node } of sortedNodes(view.doc.nodes)) {
    const at = node.placeId ? places.get(node.placeId)?.lonLat : node.lonLat;
    if (at) positions[id] = at;
  }

  return {
    ...view,
    id: tripId,
    places: Object.fromEntries(places),
    positions,
    matches,
    events,
    alerts,
    history: patches,
    watch,
    lastCheck,
    before,
  };
}

export type { EventArea, LiveMatch, TripListRow };

/** A traveller's trips, soonest first. */
export function myTrips(userId: string): Promise<TripListRow[]> {
  return tripsFor(userId);
}

export type ForecastHour = {
  at: string;
  /** mm in the hour. */
  precipitation: number;
  apparentTemperature: number | null;
};

/** Open-Meteo forecasts this far ahead and no further. */
const FORECAST_HORIZON_H = 16 * 24;

/**
 * The hourly forecast for one Tbilisi day at one point, from now to the end of
 * that day. Null for a day already over or beyond the forecast's reach, and
 * null when the forecast cannot be had: the ribbon is a convenience, and a
 * page never fails for want of it.
 */
export async function dayForecast(
  point: LonLat,
  date: string,
  now: Date = new Date(),
): Promise<ForecastHour[] | null> {
  const end = Date.parse(`${date}T23:59:00+04:00`);
  const hours = Math.ceil((end - now.getTime()) / 3_600_000);
  if (hours <= 0 || hours > FORECAST_HORIZON_H) return null;

  try {
    const series = await openMeteo(point, hours);
    const start = Date.parse(`${date}T00:00:00+04:00`);
    return series.time.flatMap((at, i) => {
      const t = Date.parse(at);
      if (t < start || t > end) return [];
      return [
        {
          at,
          precipitation: series.precipitation?.[i] ?? 0,
          apparentTemperature: series.apparentTemperature?.[i] ?? null,
        },
      ];
    });
  } catch {
    return null;
  }
}
