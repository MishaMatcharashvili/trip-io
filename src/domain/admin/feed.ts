import { NEWS_SOURCES } from "../watch/sources.ts";

// How the operator's panel names what the pipeline ingests. Pure: the panel
// reads rows from `source_item` and `world_event` and these functions say, in
// words, which channel a row came in on and what it says.

export type Channel =
  | "news"
  | "weather"
  | "roads"
  | "rail"
  | "hours"
  | "events"
  | "safety";

export const CHANNEL_LABELS: Record<Channel, string> = {
  news: "News article",
  weather: "Weather forecast",
  roads: "Road report",
  rail: "Rail report",
  hours: "Opening hours",
  events: "Local event",
  safety: "Safety notice",
};

/** The event sources the pipeline writes itself, by the id `world_event.source` carries. */
const EVENT_SOURCES: Record<string, string> = {
  "open-meteo": "Open-Meteo forecast",
  "road-report": "Road reports (Telegram, Roads Department)",
  "rail-report": "Rail reports (Telegram)",
  "hours-report": "Opening-hours reports",
  "news-events": "News: events detector",
  "news-safety": "News: safety detector",
  // Not a news feed: the Roads Department's own notices, read by a model.
  georoad: "Roads Department (georoad.ge)",
};

/**
 * The channel an event came in on, from its kind rather than its source: the
 * kind's prefix is the detector's (`event.` and `safety.` are the news
 * detectors'), where `source` has named an outlet as well as a detector.
 */
export function channelOfEvent(kind: string): Channel {
  switch (kind.split(".")[0]) {
    case "weather":
      return "weather";
    case "road":
      return "roads";
    case "rail":
      return "rail";
    case "hours":
      return "hours";
    case "safety":
      return "safety";
    default:
      return "events";
  }
}

/** A source id as a person reads it: an outlet's name, or what the detector is. */
export function sourceLabel(source: string): string {
  return (
    NEWS_SOURCES.find((s) => s.id === source)?.name ??
    EVENT_SOURCES[source] ??
    source
  );
}

/**
 * The line an event is shown under. Detectors that write a sentence
 * (`summary`) are quoted; a forecast has none, so it is built from what it
 * measured.
 */
export function eventSummary(
  kind: string,
  payload: Record<string, unknown>,
): string {
  if (typeof payload.summary === "string" && payload.summary !== "") {
    return payload.summary;
  }
  if (typeof payload.metric === "string" && typeof payload.peak === "number") {
    const unit = typeof payload.unit === "string" ? payload.unit : "";
    const hours = typeof payload.hours === "number" ? payload.hours : null;
    const peak = `${Math.round(payload.peak * 10) / 10}${unit ? ` ${unit}` : ""}`;
    return `${kind.replace(/^weather\./, "")}: ${payload.metric} peaks at ${peak}${hours ? ` over ${hours} h` : ""}`;
  }
  return kind;
}

export type Liveness = "upcoming" | "active" | "expired";

/** Where an event's validity window is, relative to `now`. An open end never expires. */
export function liveness(
  validFrom: string,
  validTo: string | null,
  now: Date,
): Liveness {
  if (Date.parse(validFrom) > +now) return "upcoming";
  if (validTo !== null && Date.parse(validTo) < +now) return "expired";
  return "active";
}

/** The outlets that reported the same claim, for the table's "corroborated by" cell. */
export function outletNames(payload: Record<string, unknown>): string[] {
  const outlets = payload.outlets;
  if (!Array.isArray(outlets)) return [];
  const names = outlets.flatMap((o) =>
    o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string"
      ? [sourceLabel((o as { id: string }).id)]
      : [],
  );
  return [...new Set(names)];
}
