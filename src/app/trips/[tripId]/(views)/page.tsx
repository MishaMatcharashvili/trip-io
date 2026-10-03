import type { Metadata } from "next";
import { interventionCard } from "@/bll/interventions";
import { offerFor } from "@/bll/watch-pass";
import {
  advisory,
  calmStrip,
  type Day,
  georgiaMapStops,
  getTrip,
  opportunity,
  type Trip,
  todayWeather,
  watchStrip,
} from "@/data/trip";
import type { LonLat } from "@/domain/geo";
import { dayKey } from "@/domain/trip/document";
import { chipsFor } from "@/features/day-strip-model";
import { forecastRibbon } from "@/features/shared-reads";
import { withStopWeather } from "@/features/stop-weather";
import { dayHref } from "@/features/trip-links";
import { type StopCard, TripMapScreen } from "@/features/trip-map-screen";
import {
  ago,
  changeRows,
  detectorStrip,
  duration,
  mapStops,
  timeRange,
  tripStops,
  weatherView,
} from "@/features/trip-model";
import { type LoadedTrip, loadTrip, pickDay } from "../load";
import { ActiveTripDesktop } from "./desktop";
import { ActiveTripMobile } from "./mobile";
import { parseState } from "./state";
import type { OverviewView } from "./view";

export const metadata: Metadata = { title: "Map" };

/** An applied change keeps its undo in view this long. */
const APPLIED_WINDOW_MS = 24 * 3_600_000;

const kindWords: Record<string, string> = {
  visit: "Visit",
  meal: "Meal",
  transfer: "Drive",
  stay: "Stay",
};

function stopCards(trip: Trip, day: Day, alertHref?: string): StopCard[] {
  return day.checkpoints.map((c) => ({
    id: c.id,
    title: c.title,
    time: c.node ? timeRange(c.node) : c.time,
    duration: c.node ? duration(c.node.durationMin) : (c.detail ?? ""),
    kind: c.node ? kindWords[c.node.kind] : c.indoor ? "Indoors" : "Outdoors",
    conflict: c.conflict,
    href: `/trips/${trip.id}/place/${c.id}`,
    alertHref: c.conflict ? alertHref : undefined,
  }));
}

/** The canvas's Georgia trip: the reference render `/design` links to. */
function fixtureView(
  trip: Trip,
  rawState: string | string[] | undefined,
  wantedDay: string | undefined,
) {
  const state = parseState(rawState);
  const all = wantedDay === "all";
  // The calm state is a different day on purpose: day 5 is what most days look
  // like, and the screen has to look deliberate rather than empty.
  const day =
    trip.days.find((d) => d.id === wantedDay) ??
    trip.days[state === "calm" ? 4 : 2];
  const view: OverviewView = {
    trip,
    day,
    state: state === "paused" ? "advisory" : state,
    forcePaused: state === "paused",
    advisory: { ...advisory, href: `/trips/${trip.id}/replan` },
    opportunity: state === "advisory" ? opportunity : null,
    applied: {
      eyebrow: "Day updated · 2 changes applied",
      headline: "Your afternoon is out of the rain",
      rows: [
        { from: "16:00 hike", to: "11:30 hike" },
        { from: "12:30 lunch", to: "14:45 lunch" },
      ],
      note: "Zeta Camp has been notified of the new time. Nothing else moved.",
      undoTripId: null,
      until: "Revert until 15:52 tomorrow",
    },
    weather:
      state === "calm"
        ? null
        : { hours: todayWeather, caption: "Rain 15:30–19:00" },
    strip: state === "calm" ? calmStrip : watchStrip,
    suggestions:
      state === "advisory"
        ? ["Is the hike ok for my father?", "Indoor options near Kazbegi"]
        : [],
    askTripId: null,
    offer: null,
    nextSweep: "Next full sweep at 15:00",
    calmHeadline: "Today is going to plan",
    calmNote:
      "Checked everything on your route since 06:00 — nothing changes your day. I will interrupt you if that stops being true.",
    pausedSources: [
      { name: "Weather", seen: "Last seen 13:04" },
      { name: "Roads", seen: "Last seen 13:01" },
      { name: "Transport", seen: "Last seen 12:48" },
      { name: "Local events", seen: "Last seen 12:20" },
    ],
    days: chipsFor(trip.days),
    selected: all ? "all" : day.id,
    mode: all ? "all" : "day",
    addStopHref: dayHref(trip.id, day.id),
    next: { time: "15:10", label: "38 km left" },
  };
  return {
    view,
    stops: georgiaMapStops,
    route: undefined,
    cards: all
      ? trip.days.flatMap((d) => stopCards(trip, d))
      : stopCards(trip, trip.days[2]),
    events: [],
  };
}

