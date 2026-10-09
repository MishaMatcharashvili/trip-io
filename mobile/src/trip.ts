import { client, read } from "~/api";
import {
  conflictLine,
  currentDay,
  type ModelDay,
  type ModelStop,
  daysOf as modelDays,
  phaseOf,
  pointsOf,
  stopDetail,
} from "~/trip-model.ts";

// One trip as its screens read it: the server's whole read of the trip
// (`/trips/:id/screen`), with the days, stops and watch states that
// src/trip-model.ts works out from it. Everything here is derived; nothing is
// decided. The web app works the same things out in src/features/trip-model.ts.

export const loadScreen = (id: string) =>
  read(client().trips[":id"].screen.$get({ param: { id } }));

export type TripScreen = Awaited<ReturnType<typeof loadScreen>>;
export type TripNode = TripScreen["doc"]["nodes"][string];
export type Match = TripScreen["matches"][number];
export type Alert = TripScreen["alerts"]["alerts"][number];
export type Place = TripScreen["places"][string];
export type Stop = ModelStop<TripNode, Place>;
export type Day = ModelDay<TripNode, Place>;

export { conflictLine, currentDay, phaseOf, pointsOf, stopDetail };

/** The days that have stops, in order, each with its stops in time order. */
export const daysOf = (screen: TripScreen, now?: number): Day[] =>
  modelDays<TripNode, Place>(screen, now);

/** The cards still waiting for an answer. */
export const waitingOf = (screen: TripScreen): Alert[] =>
  screen.alerts.alerts.filter((a) => a.outcome === null);

/** The detector families, each with how many stops it has matched. */
export function watchStrip(screen: TripScreen) {
  const count = (prefix: string) =>
    new Set(
      screen.matches
        .filter((m) => m.kind.startsWith(prefix))
        .map((m) => m.nodeId),
    ).size;
  return (
    [
      ["Weather", "weather"],
      ["Roads", "road"],
      ["Trains", "rail"],
      ["Events", "event"],
    ] as const
  ).map(([name, prefix]) => ({ name, count: count(prefix) }));
}
