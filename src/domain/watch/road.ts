import { z } from "zod";
import { corridors, hazard } from "../catalogue/corridors.ts";
import { dayKey } from "../trip/document.ts";
import type { EventDraft, RoadKind, Severity } from "./event.ts";

// Detector #2, the road corridors — a person with a phone, for now.
//
// There is no scrapeable Georgian road-conditions source (georoad.ge redirects
// to a construction-news feed), so the plan's answer is to be the detector
// before building one: a form in Telegram against the 12 curated corridors,
// whose every report and outcome is a label for Phase 8's automation spike.
//
// Anyone may report. An operator's report is published at once; anyone else's
// waits for an operator to approve it, because a road report is the one input
// here a stranger can type, and a false "closed" on the Military Road is a
// traveller turned back from a pass that was open.

/** The source every road event carries, and the word the evidence must name. */
export const ROAD_SOURCE = "road-report";

export const roadConditions = [
  "closed",
  "restricted",
  "delays",
  "hazard",
  // Not an event: it ends the ones open on the corridor.
  "reopened",
] as const;
export type RoadCondition = (typeof roadConditions)[number];

/** The corridors' seasonal hazards, plus the two that are not seasonal. */
export const roadHazards = [
  ...hazard.options,
  "roadworks",
  "accident",
] as const;
export type RoadHazard = (typeof roadHazards)[number];

export const reportDurations = [
  "2h",
  "6h",
  "today",
  "days",
  "unknown",
] as const;
export type ReportDuration = (typeof reportDurations)[number];

const corridorSlugs = corridors.map((c) => c.slug) as [string, ...string[]];

/** What the form produces. Nothing free-text: a form, so every field is a label. */
export const roadReportInput = z
  .object({
    corridorSlug: z.enum(corridorSlugs),
    condition: z.enum(roadConditions),
    hazard: z.enum(roadHazards).nullable(),
    duration: z.enum(reportDurations),
  })
  .refine((r) => r.condition !== "reopened" || r.hazard === null, {
    message: "a reopening has no hazard",
  });
export type RoadReportInput = z.infer<typeof roadReportInput>;

// ---------------------------------------------------------------------------
// Words, for the form and for the traveller

export const conditionLabels: Record<RoadCondition, string> = {
  closed: "Closed",
  restricted: "Restricted — one lane, chains or 4x4 only",
  delays: "Slow — delays or roadworks",
  hazard: "Passable, with a hazard",
  reopened: "Open again",
};

export const hazardLabels: Record<RoadHazard, string> = {
  avalanche: "Avalanche",
  "snow-closure": "Snow",
  ice: "Ice",
  landslide: "Landslide",
  mudflow: "Mudflow",
  rockfall: "Rockfall",
  flood: "Flooding",
  fog: "Fog",
  roadworks: "Roadworks",
  accident: "Accident",
};

export const durationLabels: Record<ReportDuration, string> = {
  "2h": "About 2 hours",
  "6h": "About 6 hours",
  today: "Rest of today",
  days: "A few days",
  unknown: "Not sure",
};

/** "Georgian Military Road", without the waypoints in brackets. */
export const shortName = (name: string) => name.split(" (")[0];

export const corridorName = (slug: string): string =>
  shortName(corridors.find((c) => c.slug === slug)?.name ?? slug);

/** One line, the same wherever a report is described. */
export function describeReport(report: RoadReportInput): string {
  const road = corridorName(report.corridorSlug);
  if (report.condition === "reopened") return `${road} — open again`;
  const what = conditionLabels[report.condition].split(" — ")[0].toLowerCase();
  const cause = report.hazard
    ? ` (${hazardLabels[report.hazard].toLowerCase()})`
    : "";
  const howLong =
    report.duration === "unknown"
      ? ", for an unknown time"
      : `, ${durationLabels[report.duration].toLowerCase()}`;
  return `${road} — ${what}${cause}${howLong}`;
}

const untilFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * A report as it stands once sent: its end is a time, not a duration any more.
 * "Until Sat 16:00" is what an operator deciding whether to approve it, and a
 * reporter hearing what became of it, both actually need.
 */
