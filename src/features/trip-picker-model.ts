import { dayKey } from "../domain/trip/document.ts";

// Which of a traveller's trips the landing page opens on, and in what order the
// switcher lists them. The first upcoming trip, unless one is under way (a trip
// being travelled outranks one being planned), and the traveller's own choice
// over both. Plain values: the page reads it, and so does a test.

export type TripState = "live" | "upcoming" | "finished";

type Dated = { id: string; startsAt: string; endsAt: string };

export const stateOf = (trip: Dated, today: string): TripState =>
  dayKey(trip.endsAt) < today
    ? "finished"
    : dayKey(trip.startsAt) > today
      ? "upcoming"
      : "live";

const rank: Record<TripState, number> = { live: 0, upcoming: 1, finished: 2 };

/**
 * Under way first, then the next to start, then those that are over with the
 * most recent first: the order a traveller is likely to want them in.
 */
export function orderTrips<T extends Dated>(
  trips: readonly T[],
  today: string,
): (T & { state: TripState })[] {
  return trips
    .map((t) => ({ ...t, state: stateOf(t, today) }))
    .sort((a, b) => {
      if (a.state !== b.state) return rank[a.state] - rank[b.state];
      return a.state === "finished"
        ? b.endsAt.localeCompare(a.endsAt)
        : a.startsAt.localeCompare(b.startsAt);
    });
}

/** The trip to open on: the traveller's own choice if it is theirs, else the first. */
export function pickFeatured<T extends { id: string }>(
  ordered: readonly T[],
  wanted?: string,
): T | null {
  return (
    (wanted ? ordered.find((t) => t.id === wanted) : undefined) ??
    ordered[0] ??
    null
  );
}

const DAY_MS = 86_400_000;

/** "Starts tomorrow", "Starts in 8 days", "Starts in 4 weeks"; nothing once it has. */
export function startsIn(startsAt: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${dayKey(startsAt)}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
  if (days < 0) return "";
  if (days === 0) return "Starts today";
  if (days === 1) return "Starts tomorrow";
  if (days < 28) return `Starts in ${days} days`;
  return `Starts in ${Math.floor(days / 7)} weeks`;
}