async function realView(
  { screen, trip, userId }: LoadedTrip,
  wantedDay: string | undefined,
  ask: string | undefined,
  now: Date,
) {
  const offer = await offerFor(trip.id, userId);
  // "All": every day on the map at once. The panel and the sheet still need a
  // day for what is about today (the next stop, the calm note), so the trip's
  // current one stands in for them.
  const all = wantedDay === "all";
  const chosen = all
    ? trip.days[trip.currentDay - 1]
    : (pickDay(trip, wantedDay) ?? trip.days[trip.currentDay - 1]);
  // The weather under each stop's time, where the forecast reaches.
  const day = await withStopWeather(chosen, dayKey(now));
  const stops = all ? tripStops(trip) : mapStops(day);

  // The newest thing still waiting for an answer, if any: the advisory card.
  const open = screen.alerts.alerts.find((a) => a.outcome === null);
  const card = open ? await interventionCard(open.id, userId) : null;
  const alertHref = open ? `/trips/${trip.id}/alerts/${open.id}` : undefined;

  // The change the watch applied in the last day, with its undo.
  const head = screen.history[0];
  const applied =
    head?.author === "intervention" &&
    screen.before &&
    now.getTime() - Date.parse(head.appliedAt) < APPLIED_WINDOW_MS
      ? changeRows(screen.before, screen.doc)
      : null;

  const centre =
    stops.length && !all
      ? ([
          stops.reduce((s, p) => s + p.lonLat[0], 0) / stops.length,
          stops.reduce((s, p) => s + p.lonLat[1], 0) / stops.length,
        ] as LonLat)
      : null;
  const forecast =
    centre && day.date ? await forecastRibbon(centre, day.date) : null;

  const next = day.checkpoints.find((c) => c.state === "upcoming");
  const checked = ago(screen.lastCheck, now);

  const view: OverviewView = {
    trip,
    day,
    state:
      card?.ok && card.card.canAnswer
        ? "advisory"
        : applied
          ? "applied"
          : "calm",
    forcePaused: false,
    advisory:
      card?.ok && alertHref
        ? {
            id: card.card.id,
            kind: card.card.kind,
            route: card.card.channel === "push" ? "interrupt" : "briefing",
            receivedAt: open?.sentAt
              ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Tbilisi",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(open.sentAt))
              : "",
            headline: card.card.headline,
            changed: card.card.changed,
            affects: card.card.affects,
            suggestion: card.card.suggestion ?? "Open it to see the change.",
            evidence: card.card.evidence,
            href: alertHref,
            interventionId: card.card.id,
          }
        : null,
    opportunity: null,
    applied:
      applied && head
        ? {
            eyebrow: `Day updated · ${applied.length} change${applied.length === 1 ? "" : "s"} applied`,
            headline: head.intent,
            rows: applied,
            note: "Nothing else in your plan moved.",
            undoTripId: trip.id,
            until: `Applied ${ago(head.appliedAt, now)}`,
          }
        : null,
    weather: forecast ? weatherView(forecast) : null,
    strip: detectorStrip(screen),
    suggestions: ["What is indoors today?", "Which is my longest drive?"],
    askTripId: trip.id,
    initialQuestion: ask,
    offer: offer.kind === "watched" ? null : offer,
    nextSweep: screen.watch
      ? "The weather is checked every hour"
      : "Watching starts once the trip has stops",
    calmHeadline:
      day.state === "today"
        ? "Today is going to plan"
        : day.state === "past"
          ? "This day is behind you"
          : "Nothing changes this day yet",
    calmNote: !screen.watch
      ? "Add stops and I will start watching the weather and roads around them."
      : screen.lastCheck
        ? `${screen.alerts.checks.toLocaleString("en-GB")} checks on your route, the last ${checked}: nothing changes your plan. I will interrupt you if that stops being true.`
        : "I watch the weather and roads around every stop, and the first check runs within the hour. I will interrupt you if something changes your plan.",
    pausedSources: trip.sources
      .filter((s) => s.tone !== "idle")
      .map((s) => ({
        name: s.name,
        seen: screen.lastCheck ? `Last checked ${checked}` : "Not checked yet",
      })),
    days: chipsFor(trip.days),
    selected: all ? "all" : day.id,
    mode: all ? "all" : "day",
    addStopHref: dayHref(trip.id, day.id, { add: true }),
    next: next ? { time: next.time, label: "Next stop" } : null,
  };

  return {
    view,
    stops,
    cards: all
      ? trip.days.flatMap((d) => stopCards(trip, d, alertHref))
      : stopCards(trip, day, alertHref),
    events: screen.events,
  };
}

export default async function ActiveTripPage({
  params,
  searchParams,
}: PageProps<"/trips/[tripId]">) {
  const { tripId } = await params;
  const { state, day, ask } = await searchParams;

  const fixture = getTrip(tripId);
  const { view, stops, cards, events } = fixture
    ? fixtureView(fixture, state, typeof day === "string" ? day : undefined)
    : await realView(
        await loadTrip(tripId),
        typeof day === "string" ? day : undefined,
        typeof ask === "string" ? ask.slice(0, 300) : undefined,
        new Date(),
      );

  return (
    // The bars are the layout's; the map is the canvas, and everything else
    // floats over it.
    <div className="relative flex-1 overflow-hidden">
      <TripMapScreen
        stops={stops}
        events={events}
        cards={cards}
        // One road for one day: across the whole trip it would join the days.
        routed={view.mode === "day"}
        dimmed={view.forcePaused}
      />
      <ActiveTripDesktop view={view} />
      <ActiveTripMobile view={view} />
    </div>
  );
}
