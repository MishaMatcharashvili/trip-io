import type { LonLat } from "@/domain/geo";
import type { RouteAnswer } from "@/domain/route/contract";
import recording from "./georgia-road.json" with { type: "json" };

/**
 * The example trip's road through `georgiaMapStops`, recorded once from
 * OpenStreetMap by `pnpm record:example-road`. The example is what a visitor
 * sees before they have a session, and a session is what asking for a road
 * takes, so its maps draw this instead of asking. Times are OSRM's, without
 * traffic; the screens say so.
 */
export type RecordedRoad = {
  /** Where the road came from, for the words under it. */
  source: string;
  /** The stops it was recorded through, in order. */
  stops: LonLat[];
  answer: RouteAnswer;
};

const legs = recording.legs.map((leg) => ({
  distanceM: leg.distanceM,
  durationS: leg.durationS,
  typicalDurationS: null,
  path: leg.path as LonLat[],
}));

export const georgiaRoad: RecordedRoad = {
  source: recording.source,
  stops: recording.stops as LonLat[],
  answer: {
    routes: [
      {
        distanceM: legs.reduce((n, l) => n + l.distanceM, 0),
        durationS: legs.reduce((n, l) => n + l.durationS, 0),
        typicalDurationS: null,
        // Each leg starts where the last one ended.
        path: legs.flatMap((l, i) => (i === 0 ? l.path : l.path.slice(1))),
        legs,
        description: null,
      },
    ],
    stops: recording.snaps.map((s) => ({
      lonLat: s.lonLat as LonLat,
      distanceM: s.distanceM,
      road: s.road,
    })),
    mode: "drive",
    traffic: "none",
    computedAt: recording.recordedAt,
  },
};
