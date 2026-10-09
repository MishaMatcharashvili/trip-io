import { client, read } from "~/api";
import { dayKeyOf, dayStamp, duration, timeOf } from "~/format";
import type { LonLat } from "~/map";
import type { Tone } from "~/ui";

// One trip as its screens read it: the server's whole read of the trip
// (`/trips/:id/screen`), and the days, stops and watch states worked out from
// it. Everything here is derived; nothing is decided. The web app works the
// same things out in src/features/trip-model.ts.

export const loadScreen = (id: string) =>
  read(client().trips[":id"].screen.$get({ param: { id } }));

export type TripScreen = Awaited<ReturnType<typeof loadScreen>>;
export type TripNode = TripScreen["doc"]["nodes"][string];
export type Match = TripScreen["matches"][number];
export type Alert = TripScreen["alerts"]["alerts"][number];
export type Place = TripScreen["places"][string];

export type Stop = {
  id: string;
  node: TripNode;
  /** "16:00". */
  time: string;
  state: "done" | "now" | "next";
  /** What the watch has matched on this stop, in words, or null. */
  conflict: string | null;
  place: Place | null;
  at: LonLat | null;
};

export type Segment = {
  weight: number;
  tone: "filled" | "empty" | "agent" | "agent-soft" | "alert";
};

export type Day = {
  /** YYYY-MM-DD in Tbilisi. */
  key: string;
  /** 1 for the first day with stops. */
  index: number;
  /** "D3 · Tue 16". */
  stamp: string;
  summary: string;
  state: "past" | "today" | "future";
  stops: Stop[];
  watch: { tone: Tone | "idle"; label: string };
  segments: Segment[];
};

const MIN = 60_000;

const KINDS: Record<string, string> = {
  weather: "Weather",
  road: "Road",
  rail: "Trains",
  event: "Event",
  hours: "Reported shut",
  safety: "Demonstration",
};

/** What a matched event says on the stop it touches: "Weather · rain 15:30–19:00". */
export function conflictLine(match: Match): string {
  const [family, what] = match.kind.split(".");
  const until = match.validTo ? `–${timeOf(match.validTo)}` : "";
  const detail = what ? ` · ${what.replace(/_/g, " ")}` : "";
  return `${KINDS[family] ?? family}${detail} ${timeOf(match.validFrom)}${until}`;
}

/** A stop's line under its title: how long, and what it is. */
export function stopDetail(stop: Stop): string {
  const parts = [
    stop.node.durationMin ? duration(stop.node.durationMin) : null,
    stop.node.meta.booked ? "Booked" : null,
    stop.node.kind === "transfer" ? "Drive" : null,
    stop.node.indoor ? "Indoors" : null,
  ].filter(Boolean);
  return stop.conflict
    ? [...parts, stop.conflict].join(" · ")
    : parts.join(" · ");
}

function segmentsOf(stops: Stop[], state: Day["state"]): Segment[] {
  const segments: Segment[] = [];
  let cursor: number | null = null;
  for (const stop of stops) {
    const start = Date.parse(stop.node.startsAt);
    if (cursor !== null && start - cursor > 20 * MIN) {
      segments.push({ weight: (start - cursor) / (60 * MIN), tone: "empty" });
    }
    const tone: Segment["tone"] = stop.conflict
      ? "alert"
      : state === "today"
        ? stop.state === "next"
          ? "agent-soft"
          : "agent"
        : "filled";
    segments.push({ weight: Math.max(0.5, stop.node.durationMin / 60), tone });
    cursor = start + stop.node.durationMin * MIN;
  }
  return segments;
}

/** The days that have stops, in order, each with its stops in time order. */
export function daysOf(screen: TripScreen, now: number = Date.now()): Day[] {
  const today = dayKeyOf(now);
  const byDay = new Map<string, Stop[]>();
  for (const [id, node] of Object.entries(screen.doc.nodes)) {
    const start = Date.parse(node.startsAt);
    const end = start + node.durationMin * MIN;
    const match = screen.matches.find((m) => m.nodeId === id);
    const key = dayKeyOf(node.startsAt);
    const stop: Stop = {
      id,
      node,
      time: timeOf(node.startsAt),
      state: end <= now ? "done" : start <= now ? "now" : "next",
      conflict: match ? conflictLine(match) : null,
      place: node.placeId ? (screen.places[node.placeId] ?? null) : null,
      at: screen.positions[id] ?? null,
    };
    byDay.set(key, [...(byDay.get(key) ?? []), stop]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, unsorted], i) => {
      const stops = unsorted.sort(
        (a, b) =>
          Date.parse(a.node.startsAt) - Date.parse(b.node.startsAt) ||
          (a.id < b.id ? -1 : 1),
      );
      const state: Day["state"] =
        key < today ? "past" : key === today ? "today" : "future";
      const conflicts = stops.filter((s) => s.conflict).length;
      const watch: Day["watch"] =
        state === "past"
          ? { tone: "idle", label: "Done" }
          : conflicts
            ? {
                tone: "alert",
                label: `${conflicts} ${conflicts === 1 ? "conflict" : "conflicts"}`,
              }
            : screen.watch
              ? { tone: "ok", label: "Clear" }
              : { tone: "idle", label: "Not watched" };
      const named = stops.filter((s) => s.node.kind !== "transfer");
      return {
        key,
        index: i + 1,
        stamp: `D${i + 1} · ${dayStamp(key)}${state === "today" ? " · Today" : ""}`,
        summary: (named.length ? named : stops)
          .slice(0, 2)
          .map((s) => s.node.meta.title)
          .join(" · "),
        state,
        stops,
        watch,
        segments: segmentsOf(stops, state),
      };
    });
}

/** The day the trip is on: today, else the next one, else the last. */
export function currentDay(days: Day[]): Day | undefined {
  return (
    days.find((d) => d.state === "today") ??
    days.find((d) => d.state === "future") ??
    days[days.length - 1]
  );
}

/** Where a set of stops are, in order, for the map. */
export const pointsOf = (stops: readonly Stop[]): LonLat[] =>
  stops.flatMap((s) => (s.at ? [s.at] : []));

/** Whether the trip is under way, still to come, or over. */
export function phaseOf(
  trip: { startsAt: string; endsAt: string },
  now: number = Date.now(),
): "now" | "soon" | "done" {
  if (Date.parse(trip.endsAt) < now) return "done";
  return Date.parse(trip.startsAt) <= now ? "now" : "soon";
}

/** The cards still waiting for an answer. */
export const waitingOf = (screen: TripScreen): Alert[] =>
  screen.alerts.alerts.filter((a) => a.outcome === null);

/** The detector families, each with how many stops it has matched. */
export function watchStrip(screen: TripScreen) {
  const count = (prefix: string) =>
    new Set(
      screen.matches
        .filter((m) => m.kind.startsWith(prefix))
        .map((m) => m.nodeId),
    ).size;
  return (
    [
      ["Weather", "weather"],
      ["Roads", "road"],
      ["Trains", "rail"],
      ["Events", "event"],
    ] as const
  ).map(([name, prefix]) => ({ name, count: count(prefix) }));
}
