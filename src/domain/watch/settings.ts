import type { QuietHours } from "./route.ts";

// What a watch is set to when the traveller has not said otherwise. These are
// the numbers the budget enforcer spends, so they live in the domain where a
// test can hold them, not as defaults scattered through an INSERT.

/**
 * Night in Tbilisi. An alert that arrives at 03:00 is not more useful for
 * having arrived sooner; it is a disruption the product caused rather than
 * reported.
 */
export const DEFAULT_QUIET_HOURS: QuietHours = { start: "22:00", end: "08:00" };

/** Every way a watch can reach someone. Mirrors `delivery_channel`. */
export const channels = ["push", "email", "briefing"] as const;
export type Channel = (typeof channels)[number];

/** "HH:MM", 24-hour, Tbilisi — the only clock the product tells time on. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The one channel that exists until Phase 4, and the one that stays safe after
 * it: the briefing costs the traveller nothing to receive.
 */
export const DEFAULT_CHANNELS = ["briefing"] as const;

/**
 * How many times a trip may be interrupted, ever. Roughly one every other day,
 * held between 2 and 6 — the plan's "3–5 for a 7-day trip", written so that a
 * weekend and a fortnight both get a sensible number.
 *
 * The cap is a budget, not a target. Its job is to make the system choose: with
 * four to spend over a week, the fifth merely-interesting thing has to lose to
 * something better, and that competition is the whole product.
 */
export const capForDays = (days: number): number =>
  Math.max(2, Math.min(6, Math.round(days * 0.6)));

/** Whole days a trip spans, counted inclusively. */
export const tripDays = (startsAt: string, endsAt: string): number =>
  Math.max(
    1,
    Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / 86_400_000),
  );

export type WatchDefaults = {
  channels: readonly string[];
  quietHours: QuietHours;
  cap: number;
};

/** What a trip's watch is set to the first time it is written. */
export const watchDefaults = (header: {
  startsAt: string;
  endsAt: string;
}): WatchDefaults => ({
  channels: DEFAULT_CHANNELS,
  quietHours: DEFAULT_QUIET_HOURS,
  cap: capForDays(tripDays(header.startsAt, header.endsAt)),
});
