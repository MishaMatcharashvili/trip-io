// Dates as the shell shows them. The product tells time in one zone — Tbilisi
// (context/architecture.md) — and so does every screen, wherever the phone is.

const ZONE = "Asia/Tbilisi";

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "short",
});
const weekday = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
});
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "14 – 20 Sep", or "28 Sep – 2 Oct" across a month. */
export function dateRange(startsAt: string, endsAt: string): string {
  const from = new Date(startsAt);
  const to = new Date(endsAt);
  const [fromDay, fromMonth] = dayMonth.format(from).split(" ");
  const [toDay, toMonth] = dayMonth.format(to).split(" ");
  if (dateKey.format(from) === dateKey.format(to)) return `${toDay} ${toMonth}`;
  return fromMonth === toMonth
    ? `${fromDay} – ${toDay} ${toMonth}`
    : `${fromDay} ${fromMonth} – ${toDay} ${toMonth}`;
}

/** "15:30". */
export const timeOf = (instant: string) => clock.format(new Date(instant));

/** "Saturday 14 Sep", for a YYYY-MM-DD day key. */
export const dayLabel = (key: string) =>
  weekday.format(new Date(`${key}T12:00:00+04:00`));

/** The Tbilisi calendar date an instant falls on, as YYYY-MM-DD. */
export const dayKeyOf = (instant: string | number | Date) =>
  dateKey.format(new Date(instant));

/** "just now", "12 min ago", "3 h ago", or the date. */
export function ago(instant: string, now: number = Date.now()): string {
  const minutes = Math.round((now - Date.parse(instant)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return dayMonth.format(new Date(instant));
}

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
});

/** "Tue 16", for a YYYY-MM-DD day key. */
export const dayStamp = (key: string) =>
  shortDay.format(new Date(`${key}T12:00:00+04:00`));

/** "45 min", "2h", "2h 40m". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "Today 10:50", "Yesterday 20:12", or "15 Sep 09:05". */
export function when(instant: string, now: number = Date.now()): string {
  const key = dayKeyOf(instant);
  const day =
    key === dayKeyOf(now)
      ? "Today"
      : key === dayKeyOf(now - 86_400_000)
        ? "Yesterday"
        : dayMonth.format(new Date(instant));
  return `${day} ${timeOf(instant)}`;
}

/** "Sightseeing spot", from a catalogue category such as `sightseeing_spot`. */
export const words = (slug: string) =>
  slug.charAt(0).toUpperCase() + slug.slice(1).replace(/[_-]/g, " ");