export function describeStored(report: {
  corridorSlug: string;
  condition: RoadCondition;
  hazard: RoadHazard | null;
  validTo: string;
}): string {
  const road = corridorName(report.corridorSlug);
  if (report.condition === "reopened") return `${road} — open again`;
  const what = conditionLabels[report.condition].split(" — ")[0].toLowerCase();
  const cause = report.hazard
    ? ` (${hazardLabels[report.hazard].toLowerCase()})`
    : "";
  return `${road} — ${what}${cause}, until ${untilFormat.format(new Date(report.validTo))}`;
}

// ---------------------------------------------------------------------------
// From a report to an event

const KIND: Record<Exclude<RoadCondition, "reopened">, RoadKind> = {
  closed: "road.closure",
  restricted: "road.restriction",
  delays: "road.delay",
  hazard: "road.hazard",
};

const SEVERITY: Record<Exclude<RoadCondition, "reopened">, Severity> = {
  closed: "severe",
  restricted: "moderate",
  hazard: "moderate",
  delays: "minor",
};

/**
 * How long a report stays true when nobody says otherwise. "Not sure" is half a
 * day: long enough to cover the drive it was reported for, short enough that a
 * closure nobody updated does not haunt tomorrow's briefing. A later report on
 * the same road ends it sooner either way.
 */
const HOURS: Record<Exclude<ReportDuration, "today">, number> = {
  "2h": 2,
  "6h": 6,
  days: 72,
  unknown: 12,
};

/** The window a report describes, from the moment it was sent. */
export function reportWindow(
  duration: ReportDuration,
  reportedAt: Date,
): { validFrom: string; validTo: string } {
  const from = reportedAt.getTime();
  const to =
    duration === "today"
      ? // Midnight in Tbilisi, which keeps no daylight saving. At least an
        // hour, so a report sent at 23:30 is not over before anyone reads it.
        Math.max(
          Date.parse(`${dayKey(reportedAt)}T24:00:00+04:00`),
          from + 3_600_000,
        )
      : from + HOURS[duration] * 3_600_000;
  return {
    validFrom: new Date(from).toISOString(),
    validTo: new Date(to).toISOString(),
  };
}

export const reportTrusts = ["operator", "community"] as const;
export type ReportTrust = (typeof reportTrusts)[number];

/**
 * How far to trust it. An operator's own report, and a stranger's report an
 * operator vouched for, are both above the interrupt floor (0.7) — a detector
 * that graduates can then act on either — but they are not the same claim, and
 * the number says so.
 */
export const CONFIDENCE: Record<ReportTrust, number> = {
  operator: 0.9,
  community: 0.8,
};

/**
 * The event a published report becomes, or null for a reopening, which writes
 * none. The payload is everything the judge may cite and the card may show.
 */
export function roadEventDraft(input: {
  report: RoadReportInput;
  trust: ReportTrust;
  window: { validFrom: string; validTo: string };
  reportedAt: string;
}): EventDraft | null {
  const { report } = input;
  if (report.condition === "reopened") return null;
  return {
    source: ROAD_SOURCE,
    kind: KIND[report.condition],
    severity: SEVERITY[report.condition],
    confidence: CONFIDENCE[input.trust],
    validFrom: input.window.validFrom,
    validTo: input.window.validTo,
    payload: {
      corridor: report.corridorSlug,
      corridorName: corridorName(report.corridorSlug),
      condition: report.condition,
      hazard: report.hazard,
      summary: describeReport(report),
      reportedAt: input.reportedAt,
      trust: input.trust,
    },
  };
}

// ---------------------------------------------------------------------------
// Moderation

/**
 * Reports one person may have waiting for review at once. Enough for a
 * reporter driving the whole Military Road in a storm; few enough that a
 * stranger cannot bury the operators' queue.
 */
export const MAX_PENDING_PER_REPORTER = 3;

/**
 * What approving a report does. A report whose window has already closed is
 * recorded as `expired` rather than published: news about a two-hour closure
 * that ended before anyone looked is history, and publishing it would match it
 * against drives it never touched.
 */
export function onApproval(
  window: { validTo: string },
  now: Date,
): "published" | "expired" {
  return Date.parse(window.validTo) > now.getTime() ? "published" : "expired";
}
