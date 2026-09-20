import type { EventKind } from "./event.ts";
import type { Verdict } from "./judge.ts";

// Stage 5, and the stage most teams never build. Two channels, one test between
// them: does this require action in the next two hours? Everything else waits
// for 07:30, where it costs the traveller nothing to read.
//
// It is a pure function on purpose. The decision to wake someone up is the one
// piece of this system that most deserves a unit test, and a decision buried in
// a delivery handler cannot have one.
//
// Every path out is returned with its reason, including `drop`. A dropped
// verdict nobody ever sees is how a silent ranker regression goes unnoticed for
// a month — the reason is written to `event_match.route_reason` and counted.

export const routes = ["interrupt", "briefing", "drop"] as const;
export type Route = (typeof routes)[number];

/** Above two hours, tomorrow's briefing is soon enough by definition. */
export const INTERRUPT_HORIZON_HRS = 2;

/**
 * Below this, the verdict goes to the briefing however urgent it claims to be.
 * A wrong interrupt costs far more trust than a late one — the asymmetry that
 * the whole two-channel design exists to exploit.
 */
export const INTERRUPT_MIN_CONFIDENCE = 0.7;

/**
 * A detector may not wake anyone up until it has run a week on briefing-only
 * and had its verdicts hand-audited. Written as a set rather than left as a
 * process rule, because a process rule is what gets forgotten the week a new
 * detector looks like it is working.
 *
 * Phase 3 delivers nothing at all, so this is empty by construction: the
 * weather detector graduates by being added here, deliberately, in Phase 5.
 */
export const INTERRUPT_ELIGIBLE: ReadonlySet<EventKind> = new Set();

export type QuietHours = {
  /** "HH:MM", Tbilisi. May wrap past midnight. */
  start: string;
  end: string;
};

export type Ledger = {
  /** Interrupts already sent for this trip. */
  sentSoFar: number;
  /** The per-trip cap: 3–5 for a week, set when the watch is written. */
  cap: number;
};

export type WatchSettings = {
  channels: readonly string[];
  quietHours: QuietHours | null;
};

export const routeReasons = [
  "not-relevant",
  "no-impact",
  "briefing-only-detector",
  "beyond-horizon",
  "low-confidence",
  "budget-spent",
  "quiet-hours",
  "no-interrupt-channel",
  "urgent",
] as const;
export type RouteReason = (typeof routeReasons)[number];

export type Routing = { route: Route; reason: RouteReason };

const TBILISI_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes past local midnight in Tbilisi. The trip's clock, not the server's. */
export const localMinutes = (now: Date) => toMinutes(TBILISI_CLOCK.format(now));

/** Handles the usual case, where the window wraps past midnight. */
export function inQuietHours(now: Date, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  const at = localMinutes(now);
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  return start <= end ? at >= start && at < end : at >= start || at < end;
}

export type RouteInput = {
  verdict: Verdict;
  kind: EventKind;
  /**
   * The detector's own confidence, which the model never sees and cannot talk
   * itself past. A model certain about a thunderstorm forecast two days out is
   * certain about a guess.
   */
  eventConfidence: number;
  ledger: Ledger;
  watch: WatchSettings;
  now: Date;
  /**
   * Which detectors have graduated. Defaults to `INTERRUPT_ELIGIBLE`; passed
   * explicitly only by the tests and the eval harness, which have to be able to
   * exercise the gates behind it.
   */
  interruptEligible?: ReadonlySet<EventKind>;
};

export function route({
  verdict,
  kind,
  eventConfidence,
  ledger,
  watch,
  now,
  interruptEligible = INTERRUPT_ELIGIBLE,
}: RouteInput): Routing {
  if (!verdict.relevant) return { route: "drop", reason: "not-relevant" };
  // Belt and braces with checkVerdict's `empty-helpful` guard: a verdict that
  // reaches here having been repaired rather than rejected still must not send.
  if (verdict.impact === "none") return { route: "drop", reason: "no-impact" };

  const briefing = (reason: RouteReason): Routing => ({
    route: "briefing",
    reason,
  });

  if (!interruptEligible.has(kind)) return briefing("briefing-only-detector");
  if (verdict.horizonHrs > INTERRUPT_HORIZON_HRS) {
    return briefing("beyond-horizon");
  }
  if (
    Math.min(verdict.confidence, eventConfidence) < INTERRUPT_MIN_CONFIDENCE
  ) {
    return briefing("low-confidence");
  }
  if (ledger.sentSoFar >= ledger.cap) return briefing("budget-spent");
  if (inQuietHours(now, watch.quietHours)) return briefing("quiet-hours");
  if (!watch.channels.includes("push")) {
    return briefing("no-interrupt-channel");
  }
  return { route: "interrupt", reason: "urgent" };
}
