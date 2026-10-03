import { z } from "zod";
import { dayKey } from "../trip/document.ts";
import { addDays } from "../trip/generate/schedule.ts";
import { bucketStart, type EventDraft, type RailKind } from "./event.ts";

// Detector #6, the railway — a person with a phone, once a week.
//
// Georgian Railway publishes no machine-readable status, and a cancelled
// Stadler between Tbilisi and Batumi is a cancelled day. So, like the road
// detector, this one is a person: an operator checks the railway's own notices
// on Mondays and tells the bot what is cancelled or late. Only operators — a
// stranger's word about a train is not worth the moderation queue it would
// need, and the railway is a handful of lines.
//
// What it can reach is limited by the trip document, which records a drive
// between bases and not the vehicle: a `transfer` has no mode. So a rail event
// matches the transfers that end near its line, and the judge — which sees the
// stop's title — decides whether the traveller was on the train. That is
// said plainly in the briefing; see context/phase-8-design.md.

export const RAIL_SOURCE = "rail-report";

type Station = { name: string; lonLat: readonly [number, number] };

export type RailRoute = {
  slug: string;
  name: string;
  /** In order along the line. Coordinates are approximate station centres. */
  stations: readonly Station[];
};

// Straight lines between stations, buffered by RAIL_BUFFER_M. The Surami pass
// and the Black Sea coast bend more than that, so the buffer is generous rather
// than the geometry exact: the cost of a wide buffer is a few extra pairs for
// the judge, and the cost of a narrow one is a miss.
export const railRoutes: readonly RailRoute[] = [
  {
    slug: "tbilisi-batumi",
    name: "Tbilisi – Batumi",
    stations: [
      { name: "Tbilisi", lonLat: [44.8023, 41.7226] },
      { name: "Gori", lonLat: [44.1124, 41.9842] },
      { name: "Khashuri", lonLat: [43.5995, 41.9945] },
      { name: "Kutaisi", lonLat: [42.7116, 42.2653] },
      { name: "Samtredia", lonLat: [42.3395, 42.1531] },
      { name: "Poti", lonLat: [41.6717, 42.1458] },
      { name: "Batumi", lonLat: [41.6339, 41.6431] },
    ],
  },
  {
    slug: "tbilisi-kutaisi",
    name: "Tbilisi – Kutaisi",
    stations: [
      { name: "Tbilisi", lonLat: [44.8023, 41.7226] },
      { name: "Gori", lonLat: [44.1124, 41.9842] },
      { name: "Khashuri", lonLat: [43.5995, 41.9945] },
      { name: "Kutaisi", lonLat: [42.7116, 42.2653] },
    ],
  },
  {
    slug: "tbilisi-zugdidi",
    name: "Tbilisi – Zugdidi",
    stations: [
      { name: "Tbilisi", lonLat: [44.8023, 41.7226] },
      { name: "Khashuri", lonLat: [43.5995, 41.9945] },
      { name: "Samtredia", lonLat: [42.3395, 42.1531] },
      { name: "Senaki", lonLat: [42.0603, 42.2715] },
      { name: "Zugdidi", lonLat: [41.8709, 42.5088] },
    ],
  },
  {
    slug: "tbilisi-borjomi",
    name: "Tbilisi – Borjomi",
    stations: [
      { name: "Tbilisi", lonLat: [44.8023, 41.7226] },
      { name: "Gori", lonLat: [44.1124, 41.9842] },
      { name: "Borjomi", lonLat: [43.4067, 41.8479] },
    ],
  },
];

const routeSlugs = railRoutes.map((r) => r.slug) as [string, ...string[]];

/** Wide, because the geometry between stations is a straight line. */
export const RAIL_BUFFER_M = 6_000;

export const railConditions = ["cancelled", "delayed", "running"] as const;
export type RailCondition = (typeof railConditions)[number];

export const railDurations = ["today", "tomorrow", "week"] as const;
export type RailDuration = (typeof railDurations)[number];

export const conditionLabels: Record<RailCondition, string> = {
  cancelled: "Trains cancelled",
  delayed: "Trains delayed",
  running: "Running normally (ends earlier reports)",
};

export const durationLabels: Record<RailDuration, string> = {
  today: "Rest of today",
  tomorrow: "Through tomorrow",
  week: "The next 7 days",
};

export const railReportInput = z.object({
  route: z.enum(routeSlugs),
  condition: z.enum(railConditions),
  duration: z.enum(railDurations),
});
export type RailReportInput = z.infer<typeof railReportInput>;

export const routeName = (slug: string): string =>
  railRoutes.find((r) => r.slug === slug)?.name ?? slug;

/** The WKT PostGIS reads: lon lat, in order along the line. */
export function routeLineWkt(slug: string): string | null {
  const route = railRoutes.find((r) => r.slug === slug);
  if (!route) return null;
  return `LINESTRING(${route.stations.map((s) => `${s.lonLat[0]} ${s.lonLat[1]}`).join(", ")})`;
}

/** From the report to the end of the day it covers, in Tbilisi. */
export function railWindow(
  duration: RailDuration,
  reportedAt: Date,
): { validFrom: string; validTo: string } {
  const today = dayKey(reportedAt);
  const lastDay =
    duration === "today"
      ? today
      : duration === "tomorrow"
        ? addDays(today, 1)
        : addDays(today, 6);
  // At least an hour, so a report sent at 23:30 is not over before it is read.
  const end = Math.max(
    Date.parse(`${addDays(lastDay, 1)}T00:00:00+04:00`),
    reportedAt.getTime() + 3_600_000,
  );
  return {
    validFrom: reportedAt.toISOString(),
    validTo: new Date(end).toISOString(),
  };
}

const KIND: Record<Exclude<RailCondition, "running">, RailKind> = {
  cancelled: "rail.cancelled",
  delayed: "rail.delayed",
};

/** Null for "running normally": it writes no event, it ends the open ones. */
export function railEventDraft(
  input: RailReportInput,
  reportedAt: Date,
): EventDraft | null {
  if (input.condition === "running") return null;
  const name = routeName(input.route);
  const window = railWindow(input.duration, reportedAt);
  return {
    source: RAIL_SOURCE,
    kind: KIND[input.condition],
    severity: input.condition === "cancelled" ? "severe" : "moderate",
    confidence: 0.9,
    ...window,
    payload: {
      what: KIND[input.condition],
      route: input.route,
      routeName: name,
      summary: `${name}: ${conditionLabels[input.condition].toLowerCase()}`,
      reportedAt: reportedAt.toISOString(),
    },
  };
}

export const railDedupeKey = (
  kind: RailKind,
  route: string,
  validFrom: string,
): string => [RAIL_SOURCE, kind, route, bucketStart(validFrom)].join("|");

/** One line, the same wherever a report is described. */
export function describeRail(input: RailReportInput): string {
  const name = routeName(input.route);
  return input.condition === "running"
    ? `${name} — running normally`
    : `${name} — ${conditionLabels[input.condition].toLowerCase()}, ${durationLabels[input.duration].toLowerCase()}`;
}
