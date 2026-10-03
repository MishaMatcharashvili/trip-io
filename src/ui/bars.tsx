import type { Sky } from "../domain/forecast.ts";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";
import { Eyebrow } from "./text";

const skyGlyph: Record<Sky, IconName> = {
  clear: "sun",
  partly: "partlyCloudy",
  cloudy: "cloud",
  fog: "fog",
  drizzle: "rain",
  rain: "rain",
  snow: "snow",
  storm: "bolt",
};

/** The sky as a glyph, for a place where there is no room for its name. */
export function SkyIcon({
  sky,
  size = 13,
  className,
}: {
  sky: Sky;
  size?: number;
  className?: string;
}) {
  return <Icon name={skyGlyph[sky]} size={size} className={className} />;
}

/**
 * The weather over one stop, small enough to sit under its time: a glyph and a
 * temperature. The name of the sky rides along as a tooltip and for screen
 * readers, since the glyph alone is a guess.
 */
export function StopWeatherTag({
  sky,
  label,
  temperature,
  alert = false,
  className,
}: {
  sky: Sky;
  label: string;
  temperature: number | null;
  /** Coral only when the weather matters here: wet, and the stop is outdoors. */
  alert?: boolean;
  className?: string;
}) {
  const text = temperature === null ? label : `${label}, ${temperature}°`;
  return (
    <span
      title={text}
      role="img"
      aria-label={text}
      className={cx(
        "mt-0.5 flex items-center gap-[3px] text-mini tabular-nums",
        alert ? "text-alert" : "text-ink-faint",
        className,
      )}
    >
      <SkyIcon sky={sky} size={12} />
      {temperature === null ? null : <span>{temperature}°</span>}
    </span>
  );
}

/** How far through the day you are. */
export function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cx("h-0.5 overflow-hidden rounded-sm bg-track", className)}>
      <div
        className="h-full rounded-sm bg-agent"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export type DaySegment = {
  /** Relative width — a long drive is wider than a coffee. */
  weight: number;
  tone: "filled" | "empty" | "agent" | "agent-soft" | "alert";
};

const segmentFills: Record<DaySegment["tone"], string> = {
  filled: "bg-fill-strong",
  empty: "bg-track",
  agent: "bg-agent",
  "agent-soft": "bg-agent-soft",
  alert: "bg-alert-bright",
};

/**
 * The shape of a day at a glance: blocks of committed time with the gaps
 * between them. It is what turns the seven-day table into something you can
 * read without opening a single day.
 */
export function DayShape({
  segments,
  className,
}: {
  segments: DaySegment[];
  className?: string;
}) {
  return (
    <div
      className={cx("flex h-[22px] items-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {segments.map((segment, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: positional bars, no identity of their own
          key={i}
          style={{ flex: segment.weight }}
          className={cx("h-[7px] rounded-sm", segmentFills[segment.tone])}
        />
      ))}
    </div>
  );
}

export type WeatherHour = {
  hour: string;
  /** 0–1. Drives the bar height; anything above the dry threshold is coral. */
  intensity: number;
};

/** The day in a line: "Partly cloudy · 12–23°C". */
export type WeatherSummary = {
  sky: Sky;
  label: string;
  low: number;
  high: number;
};

/**
 * The day's weather as an hourly ribbon, sitting directly above the itinerary
 * so a conflict is visible as a shape, not just as a sentence.
 */
export function WeatherRibbon({
  hours,
  caption,
  captionTone = "alert",
  summary,
  className,
}: {
  hours: WeatherHour[];
  caption: string;
  /** What the day is like, above the bars: the sky and the air's range. */
  summary?: WeatherSummary;
  /** Coral only when the caption reports weather that matters. */
  captionTone?: "alert" | "neutral";
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {summary ? (
        <div className="flex items-center gap-2 text-small font-medium">
          <SkyIcon sky={summary.sky} size={16} className="text-ink-muted" />
          <span>{summary.label}</span>
          <span className="ml-auto tabular-nums text-ink-muted">
            {summary.low === summary.high
              ? `${summary.high}°C`
              : `${summary.low}–${summary.high}°C`}
          </span>
        </div>
      ) : null}
      <div className="flex h-[26px] items-end gap-[3px]" aria-hidden="true">
        {hours.map((h) => {
          const wet = h.intensity > 0.05;
          const heavy = h.intensity > 0.45;
          return (
            <div
              key={h.hour}
              style={{ height: 9 + Math.round(h.intensity * 15) }}
              className={cx(
                "flex-1 rounded-sm",
                !wet && "bg-fill-strong",
                wet && !heavy && "bg-alert-soft",
                heavy && "bg-alert-bright",
              )}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <Eyebrow>{hours[0]?.hour}</Eyebrow>
        <Eyebrow tone={captionTone}>{caption}</Eyebrow>
        <Eyebrow>{hours[hours.length - 1]?.hour}</Eyebrow>
      </div>
    </div>
  );
}

/** A placeholder line for a day the agent has not finished composing. */
export function SkeletonLine({ width }: { width: string }) {
  return <div className="h-[9px] rounded-[3px] bg-track" style={{ width }} />;
}
