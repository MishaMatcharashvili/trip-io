import type { LiveMatch, TripScreen } from "../bll/trip-screen.ts";
import type { Checkpoint, Day, Source, Trip } from "../data/trip.ts";
import type { LonLat } from "../domain/geo.ts";
import { dayKey, nodeEnd, sortedNodes } from "../domain/trip/document.ts";
import { addDays } from "../domain/trip/generate/schedule.ts";
import { at, kindLabel } from "../domain/watch/briefing.ts";
import type { DaySegment } from "../ui/bars.tsx";
import type { MapStop } from "../ui/map/trip-map.tsx";

// A real trip in the shapes the screens were drawn against (src/data/trip.ts).
// The fixtures were written to mirror the schema so that this would be a swap
// of the loader: the screens keep their components, and this file is the whole
// of the difference between the canvas's Georgia trip and one out of the
// database. Pure — the clock is an argument.

const MIN = 60_000;

const weekdayShort = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "short",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "long",
  day: "numeric",
  month: "short",
});
const dayOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  day: "numeric",
});
const monthLong = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  month: "long",
});
const dayMonthShort = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  day: "numeric",
  month: "short",
});

/** Noon on a Tbilisi date: safe to format in any zone without slipping a day. */
const noon = (date: string) => new Date(`${date}T12:00:00+04:00`);

/** Every calendar day a trip spans, first to last, Tbilisi dates. */
export function tripDates(startsAt: string, endsAt: string): string[] {
  const first = dayKey(startsAt);
  const last = dayKey(endsAt);
  const dates: string[] = [];
  for (let d = first; d <= last && dates.length < 60; d = addDays(d, 1)) {
    dates.push(d);
  }
  return dates;
}

