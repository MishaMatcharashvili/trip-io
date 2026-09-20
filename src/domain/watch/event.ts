import { z } from "zod";

// A world event: one thing that happened, or is forecast to happen, somewhere,
// during some window. Every detector normalizes to this shape (stage 2 of the
// pipeline in docs/watch-layer.md) so the match query, the judge and the router
// never learn which source produced a row.
//
// The vocabulary is CAP's (Common Alerting Protocol) — `severity`, `certainty`
// as a number, `onset`/`expires` as `validFrom`/`validTo` — because that is
// already the standard for this problem, and because a real alert feed for
// Georgia, if one ever appears, then drops straight in.

export const severities = ["minor", "moderate", "severe", "extreme"] as const;
export type Severity = (typeof severities)[number];

/** Ordering, for "at least this bad" comparisons. `minor` is 0. */
export const severityRank = (s: Severity) => severities.indexOf(s);

export const atLeast = (s: Severity, floor: Severity) =>
  severityRank(s) >= severityRank(floor);

// Namespaced by detector. The prefix is what `radiusFor` dials on, so a kind
// added later gets a radius decision made deliberately rather than inherited.
export const weatherKinds = [
  "weather.rain",
  "weather.snow",
  "weather.wind",
  "weather.thunderstorm",
  "weather.heat",
  "weather.cold",
  "weather.fog",
] as const;
export type WeatherKind = (typeof weatherKinds)[number];

export const eventKinds = [...weatherKinds] as const;
export type EventKind = (typeof eventKinds)[number];

const isoInstant = z.iso.datetime({ offset: true });

/**
 * What a detector produces. It carries no geometry: a detector senses per
 * region (that is the inversion the whole cost model rests on), so the area is
 * the region it was asked about and the repository resolves it — `src/dal` is
 * the only layer that touches PostGIS.
 */
export const eventDraft = z
  .object({
    source: z.string().min(1),
    kind: z.enum(eventKinds),
    severity: z.enum(severities),
    /** How much to trust it. Falls off with forecast lead time. */
    confidence: z.number().min(0).max(1),
    validFrom: isoInstant,
    validTo: isoInstant,
    /** Everything the judge is allowed to cite, and nothing it isn't. */
    payload: z.record(z.string(), z.unknown()),
  })
  .refine((e) => Date.parse(e.validFrom) < Date.parse(e.validTo), {
    message: "an event ends before it starts",
  });
export type EventDraft = z.infer<typeof eventDraft>;

/** A draft plus where it applies: what a repository writes. */
export type WorldEvent = EventDraft & {
  regionSlug: string;
  observedAt: string;
  dedupeKey: string;
};

/**
 * How far from a node an event still counts. The single dial on the model
 * bill: every metre here multiplies matched pairs, and matched pairs are the
 * only stage that calls a model.
 *
 * Weather events already carry a whole municipality as their geometry, so this
 * is only the slop beyond the region boundary — weather does not stop at an
 * administrative line, but it does not reach the next valley either.
 */
export const radiusFor = (kind: EventKind): number => {
  switch (kind) {
    // Convective and local: a thunderstorm cell is kilometres across, and rain
    // on one side of a ridge says little about the other.
    case "weather.thunderstorm":
    case "weather.fog":
      return 5_000;
    case "weather.rain":
    case "weather.snow":
    case "weather.wind":
      return 10_000;
    // Synoptic: a heatwave covers the whole of Kartli at once.
    case "weather.heat":
    case "weather.cold":
      return 25_000;
  }
};

/**
 * Bucket width for `dedupe_key`. The sense loop runs hourly and re-forecasts
 * the same weather each time; without a bucket, a start time that wobbles by an
 * hour between runs would write a second row for the same rain. Three hours is
 * wide enough to absorb that wobble and narrow enough that a morning event and
 * an evening one stay distinct.
 */
export const DEDUPE_BUCKET_MS = 3 * 60 * 60 * 1000;

export function bucketStart(instant: string, bucketMs = DEDUPE_BUCKET_MS) {
  const t = Date.parse(instant);
  return new Date(Math.floor(t / bucketMs) * bucketMs).toISOString();
}

/**
 * `source + kind + region + bucketed valid_from`, as specced. Unique in the
 * database: a re-forecast updates the row it already wrote (severity,
 * confidence and the window all move as the forecast firms up) instead of
 * matching the same weather against the same node a second time.
 */
export function dedupeKey(
  event: Pick<EventDraft, "source" | "kind" | "validFrom">,
  regionSlug: string,
): string {
  return [
    event.source,
    event.kind,
    regionSlug,
    bucketStart(event.validFrom),
  ].join("|");
}

export function toWorldEvent(
  draft: EventDraft,
  regionSlug: string,
  observedAt: string,
): WorldEvent {
  return {
    ...draft,
    regionSlug,
    observedAt,
    dedupeKey: dedupeKey(draft, regionSlug),
  };
}
