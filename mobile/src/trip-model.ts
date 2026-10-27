import { dayKeyOf, dayStamp, duration, timeOf } from "./format.ts";

// A trip's days, stops and watch states, worked out from the server's read of
// the trip. Pure: it names no API and no screen, and takes only the parts of
// the read it uses, so the root package's tests can run it
// (src/mobile-trip.test.ts). The imports are relative for the same reason:
// Node resolves no "~/" alias.

export type LonLat = readonly [lon: number, lat: number];

/** What the model reads of a stop. */
export type ModelNode = {
  kind: string;
  placeId: string | null;
  startsAt: string;
  durationMin: number;
  indoor: boolean;
  meta: { title: string; booked?: boolean };
};

/** What the model reads of a pair the watch has judged. */
export type ModelMatch = {
  nodeId: string;
  kind: string;
  validFrom: string;
  validTo: string | null;
};

/** What the model reads of `/trips/:id/screen`. */
export type ModelScreen<N extends ModelNode, P> = {
  doc: { nodes: Record<string, N> };
  matches: readonly ModelMatch[];
  places: Record<string, P>;
  positions: Record<string, readonly number[]>;
  watch: unknown;
};

export type Stop<N extends ModelNode = ModelNode, P = unknown> = {
  id: string;
  node: N;
  /** "16:00". */
  time: string;
  state: "done" | "now" | "next";
  /** What the watch has matched on this stop, in words, or null. */
  conflict: string | null;
  place: P | null;
  at: LonLat | null;
};

export type Segment = {
  weight: number;
  tone: "filled" | "empty" | "agent" | "agent-soft" | "alert";
};

export type Day<N extends ModelNode = ModelNode, P = unknown> = {
  /** YYYY-MM-DD in Tbilisi. */
  key: string;
  /** 1 for the first day with stops. */
  index: number;
  /** "D3 · Tue 16". */
  stamp: string;
  summary: string;
  state: "past" | "today" | "future";
  stops: Stop<N, P>[];
  watch: { tone: "agent" | "alert" | "ok" | "idle"; label: string };
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
export function conflictLine(match: ModelMatch): string {
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

function segmentsOf(stops: readonly Stop[], state: Day["state"]): Segment[] {
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

const lonLat = (at: readonly number[] | undefined): LonLat | null =>
  at && at.length >= 2 ? [at[0], at[1]] : null;

/** The days that have stops, in order, each with its stops in time order. */
export function daysOf<N extends ModelNode, P>(
  screen: ModelScreen<N, P>,
  now: number = Date.now(),
): Day<N, P>[] {
  const today = dayKeyOf(now);
  const byDay = new Map<string, Stop<N, P>[]>();
  for (const [id, node] of Object.entries(screen.doc.nodes)) {
    const start = Date.parse(node.startsAt);
    const end = start + node.durationMin * MIN;
    const match = screen.matches.find((m) => m.nodeId === id);
    const key = dayKeyOf(node.startsAt);
    const stop: Stop<N, P> = {
      id,
      node,
      time: timeOf(node.startsAt),
      state: end <= now ? "done" : start <= now ? "now" : "next",
      conflict: match ? conflictLine(match) : null,
      place: node.placeId ? (screen.places[node.placeId] ?? null) : null,
      at: lonLat(screen.positions[id]),
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
export function currentDay<D extends Day>(days: readonly D[]): D | undefined {
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

export type { Day as ModelDay, Stop as ModelStop };
