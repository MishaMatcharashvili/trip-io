import type { Day } from "../data/trip.ts";

// The strip of days along the map: one chip per day and one for the whole trip.
// What a chip says, decided apart from how it looks. Read from the day's stamp
// ("D3 · TUE 16 · TODAY"), which the reference trip and a real one both have, so
// both are drawn by one function.

export type DayChip = {
  /** "all", or the day's id as the URL names it. */
  id: string;
  top: string;
  bottom: string;
  /** Everything the chip abbreviates, for a screen reader and a tooltip. */
  label: string;
  today: boolean;
  /** The watch has something for this day's traveller to decide. */
  trouble: boolean;
  past: boolean;
};

const STAMP = /·\s*([A-Za-z]{3})\s+(\d{1,2})/;

const capital = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function chipsFor(days: readonly Day[]): DayChip[] {
  return [
    {
      id: "all",
      top: "All",
      bottom: "",
      label: "The whole trip, every day on one map",
      today: false,
      trouble: false,
      past: false,
    },
    ...days.map((day): DayChip => {
      const read = STAMP.exec(day.stamp);
      return {
        id: day.id,
        top: read ? capital(read[1]) : "Day",
        bottom: read ? read[2] : String(day.index),
        label: `Day ${day.index}, ${day.title}, ${day.route}`,
        today: day.state === "today",
        trouble: day.watch.tone === "alert",
        past: day.state === "past",
      };
    }),
  ];
}

/** The map with a day chosen: the server reads `day`. */
export const hrefFor = (tripId: string, id: string) =>
  `/trips/${tripId}?day=${id}`;
