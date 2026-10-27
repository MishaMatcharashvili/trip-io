import {
  dayKey,
  nodeEnd,
  type Pace,
  sortedNodes,
  type TripDoc,
} from "../document.ts";

// Days that are too empty. The validator only knows too full (PACE_BUDGET_MIN);
// nothing objected to a museum at 14:30 and dinner at 19:00 with the afternoon
// between them blank, so a model that planned one stop in it passed. This is
// the other direction: the longest stretch a day may leave with nothing in it,
// by pace. It is feedback for the composer, not a validator rule — a catalogue
// with little in it cannot always fill a day, and a plan that cannot be
// denser is still a trip.

/** Minutes between one stop ending and the next starting before a day counts as having a hole. */
export const MAX_IDLE_MIN: Record<Pace, number> = {
  // A relaxed day is allowed its rest between lunch and dinner.
  relaxed: 180,
  moderate: 120,
  packed: 90,
};

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const length = (min: number) =>
  min % 60 === 0
    ? `${min / 60}h`
    : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

export type IdleGap = {
  /** YYYY-MM-DD, Tbilisi. */
  day: string;
  minutes: number;
  /** Said to the model on a retry, and to whoever reads the attempt log. */
  message: string;
};

/**
 * Every stretch within a day, from its first stop to its last, longer than the
 * pace allows. Check-in is not a stop to fill the time before: the evening
 * after dinner is the traveller's own.
 */
export function idleGaps(doc: TripDoc): IdleGap[] {
  const limit = MAX_IDLE_MIN[doc.trip.pace];
  const byDay = new Map<string, ReturnType<typeof sortedNodes>>();
  for (const entry of sortedNodes(doc.nodes)) {
    if (entry.node.kind === "stay") continue;
    const day = dayKey(entry.node.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }

  const gaps: IdleGap[] = [];
  for (const [day, entries] of byDay) {
    for (let i = 1; i < entries.length; i++) {
      const before = entries[i - 1].node;
      const after = entries[i].node;
      const minutes = Math.round(
        (Date.parse(after.startsAt) - nodeEnd(before)) / 60_000,
      );
      if (minutes <= limit) continue;
      gaps.push({
        day,
        minutes,
        message: `${day}: ${length(minutes)} with nothing planned between "${before.meta.title}" (ends ${clock.format(nodeEnd(before))}) and "${after.meta.title}" (${clock.format(Date.parse(after.startsAt))}). A ${doc.trip.pace} day leaves at most ${length(limit)}: add a visit there`,
      });
    }
  }
  return gaps;
}