/** "14 – 20 September", or "28 Sep – 2 Oct" across a month. */
export function dateRange(startsAt: string, endsAt: string): string {
  const [a, b] = [noon(dayKey(startsAt)), noon(dayKey(endsAt))];
  if (monthLong.format(a) === monthLong.format(b)) {
    return `${dayOnly.format(a)} – ${dayOnly.format(b)} ${monthLong.format(b)}`;
  }
  return `${dayMonthShort.format(a)} – ${dayMonthShort.format(b)}`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/** "2 adults · 1 child", from the header's free-form party. */
export function partyLine(party: Record<string, unknown>): string {
  const adults = Number(party.adults ?? 1);
  const children = Number(party.children ?? 0);
  if (adults === 1 && children === 0) return "Travelling solo";
  const parts = [`${adults} adult${adults === 1 ? "" : "s"}`];
  if (children) parts.push(`${children} child${children === 1 ? "" : "ren"}`);
  return parts.join(" · ");
}

/** How long ago, in the words the watch strip uses. */
export function ago(instant: string | null, now: Date): string {
  if (!instant) return "not yet";
  const minutes = Math.round((now.getTime() - Date.parse(instant)) / MIN);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Stay titles are "Check in · Rooms Kazbegi"; the base is the place. */
const baseName = (title: string) => title.replace(/^Check in · /, "");

/** What a matched event says on the stop it touches. */
function conflictLine(match: LiveMatch): string {
  const from = at(match.validFrom);
  const until = match.validTo ? `–${at(match.validTo)}` : "";
  const what = match.kind.split(".")[1]?.replace(/_/g, " ") ?? "";
  return `${kindLabel(match.kind)}${what ? ` · ${what}` : ""} ${from}${until}`;
}

/** The detectors that exist, and those the plan has not built yet. */
const LIVE_DETECTORS = [
  { prefix: "weather", name: "Weather" },
  { prefix: "road", name: "Roads on your route" },
] as const;
const PLANNED_DETECTORS = [
  "Transport",
  "Opening hours",
  "Local events & safety",
];

function sources(screen: TripScreen, now: Date): Source[] {
  const checked = ago(screen.lastCheck, now);
  return [
    ...LIVE_DETECTORS.map(({ prefix, name }): Source => {
      const hits = screen.matches.filter((m) => m.kind.startsWith(prefix));
      const stops = new Set(hits.map((m) => m.nodeId)).size;
      return hits.length
        ? {
            name,
            tone: "alert",
            status: `${stops} stop${stops === 1 ? "" : "s"} affected · ${checked}`,
          }
        : {
            name,
            tone: screen.watch ? "ok" : "idle",
            status: screen.watch
              ? `Nothing on your stops · ${checked}`
              : "Starts when the trip has stops",
          };
    }),
    ...PLANNED_DETECTORS.map(
      (name): Source => ({ name, tone: "idle", status: "Not watched yet" }),
    ),
  ];
}

/** The detector ledger in the map's corner: live matches per family. */
export function detectorStrip(screen: TripScreen) {
  const count = (prefix: string) =>
    new Set(
      screen.matches
        .filter((m) => m.kind.startsWith(prefix))
        .map((m) => m.nodeId),
    ).size;
  const weather = count("weather");
  const roads = count("road");
  const open = screen.alerts.alerts.filter((a) => a.outcome === null).length;
  return [
    { name: "Weather", tone: weather ? "alert" : "ok", count: weather },
    { name: "Roads", tone: roads ? "alert" : "ok", count: roads },
    { name: "Open", tone: open ? "agent" : "ok", count: open },
  ] as const;
}

function daySegments(
  checkpoints: Checkpoint[],
  state: Day["state"],
): DaySegment[] {
  const segments: DaySegment[] = [];
  let cursor: number | null = null;
  for (const c of checkpoints) {
    if (!c.node) continue;
    const start = Date.parse(c.node.startsAt);
    if (cursor !== null && start - cursor > 20 * MIN) {
      segments.push({ weight: (start - cursor) / (60 * MIN), tone: "empty" });
    }
    const tone: DaySegment["tone"] = c.conflict
      ? "alert"
      : state === "today"
        ? c.state === "upcoming"
          ? "agent-soft"
          : "agent"
        : "filled";
    segments.push({ weight: Math.max(0.5, c.node.durationMin / 60), tone });
    cursor = start + c.node.durationMin * MIN;
  }
  return segments;
}

/** A real trip, shaped like the fixture the screens were built against. */
export function tripModel(screen: TripScreen, now: Date = new Date()): Trip {
  const { doc } = screen;
  const today = dayKey(now);
  const conflicts = new Map<string, LiveMatch>();
  for (const m of screen.matches) {
    if (!conflicts.has(m.nodeId)) conflicts.set(m.nodeId, m);
  }

  const nodes = sortedNodes(doc.nodes);
  const dates = tripDates(doc.trip.startsAt, doc.trip.endsAt);
  let base: string | null = null;

  const days = dates.map((date, i): Day => {
    const state: Day["state"] =
      date < today ? "past" : date === today ? "today" : "future";
    const mine = nodes.filter(({ node }) => dayKey(node.startsAt) === date);

    const checkpoints = mine.map(({ id, node }): Checkpoint => {
      const start = Date.parse(node.startsAt);
      const end = nodeEnd(node);
      const place = node.placeId ? screen.places[node.placeId] : undefined;
      const match = conflicts.get(id);
      const detail =
        node.kind === "transfer"
          ? `Drive · ${duration(node.durationMin)}`
          : node.kind === "stay"
            ? "Your base tonight"
            : [duration(node.durationMin), place?.category.replace(/_/g, " ")]
                .filter(Boolean)
                .join(" · ");
      return {
        id,
        time: at(node.startsAt),
        title: node.meta.title,
        detail,
        state:
          end <= now.getTime()
            ? "done"
            : start <= now.getTime()
              ? "now"
              : "upcoming",
        indoor: node.indoor,
        conflict: match ? conflictLine(match) : undefined,
        booked: node.meta.booked,
        node: {
          kind: node.kind,
          placeId: node.placeId,
          lonLat: (screen.positions[id] as LonLat | undefined) ?? null,
          startsAt: node.startsAt,
          durationMin: node.durationMin,
        },
      };
    });

    const previousBase = base;
    const stay = mine.findLast(({ node }) => node.kind === "stay");
    if (stay) base = baseName(stay.node.meta.title);
    const route =
      previousBase && base && previousBase !== base
        ? `${previousBase} → ${base}`
        : (base ?? checkpoints[0]?.title ?? "Free day");

    const visits = checkpoints
      .filter((c) => c.node?.kind === "visit")
      .map((c) => c.title);
    const conflicted = checkpoints.filter((c) => c.conflict).length;

    return {
      id: String(i + 1),
      index: i + 1,
      date,
      stamp: `D${i + 1} · ${weekdayShort.format(noon(date)).toUpperCase()} ${dayOnly.format(noon(date))}${state === "today" ? " · TODAY" : ""}`,
      title: dayMonth.format(noon(date)).replace(",", ""),
      route,
      summary: visits.slice(0, 2).join(" · ") || "Nothing planned",
      checkpoints,
      shape: daySegments(checkpoints, state),
      watch:
        state === "past"
          ? { tone: "idle", label: "Done" }
          : conflicted
            ? {
                tone: "alert",
                label: `${conflicted} to check`,
              }
            : screen.watch
              ? { tone: "ok", label: "Watching" }
              : { tone: "idle", label: "Planned" },
      state,
    };
  });

  const todayIndex = days.findIndex((d) => d.state === "today");
  const currentDay =
    todayIndex >= 0 ? todayIndex + 1 : today < dates[0] ? 1 : days.length;

  return {
    id: screen.id,
    title: doc.trip.title,
    dates: dateRange(doc.trip.startsAt, doc.trip.endsAt),
    party: partyLine(doc.trip.party),
    budget: doc.trip.budget ? `${doc.trip.budget} budget` : "No budget set",
    dayCount: days.length,
    currentDay,
    sourceCount: LIVE_DETECTORS.length,
    lastCheck: ago(screen.lastCheck, now),
    days,
    sources: sources(screen, now),
  };
}

/** A day's stops as the map draws them. */
export function mapStops(day: Day): MapStop[] {
  return day.checkpoints.flatMap((c) =>
    c.node?.lonLat
      ? [
          {
            id: c.id,
            lonLat: c.node.lonLat,
            label: c.title.replace(/^(Breakfast|Lunch|Coffee|Dinner) · /, ""),
            state: c.state,
            disrupted: Boolean(c.conflict),
          },
        ]
      : [],
  );
}

/** Every stop of the trip, for the whole-trip map. */
export function tripStops(trip: Trip): MapStop[] {
  return trip.days.flatMap(mapStops);
}
