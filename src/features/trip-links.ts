// Where a trip's days are read. A day is a row of the Trip tab, opened in
// place, and `?day=` is which one is open: a day's number, or "today". Extra
// parameters carry what the day's editor should start with (an add-stop panel,
// a place to look for).

export type DayLinkOptions = {
  /** Open the add-a-stop panel. */
  add?: boolean;
  /** A place to look for as it opens: "add to trip" from Explore. */
  q?: string;
};

export function dayHref(
  tripId: string,
  day: string | number = "today",
  options: DayLinkOptions = {},
): string {
  const params = new URLSearchParams({ day: String(day) });
  if (options.add) params.set("add", "1");
  if (options.q) params.set("q", options.q);
  return `/trips/${tripId}/trip?${params}`;
}

/** The first of a parameter that may have been sent more than once. */
export const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const DAY_MS = 86_400_000;

/**
 * Days worth asking for a forecast: today and the week after. Earlier days
 * are over, and a forecast further out says little and costs the same call.
 */
export function worthForecasting(date: string, today: string): boolean {
  const days =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
    DAY_MS;
  return days >= 0 && days <= 7;
}
