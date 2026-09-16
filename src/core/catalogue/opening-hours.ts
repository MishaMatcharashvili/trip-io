import { z } from "zod";

// `place.opening_hours`, captured by hand during curation (no source provides it
// for Georgia). The Phase 2 coherent-day validator and detector 5 both read it
// through `isOpenAt`, never by poking at the JSON.

export const weekdays = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type Weekday = (typeof weekdays)[number];

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "expected HH:MM");

// `close` earlier than `open` runs past midnight: a bar open 20:00–02:00 is one
// interval on the day it opens, not two.
export const interval = z
  .object({ open: hhmm, close: hhmm })
  .refine((i) => i.open !== i.close, "open and close are the same time");
export type Interval = z.infer<typeof interval>;

const dayIntervals = z.array(interval).max(4);

export const openingHours = z.discriminatedUnion("kind", [
  // Outdoor sites: lakes, viewpoints, most churches in the mountains.
  z.object({
    kind: z.literal("always"),
    months: z.array(z.number().int().min(1).max(12)).min(1).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("weekly"),
    // An empty array is "closed that day", which is information; a missing day
    // would be ambiguous, so all seven are required.
    days: z.object(
      Object.fromEntries(weekdays.map((d) => [d, dayIntervals])) as Record<
        Weekday,
        typeof dayIntervals
      >,
    ),
    // Open season, e.g. a Tusheti guesthouse [6, 7, 8, 9]. Omitted = all year.
    months: z.array(z.number().int().min(1).max(12)).min(1).optional(),
    note: z.string().max(500).optional(),
  }),
]);
export type OpeningHours = z.infer<typeof openingHours>;

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export type LocalTime = { weekday: Weekday; minutes: number; month: number };

/** Georgia is UTC+4 all year (no DST since 2005), but go through Intl anyway. */
export function tbilisiTime(date: Date): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tbilisi",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      month: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    weekday: parts.weekday.toLowerCase() as Weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    month: Number(parts.month),
  };
}

const previousDay = (d: Weekday) => weekdays[(weekdays.indexOf(d) + 6) % 7];

/**
 * Whether the place is open at a local time. Season is judged by the month the
 * interval started in, so a 31 Aug 23:00–02:00 shift still counts on 1 Sep.
 */
export function isOpenAt(hours: OpeningHours, at: LocalTime): boolean {
  const inSeason = (month: number) =>
    hours.months === undefined || hours.months.includes(month);

  if (hours.kind === "always") return inSeason(at.month);

  const today = hours.days[at.weekday].some((i) => {
    const open = toMinutes(i.open);
    const close = toMinutes(i.close);
    return close > open
      ? at.minutes >= open && at.minutes < close
      : at.minutes >= open; // overnight: today's part
  });
  if (today) return inSeason(at.month);

  // Overnight intervals that started yesterday. Month boundary is approximate
  // (same month assumed) — only matters for a shift crossing a season edge.
  return (
    inSeason(at.month) &&
    hours.days[previousDay(at.weekday)].some((i) => {
      const open = toMinutes(i.open);
      const close = toMinutes(i.close);
      return close <= open && at.minutes < close;
    })
  );
}

/**
 * Parses the curation form's per-day text: "09:00-18:00", "10-14, 15:30-22",
 * "closed" or "" (closed). Returns an error string rather than throwing so the
 * form can show it inline.
 */
export function parseDayText(
  text: string,
): { ok: true; intervals: Interval[] } | { ok: false; error: string } {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "" || trimmed === "closed" || trimmed === "-") {
    return { ok: true, intervals: [] };
  }

  const intervals: Interval[] = [];
  for (const part of trimmed.split(/\s*,\s*/)) {
    const match = part.match(
      /^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/,
    );
    if (!match) return { ok: false, error: `can't read "${part}"` };
    const [, oh, om = "00", ch, cm = "00"] = match;
    const candidate = {
      open: `${oh.padStart(2, "0")}:${om}`,
      close: `${ch.padStart(2, "0")}:${cm}`,
    };
    const parsed = interval.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false,
        error: `"${part}": ${parsed.error.issues[0].message}`,
      };
    }
    intervals.push(parsed.data);
  }
  return { ok: true, intervals };
}

export function formatDay(intervals: Interval[]): string {
  return intervals.length === 0
    ? "closed"
    : intervals.map((i) => `${i.open}-${i.close}`).join(", ");
}
