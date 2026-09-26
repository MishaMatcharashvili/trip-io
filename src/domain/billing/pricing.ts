// What watching costs (context/progress-tracker.md, open question #4, decided
// 2026-09-26). Planning is free. The watch is bought one trip at a time; a
// traveller's first watched trip is free, and that is the whole trial.

export const WATCH_PRICE = {
  /** The early-adopter price actually charged. */
  cents: 500,
  /** Shown struck through beside it. */
  listCents: 5000,
  currency: "USD",
} as const;

export type WatchOffer =
  | { kind: "watched"; pass: "free" | "paid" }
  | { kind: "free" }
  | { kind: "paid"; cents: number; listCents: number; currency: string };

/**
 * What a traveller is offered for one trip: nothing, when it is already
 * watched; the free first watch, when they have never had a pass; otherwise
 * the price.
 */
export function watchOffer(input: {
  pass: "free" | "paid" | null;
  passesHeld: number;
}): WatchOffer {
  if (input.pass) return { kind: "watched", pass: input.pass };
  if (input.passesHeld === 0) return { kind: "free" };
  return {
    kind: "paid",
    cents: WATCH_PRICE.cents,
    listCents: WATCH_PRICE.listCents,
    currency: WATCH_PRICE.currency,
  };
}

export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
