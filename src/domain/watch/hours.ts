import { z } from "zod";
import { addDays } from "../trip/generate/schedule.ts";
import type { EventDraft } from "./event.ts";

// Detector #5, opening hours: a traveller standing at a shut door.
//
// Opening hours are captured by hand in the catalogue, and the coherent-day
// validator already refuses a plan that falls outside them. What no catalogue
// can know is that the place is shut *today* — a holiday, a private event, a
// owner who went to a wedding. Only a person there knows, so this is a report,
// not a poll.
//
// The report is one tap with no free text, like the road form: a place and a
// date. Free text is how a competitor's café gets reported closed.

export const HOURS_SOURCE = "hours-report";

export const hoursReportInput = z.object({
  placeId: z.uuid(),
  /** Tbilisi date, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type HoursReportInput = z.infer<typeof hoursReportInput>;

/** A curator's word is enough; a traveller's needs a second traveller. */
export const reportTrusts = ["curator", "community"] as const;
export type HoursTrust = (typeof reportTrusts)[number];

/** Distinct signed-in accounts that publish a community report. */
export const QUORUM = 2;

/** How far ahead a closure can be reported. A week is how far trips are watched. */
export const MAX_DAYS_AHEAD = 7;

/**
 * The confidence follows who vouched. Both clear the interrupt floor (0.7) only
 * for a curator, and `hours.closed` is not interrupt-eligible regardless
 * (src/domain/watch/route.ts): a new detector is briefing-only until a week of
 * its verdicts has been audited.
 */
export const confidenceFor = (trust: HoursTrust): number =>
  trust === "curator" ? 0.8 : 0.6;

export type ReportDateProblem = "past" | "too-far-ahead" | "invalid";

export function checkReportDate(
  date: string,
  today: string,
): ReportDateProblem | null {
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return "invalid";
  if (date < today) return "past";
  if (date > addDays(today, MAX_DAYS_AHEAD)) return "too-far-ahead";
  return null;
}

export type Decision = "publish" | "wait";

/** Whether a report, with everyone who has made it, becomes an event. */
export function decide(trust: HoursTrust, distinctReporters: number): Decision {
  if (trust === "curator") return "publish";
  return distinctReporters >= QUORUM ? "publish" : "wait";
}

/** Midnight to midnight in Tbilisi, which keeps no daylight saving. */
export function dayWindow(date: string): {
  validFrom: string;
  validTo: string;
} {
  return {
    validFrom: new Date(`${date}T00:00:00+04:00`).toISOString(),
    validTo: new Date(`${addDays(date, 1)}T00:00:00+04:00`).toISOString(),
  };
}

/** One closure per place per day, however many people say so. */
export const hoursDedupeKey = (placeId: string, date: string): string =>
  [HOURS_SOURCE, "hours.closed", placeId, date].join("|");

export function hoursEventDraft(report: {
  placeId: string;
  placeName: string;
  date: string;
  trust: HoursTrust;
  reporters: number;
  reportedAt: string;
}): EventDraft {
  return {
    source: HOURS_SOURCE,
    kind: "hours.closed",
    severity: "moderate",
    confidence: confidenceFor(report.trust),
    ...dayWindow(report.date),
    payload: {
      what: "hours.closed",
      placeId: report.placeId,
      place: report.placeName,
      date: report.date,
      summary: `${report.placeName} is reported closed on ${report.date}.`,
      reporters: report.reporters,
      vouchedBy: report.trust,
      reportedAt: report.reportedAt,
    },
  };
}
