import {
  MAX_STOPS,
  type RouteAlternative,
  type RouteAnswer,
  type RouteRequestInput,
} from "./contract.ts";

// A route through more stops than one request takes, and the same question
// asked twice, recognised as the same.

/**
 * Splits stops into consecutive requests that share their boundary stop, so
 * the roads join where one ends and the next begins. Order is preserved and no
 * stop is dropped; a trip that fits is one request.
 */
export function chunkStops<T>(stops: readonly T[]): T[][] {
  if (stops.length < 2) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < stops.length - 1; i += MAX_STOPS - 1) {
    chunks.push(stops.slice(i, i + MAX_STOPS));
  }
  return chunks;
}

/**
 * A stable name for a question: what changes it is what changes the answer.
 * Coordinates to six decimals (about ten centimetres), so an unchanged stop
 * never looks like a new one.
 */
export function routeSignature(request: RouteRequestInput): string {
  return JSON.stringify([
    request.mode ?? "drive",
    request.departure ?? "now",
    request.alternatives ?? false,
    request.stops.map((s) => [
      s.lonLat[0].toFixed(6),
      s.lonLat[1].toFixed(6),
      s.googlePlaceId ?? null,
    ]),
  ]);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * The answers to consecutive chunks as the one route they make together. The
 * legs are laid end to end in order; totals add up. Alternatives cannot be
 * joined (they belong to a single request), so only the first choice of each
 * chunk goes into the whole.
 */
export function joinAnswers(answers: readonly RouteAnswer[]): RouteAnswer {
  if (answers.length === 1) return answers[0];
  const parts = answers.map((a) => a.routes[0]);
  const staticKnown = parts.every((p) => p.staticDurationS !== null);
  const route: RouteAlternative = {
    distanceM: sum(parts.map((p) => p.distanceM)),
    durationS: sum(parts.map((p) => p.durationS)),
    staticDurationS: staticKnown
      ? sum(parts.map((p) => p.staticDurationS as number))
      : null,
    path: parts.flatMap((p) => p.path),
    legs: parts.flatMap((p) => p.legs),
    description: null,
    labels: [],
    warnings: [...new Set(parts.flatMap((p) => p.warnings))],
  };
  const traffic = new Set(answers.map((a) => a.traffic));
  return {
    routes: [route],
    mode: answers[0].mode,
    traffic: traffic.size === 1 ? answers[0].traffic : "live",
    // The oldest part decides how stale the whole is.
    computedAt: answers.map((a) => a.computedAt).sort()[0],
    fallback: answers.find((a) => a.fallback)?.fallback ?? null,
  };
}
