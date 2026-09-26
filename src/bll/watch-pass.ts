import { randomUUID } from "node:crypto";
import { insertPass, type PassRow, passesOf, passFor } from "../dal/passes.ts";
import {
  WATCH_PRICE,
  type WatchOffer,
  watchOffer,
} from "../domain/billing/pricing.ts";

// The paywall: planning is free, the watch is bought per trip, the first one
// free. Checkout is a stand-in until Flitt is wired — it records a paid pass
// with provider "demo" and charges nobody, and says so on the screen.

export type { PassRow, WatchOffer };

/** What this traveller is offered for this trip. Access is the caller's. */
export async function offerFor(
  tripId: string,
  userId: string,
): Promise<WatchOffer> {
  const [pass, held] = await Promise.all([passFor(tripId), passesOf(userId)]);
  return watchOffer({ pass: pass?.kind ?? null, passesHeld: held.length });
}

export type StartResult =
  | { ok: true; pass: "free" | "paid" }
  | { ok: false; reason: "payment-required" | "already-watched" };

/** Start watching on the free first pass, when it is still theirs to take. */
export async function startFreeWatch(
  tripId: string,
  userId: string,
): Promise<StartResult> {
  const offer = await offerFor(tripId, userId);
  if (offer.kind === "watched") return { ok: false, reason: "already-watched" };
  if (offer.kind !== "free") return { ok: false, reason: "payment-required" };
  const granted = await insertPass({
    tripId,
    userId,
    kind: "free",
    amountCents: 0,
    currency: WATCH_PRICE.currency,
    provider: null,
  });
  return granted
    ? { ok: true, pass: "free" }
    : { ok: false, reason: "already-watched" };
}

/**
 * The demo checkout: a paid pass at the current price, recorded as taken by
 * "demo". Replaced by a Flitt order and its callback when payments go live.
 */
export async function demoCheckout(
  tripId: string,
  userId: string,
): Promise<StartResult> {
  const offer = await offerFor(tripId, userId);
  if (offer.kind === "watched") return { ok: false, reason: "already-watched" };
  const granted = await insertPass({
    tripId,
    userId,
    kind: "paid",
    amountCents: WATCH_PRICE.cents,
    currency: WATCH_PRICE.currency,
    provider: "demo",
    providerRef: `demo-${randomUUID()}`,
  });
  return granted
    ? { ok: true, pass: "paid" }
    : { ok: false, reason: "already-watched" };
}

/** A traveller's passes, for the plans screen. */
export function passesHeldBy(userId: string): Promise<PassRow[]> {
  return passesOf(userId);
}
